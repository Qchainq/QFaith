-- Aislamiento de los planes de lectura.
--
-- El módulo está partido en dos mitades con reglas opuestas, y esta batería
-- existe sobre todo para comprobar que no se han cruzado:
--
--   · El catálogo se lee. Un plan publicado lo ve cualquiera con sesión, y
--     eso está bien: es contenido, no es de nadie.
--
--   · El progreso es privado. Por dónde va alguien, qué días completó y qué
--     escribió al reflexionar no lo ve nadie más.
--
-- Y una tercera cosa que no es aislamiento entre personas sino entre lo que se
-- ha pagado y lo que no: **el contenido de pago está cerrado desde ahora**,
-- antes de que exista la suscripción. Abrirlo «mientras tanto» sería
-- repartirlo: una vez descargado, no se recupera.
--
-- Cada comprobación empieza confirmando que hay algo que ver.

\set ON_ERROR_STOP on

-- ── Reparto ──────────────────────────────────────────────────────────────
--
-- Lucía sigue un plan sobre la ansiedad. Tomás es otro usuario cualquiera.
-- Datos ficticios (invariante 15).

insert into auth.users (id, email) values
  ('77777777-7777-4777-8777-777777777777', 'lucia@ejemplo.invalid'),
  ('88888888-8888-4888-8888-888888888888', 'tomas@ejemplo.invalid');

-- El catálogo lo publica un proceso con clave de servicio, no el cliente.
insert into public.reading_plans
  (id, creator_type, title, language_code, duration_days, is_premium, is_published)
values
  ('aaaa0000-0000-4000-8000-000000000001', 'qfaith',
   'Siete días sobre la ansiedad', 'es', 7, false, true),
  ('aaaa0000-0000-4000-8000-000000000002', 'qfaith',
   'Treinta días sobre el perdón', 'es', 30, true, true),
  ('aaaa0000-0000-4000-8000-000000000003', 'qfaith',
   'Borrador sin publicar', 'es', 5, false, false);

insert into public.reading_plan_days (plan_id, day_number, title, bible_references)
values
  ('aaaa0000-0000-4000-8000-000000000001', 1, 'No os angustiéis',
   '[{"libro": "MAT", "capitulo": 6}]'::jsonb),
  ('aaaa0000-0000-4000-8000-000000000002', 1, 'Setenta veces siete',
   '[{"libro": "MAT", "capitulo": 18}]'::jsonb),
  ('aaaa0000-0000-4000-8000-000000000003', 1, 'Día de un borrador',
   '[]'::jsonb);

-- ── El catálogo: qué se ve y qué no ──────────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);

