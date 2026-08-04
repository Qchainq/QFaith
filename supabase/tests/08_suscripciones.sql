-- Suscripciones y acceso de pago.
--
-- Esta batería cierra el círculo que abrió la migración 0017: allí el
-- contenido de pago quedó cerrado con una función que devolvía siempre `false`
-- porque no existía forma de pagarlo. Aquí se comprueba que ahora se abre —y
-- que se abre **solo** cuando debe.
--
-- La regla de la que depende todo: **el cliente no escribe su suscripción.**
-- Si pudiera, cualquiera se concedería acceso de pago con una petición.

\set ON_ERROR_STOP on

-- ── Reparto ──────────────────────────────────────────────────────────────
--
-- Nuria paga. Andrés no. Datos ficticios (invariante 15).

insert into auth.users (id, email) values
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'nuria@ejemplo.invalid'),
  ('cccccccc-3333-4333-8333-cccccccccccc', 'andres@ejemplo.invalid');

insert into public.reading_plans
  (id, creator_type, title, language_code, duration_days, is_premium, is_published)
values ('dddd1111-0000-4000-8000-000000000001', 'qfaith',
        'Treinta días sobre el perdón', 'es', 30, true, true);

insert into public.reading_plan_days (plan_id, day_number, title, bible_references)
values ('dddd1111-0000-4000-8000-000000000001', 1, 'Setenta veces siete', '[]'::jsonb);

-- ── Sin suscripción no hay acceso de pago ────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-3333-4333-8333-cccccccccccc', false);

