-- Migración 0019 — Suscripciones (Documento 12, tabla 40; Documento 14,
-- «Pagos» y «Precios»).
--
-- Conecta lo que la migración 0017 dejó preparado: `fn_tiene_acceso_premium`
-- devolvía `false` para que el contenido de pago estuviera cerrado antes de
-- que existiera la forma de pagarlo. Ahora consulta esta tabla.
--
-- ── Decisiones de diseño (Opus) ──────────────────────────────────────────
--
-- 1. **El cliente nunca escribe su suscripción.** Es la regla de la que
--    depende todo lo demás. La fila la escribe un proceso de servidor que
--    valida el recibo contra Apple o Google; si el cliente pudiera tocarla,
--    cualquiera se concedería acceso de pago con una petición. Hay política de
--    lectura y no hay de escritura, y además se le revoca el privilegio: RLS
--    no debe ser la única defensa.
--
-- 2. **Nunca datos de tarjeta.** Solo referencias opacas del proveedor. No es
--    una recomendación: un número de tarjeta en esta base cambiaría el
--    régimen legal del proyecto entero. La batería lo comprueba buscando
--    columnas que no deben existir.
--
-- 3. **Un pago rechazado no corta el acceso el mismo día.** `status` admite
--    `grace`, y el acceso se calcula con `grace_until`. Alguien a quien le
--    caduca la tarjeta mientras está de viaje no debe perder su devocional esa
--    misma mañana (Documento 14, «periodo de gracia»).
--
-- 4. **Caducar no borra nada, y no bloquea recuperar ni exportar.** El
--    Documento 14 lo dice dos veces y aquí no hay nada que lo permita: esta
--    tabla no toca el contenido privado, y ni la exportación ni la
--    restauración consultan `fn_tiene_acceso_premium`. Lo que se pierde al
--    caducar es acceso a funciones nuevas, nunca lo ya escrito.
--
-- 5. **Los precios no están aquí.** Los pone la tienda en tiempo de ejecución
--    (Documento 14: «fuera del código mediante configuración segura»). Guardar
--    un precio en esta tabla lo dejaría desfasado respecto a lo que la persona
--    ve al comprar, y en pagos eso no es un detalle.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Quién cobró. `manual` es para altas de soporte y cortesías.
  provider varchar(20) not null,
  -- Referencias opacas del proveedor. Ver decisión 2.
  provider_customer_reference text,
  provider_subscription_reference text,

  plan_code varchar(30) not null,
  status varchar(20) not null,

  current_period_start timestamptz,
  current_period_end timestamptz,
  -- Ver decisión 3. Hasta cuándo se mantiene el acceso pese al impago.
  grace_until timestamptz,
  cancel_at_period_end boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_proveedor_valido check (
    provider in ('apple', 'google', 'manual')
  ),
  constraint subscriptions_estado_valido check (
    status in ('trialing', 'active', 'grace', 'canceled', 'expired')
  ),
  constraint subscriptions_periodo_coherente check (
    current_period_end is null
    or current_period_start is null
    or current_period_end >= current_period_start
  ),
  -- El estado de gracia sin fecha hasta cuándo sería un acceso sin final.
  constraint subscriptions_gracia_con_fecha check (
    status <> 'grace' or grace_until is not null
  )
);

comment on table public.subscriptions is
  'Estado de suscripción. La escribe un proceso de servidor tras validar el recibo; '
  'el cliente solo la lee. Nunca contiene datos de tarjeta.';
comment on column public.subscriptions.grace_until is
  'Periodo de gracia tras un pago rechazado. Un impago no corta el acceso el mismo día.';

-- Una suscripción viva por persona. Sin esto, dos recibos procesados a la vez
-- dejarían dos filas y el acceso dependería de cuál se leyera primero.
create unique index subscriptions_una_viva_idx
  on public.subscriptions (user_id)
  where status in ('trialing', 'active', 'grace');

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
-- Para el proceso que concilia recibos con el proveedor.
create index subscriptions_referencia_idx
  on public.subscriptions (provider, provider_subscription_reference)
  where provider_subscription_reference is not null;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.fn_actualizar_updated_at();

-- ── El acceso de pago ────────────────────────────────────────────────────
--
-- Se sustituye el cuerpo de la función que la 0017 dejó devolviendo `false`.
-- Las políticas que la consultan no cambian: era exactamente el plan.

create or replace function public.fn_tiene_acceso_premium()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = (select auth.uid())
      and (
        -- Con periodo en curso.
        (s.status in ('trialing', 'active')
          and (s.current_period_end is null or s.current_period_end > now()))
        -- O en gracia y dentro de ella. Ver decisión 3.
        or (s.status = 'grace' and s.grace_until is not null and s.grace_until > now())
        -- Cancelada pero con el periodo pagado sin agotar: se ha pagado por
        -- él, así que se disfruta hasta el final.
        or (s.status = 'canceled'
          and s.current_period_end is not null and s.current_period_end > now())
      )
  );
$$;

comment on function public.fn_tiene_acceso_premium() is
  'Acceso de pago del usuario actual. Incluye prueba, periodo de gracia y el resto '
  'de un periodo ya pagado tras cancelar.';

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

-- Solo lectura, y solo la propia. Ver decisión 1: no hay política de
-- inserción ni de actualización porque el cliente no debe poder escribirla
-- nunca, ni siquiera la suya.
create policy subscriptions_lectura_propia on public.subscriptions
  for select using (user_id = (select auth.uid()));

grant select on public.subscriptions to authenticated;