do $$
begin
  -- El plan gratuito publicado sí se ve. Sin esto, todo lo de abajo pasaría
  -- sobre un catálogo invisible.
  if (select count(*) from public.reading_plans
      where id = 'aaaa0000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Un plan gratuito publicado debería verse: la prueba sería vacía';
  end if;
  if (select count(*) from public.reading_plan_days
      where plan_id = 'aaaa0000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Los días de un plan gratuito publicado deberían verse';
  end if;

  -- Un borrador no. Publicar es una decisión, y hasta que se toma el plan no
  -- existe para nadie.
  if (select count(*) from public.reading_plans
      where id = 'aaaa0000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FALLO: un plan sin publicar es visible';
  end if;
  if (select count(*) from public.reading_plan_days
      where plan_id = 'aaaa0000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FALLO: los días de un plan sin publicar son visibles';
  end if;
end $$;

-- ── El contenido de pago está cerrado para quien no ha pagado ────────────

do $$
begin
  if public.fn_tiene_acceso_premium() then
    raise exception 'Quien no ha pagado no debería tener acceso de pago';
  end if;

  if (select count(*) from public.reading_plans
      where id = 'aaaa0000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALLO GRAVE: un plan de pago es visible sin suscripción';
  end if;

  -- Y pedir los días por el identificador del plan, saltándose el catálogo,
  -- tampoco sirve. Es el caso que se olvida cuando la comprobación se pone
  -- solo en la tabla de planes.
  if (select count(*) from public.reading_plan_days
      where plan_id = 'aaaa0000-0000-4000-8000-000000000002') <> 0 then
    raise exception
      'FALLO GRAVE: el contenido de un plan de pago se alcanza pidiendo sus días';
  end if;
end $$;

-- El cliente no publica catálogo, ni siquiera el suyo.
do $$
begin
  begin
    insert into public.reading_plans (creator_type, creator_id, title, language_code, duration_days)
    values ('user', '77777777-7777-4777-8777-777777777777', 'Mi plan', 'es', 3);
    raise exception 'FALLO: el cliente puede publicar en el catálogo';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Lucía empieza el plan y escribe su reflexión ─────────────────────────

insert into public.user_reading_plans (id, user_id, plan_id, current_day)
values ('bbbb0000-0000-4000-8000-000000000001',
        '77777777-7777-4777-8777-777777777777',
        'aaaa0000-0000-4000-8000-000000000001', 1);

insert into public.reading_progress
  (user_id, user_plan_id, day_number, completed_at, encrypted_payload, key_id, nonce)
values ('77777777-7777-4777-8777-777777777777',
        'bbbb0000-0000-4000-8000-000000000001', 1, now(),
        'sobre-de-la-reflexion-de-lucia', gen_random_uuid(), 'nonce-reflexion');

do $$
begin
  if (select count(*) from public.user_reading_plans) <> 1
     or (select count(*) from public.reading_progress) <> 1 then
    raise exception 'Lucía debería ver lo suyo: la prueba sería vacía';
  end if;
end $$;

-- No puede inscribirse dos veces en el mismo plan: dos dispositivos sin
-- conexión crearían dos inscripciones y ninguna sabría cuál vale.
do $$
begin
  begin
    insert into public.user_reading_plans (user_id, plan_id)
    values ('77777777-7777-4777-8777-777777777777', 'aaaa0000-0000-4000-8000-000000000001');
    raise exception 'FALLO: se aceptó una segunda inscripción activa al mismo plan';
  exception
    when unique_violation then null;
  end;
end $$;

-- Abandonarlo y volver a empezarlo sí se puede: dejar un plan no es una
-- condena.
update public.user_reading_plans
  set status = 'abandoned'
  where id = 'bbbb0000-0000-4000-8000-000000000001';

insert into public.user_reading_plans (user_id, plan_id)
values ('77777777-7777-4777-8777-777777777777', 'aaaa0000-0000-4000-8000-000000000001');

do $$
begin
  if (select count(*) from public.user_reading_plans
      where status = 'active') <> 1 then
    raise exception 'Debería poder volver a empezar un plan que abandonó';
  end if;
end $$;

-- ── Tomás no alcanza nada de Lucía ───────────────────────────────────────

select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);

do $$
declare v_filas int;
begin
  -- El catálogo sí lo ve: es contenido público y eso está bien.
  if (select count(*) from public.reading_plans
      where id = 'aaaa0000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Tomás debería ver el catálogo publicado';
  end if;

  -- Su progreso, no.
  if (select count(*) from public.user_reading_plans) <> 0 then
    raise exception 'FALLO GRAVE: Tomás ve por dónde va Lucía en sus planes';
  end if;
  if (select count(*) from public.reading_progress) <> 0 then
    raise exception 'FALLO GRAVE: Tomás ve las reflexiones de Lucía';
  end if;

  -- Ni puede moverla de sitio. Sin `where` a propósito: PostgreSQL aplica
  -- también las políticas de lectura a un `update` que menciona columnas, y
  -- entonces la comprobación pasaría por la política equivocada.
  update public.user_reading_plans set current_day = 99;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: Tomás modificó % inscripciones de Lucía', v_filas;
  end if;

  update public.reading_progress set completed_at = null;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: Tomás modificó % días de Lucía', v_filas;
  end if;
end $$;

-- Tampoco puede apuntarse a un plan en nombre de Lucía.
do $$
begin
  begin
    insert into public.user_reading_plans (user_id, plan_id)
    values ('77777777-7777-4777-8777-777777777777', 'aaaa0000-0000-4000-8000-000000000001');
    raise exception 'FALLO GRAVE: Tomás inscribió a Lucía en un plan';
  exception
    when insufficient_privilege then null;
    -- El índice único puede saltar antes que la política. Sigue siendo un
    -- rechazo, pero conviene distinguirlo para no dar por buena una defensa
    -- que en realidad no llegó a actuar.
    when unique_violation then
      raise exception 'La política no llegó a actuar: frenó el índice único, no RLS';
  end;
end $$;

-- ── Nada de esto se borra a mano ─────────────────────────────────────────

select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);

do $$
begin
  begin
    delete from public.reading_progress;
    raise exception 'FALLO: se pudo borrar el progreso directamente';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.user_reading_plans;
    raise exception 'FALLO: se pudo borrar una inscripción directamente';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Lo que el esquema no puede producir ──────────────────────────────────
--
-- El invariante 12 no se comprueba mirando una pantalla: se comprueba viendo
-- que no existe la columna con la que se calcularía. Una promesa en el código
-- se puede romper en el commit siguiente; una columna que no está, no.

reset role;

do $$
declare v_columna text;
begin
  foreach v_columna in array array[
    'streak', 'current_streak', 'longest_streak', 'racha',
    'missed_days', 'days_missed', 'completion_rate', 'compliance'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name in ('user_reading_plans', 'reading_progress')
        and column_name = v_columna
    ) then
      raise exception
        'FALLO: existe la columna «%». Un plan es un acompañamiento, no un marcador (invariante 12).',
        v_columna;
    end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '', false);

select 'aislamiento de planes de lectura verificado' as resultado;