do $$
begin
  if public.fn_tiene_acceso_premium() then
    raise exception 'Quien no ha pagado no debería tener acceso de pago';
  end if;
  if (select count(*) from public.reading_plans
      where id = 'dddd1111-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALLO GRAVE: un plan de pago es visible sin suscripción';
  end if;
end $$;

-- ── El cliente no puede concederse acceso ────────────────────────────────

do $$
begin
  begin
    insert into public.subscriptions (user_id, provider, plan_code, status)
    values ('cccccccc-3333-4333-8333-cccccccccccc', 'manual', 'anual', 'active');
    raise exception 'FALLO GRAVE: el cliente puede darse de alta una suscripción';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Nuria paga: el proceso de servidor escribe la fila ───────────────────

reset role;
insert into public.subscriptions
  (id, user_id, provider, provider_subscription_reference, plan_code, status,
   current_period_start, current_period_end)
values (
  'eeee1111-0000-4000-8000-000000000001',
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  'apple', 'referencia-opaca-de-apple', 'anual', 'active',
  now() - interval '1 day', now() + interval '364 days'
);

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if not public.fn_tiene_acceso_premium() then
    raise exception 'Quien ha pagado debería tener acceso de pago';
  end if;

  -- Y el círculo se cierra: el contenido que la 0017 dejó cerrado ahora se ve.
  if (select count(*) from public.reading_plans
      where id = 'dddd1111-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALLO: el plan de pago no se ve con suscripción activa';
  end if;
  if (select count(*) from public.reading_plan_days
      where plan_id = 'dddd1111-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALLO: los días del plan de pago no se ven con suscripción activa';
  end if;
end $$;

-- No puede tocar la suya ni siquiera para alargarla.
do $$
begin
  begin
    update public.subscriptions
      set current_period_end = now() + interval '10 years'
      where id = 'eeee1111-0000-4000-8000-000000000001';
    raise exception 'FALLO GRAVE: el cliente puede alargarse la suscripción';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.subscriptions;
    raise exception 'FALLO GRAVE: el cliente puede borrar su suscripción';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Andrés no ve la suscripción de Nuria ─────────────────────────────────

select set_config('request.jwt.claim.sub', 'cccccccc-3333-4333-8333-cccccccccccc', false);

do $$
begin
  if (select count(*) from public.subscriptions) <> 0 then
    raise exception 'FALLO GRAVE: Andrés ve la suscripción de Nuria';
  end if;
  -- Y su acceso no se contagia.
  if public.fn_tiene_acceso_premium() then
    raise exception 'FALLO GRAVE: el acceso de pago de otra persona alcanza a Andrés';
  end if;
end $$;

-- ── Los estados y sus límites ────────────────────────────────────────────

reset role;

-- Un pago rechazado con gracia por delante: sigue teniendo acceso. Alguien a
-- quien le caduca la tarjeta de viaje no pierde su devocional esa mañana.
update public.subscriptions
  set status = 'grace', grace_until = now() + interval '3 days'
  where id = 'eeee1111-0000-4000-8000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if not public.fn_tiene_acceso_premium() then
    raise exception 'El periodo de gracia debería mantener el acceso';
  end if;
end $$;

-- Agotada la gracia, se acaba.
reset role;
update public.subscriptions
  set grace_until = now() - interval '1 day'
  where id = 'eeee1111-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if public.fn_tiene_acceso_premium() then
    raise exception 'FALLO: la gracia agotada sigue dando acceso';
  end if;
end $$;

-- Marcada «activa» con el periodo ya vencido: no da acceso.
--
-- Pasa de verdad. El proveedor deja de renovar y el proceso que concilia
-- recibos todavía no ha pasado por esta fila, así que el estado dice «active»
-- y la fecha dice otra cosa. Sin mirar la fecha, esa fila daría acceso para
-- siempre y nadie lo notaría, porque desde fuera parece correcta.
reset role;
update public.subscriptions
  set status = 'active', grace_until = null,
      current_period_start = now() - interval '400 days',
      current_period_end = now() - interval '35 days'
  where id = 'eeee1111-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if public.fn_tiene_acceso_premium() then
    raise exception
      'FALLO GRAVE: una suscripción «activa» con el periodo vencido da acceso indefinido';
  end if;
end $$;

-- Cancelada pero con el periodo pagado sin agotar: se disfruta hasta el final,
-- porque ya está pagado.
reset role;
update public.subscriptions
  set status = 'canceled', grace_until = null,
      cancel_at_period_end = true, current_period_end = now() + interval '20 days'
  where id = 'eeee1111-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if not public.fn_tiene_acceso_premium() then
    raise exception 'Cancelar no debería cortar un periodo ya pagado';
  end if;
end $$;

-- Caducada del todo: se acabó el acceso.
reset role;
update public.subscriptions
  set status = 'expired', current_period_end = now() - interval '1 day'
  where id = 'eeee1111-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', false);

do $$
begin
  if public.fn_tiene_acceso_premium() then
    raise exception 'FALLO: una suscripción caducada sigue dando acceso';
  end if;
end $$;

-- ── Caducar no toca lo que ya escribió ───────────────────────────────────
--
-- El Documento 14 lo dice dos veces: no eliminar datos privados cuando expire
-- una suscripción, y no bloquear la recuperación por falta de ella. Con la
-- suscripción caducada, todo su contenido sigue ahí y sigue siendo suyo.

insert into public.journal_entries
  (user_id, entry_type, entry_date, encrypted_payload, key_id, nonce)
values ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'reflection', current_date,
        'sobre-del-diario-de-nuria', gen_random_uuid(), 'nonce-nuria');

do $$
begin
  if (select count(*) from public.journal_entries) <> 1 then
    raise exception 'FALLO GRAVE: sin suscripción no se puede escribir ni leer el diario';
  end if;
  if (select count(*) from public.user_key_envelopes
      where user_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb') <> 0 then
    -- Solo para que quede dicho: las claves no dependen de haber pagado.
    null;
  end if;
end $$;

-- ── Lo que el esquema no admite ──────────────────────────────────────────

reset role;

do $$
declare v_columna text;
begin
  -- Ver decisión 2. Un número de tarjeta en esta base cambiaría el régimen
  -- legal del proyecto entero, así que la comprobación no es de estilo.
  foreach v_columna in array array[
    'card_number', 'numero_tarjeta', 'cvv', 'cvc', 'card_expiry',
    'iban', 'pan', 'security_code'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'subscriptions'
        and column_name = v_columna
    ) then
      raise exception 'FALLO GRAVE: la tabla de suscripciones tiene la columna «%»', v_columna;
    end if;
  end loop;
end $$;

do $$
begin
  -- Estado de gracia sin fecha: sería un acceso sin final.
  begin
    insert into public.subscriptions (user_id, provider, plan_code, status)
    values ('cccccccc-3333-4333-8333-cccccccccccc', 'apple', 'mensual', 'grace');
    raise exception 'FALLO: se aceptó una gracia sin fecha de fin';
  exception
    when check_violation then null;
  end;

  -- Un proveedor inventado.
  begin
    insert into public.subscriptions (user_id, provider, plan_code, status)
    values ('cccccccc-3333-4333-8333-cccccccccccc', 'lo-que-sea', 'mensual', 'active');
    raise exception 'FALLO: el proveedor admite cualquier cosa';
  exception
    when check_violation then null;
  end;
end $$;

-- Dos suscripciones vivas a la vez harían que el acceso dependiera de cuál se
-- leyera primero.
insert into public.subscriptions (user_id, provider, plan_code, status)
values ('cccccccc-3333-4333-8333-cccccccccccc', 'google', 'mensual', 'active');

do $$
begin
  begin
    insert into public.subscriptions (user_id, provider, plan_code, status)
    values ('cccccccc-3333-4333-8333-cccccccccccc', 'apple', 'anual', 'active');
    raise exception 'FALLO: se aceptaron dos suscripciones vivas para la misma persona';
  exception
    when unique_violation then null;
  end;
end $$;

-- Pero una caducada y otra nueva sí conviven: es el historial mínimo para
-- auditoría financiera que pide el Documento 12.
update public.subscriptions
  set status = 'expired'
  where user_id = 'cccccccc-3333-4333-8333-cccccccccccc';

insert into public.subscriptions (user_id, provider, plan_code, status)
values ('cccccccc-3333-4333-8333-cccccccccccc', 'apple', 'anual', 'active');

do $$
begin
  if (select count(*) from public.subscriptions
      where user_id = 'cccccccc-3333-4333-8333-cccccccccccc') <> 2 then
    raise exception 'Debería conservarse el historial de suscripciones';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '', false);

select 'suscripciones y acceso de pago verificados' as resultado;
