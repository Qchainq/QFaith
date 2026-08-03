-- Migración 0014 — Notificaciones (Documento 12, tabla 39; Documento 13).
--
-- La regla que gobierna esta tabla cabe en una línea: **aquí nunca entra
-- contenido espiritual.** Ni el texto de una oración, ni el nombre de una
-- persona, ni de qué trata una entrada del diario. Las columnas se llaman
-- `generic_title` y `generic_body` a propósito: el nombre recuerda para qué
-- sirven cada vez que alguien las lee.
--
-- Lo que llega a una pantalla bloqueada es «Tienes un recordatorio en
-- QFaith», nunca «Recuerda orar por la enfermedad de María». Esa diferencia
-- es todo el Documento 13, y es la regla que más se incumple en las
-- aplicaciones que hacen esto mal.
--
-- Tres decisiones:
--
--   1. **Las notificaciones espirituales no pasan por aquí.** Hábitos,
--      oración, devocional y lectura se programan **en el dispositivo** con
--      notificaciones locales: funcionan sin Internet, no cuestan nada y
--      sobre todo su contenido nunca sale. Esta tabla es para lo que **tiene**
--      que venir del servidor: seguridad, iglesia, eventos y facturación.
--
--   2. **`action_reference_id` es opaco.** Dice a qué registro ir, no qué
--      dice. Antes de navegar, el cliente comprueba sesión, dispositivo y
--      permisos, y pide desbloqueo si el destino es privado.
--
--   3. **El token push vive en `devices`.** Es del dispositivo, no de la
--      persona: al revocar un dispositivo se revoca su token, y al cerrar
--      sesión se borra. **Nunca se usa para seguimiento publicitario y nunca
--      aparece en un log.**

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  notification_type varchar(40) not null,

  -- Genéricos. Ver la nota de cabecera: aquí no entra contenido espiritual.
  generic_title text not null,
  generic_body text,

  -- Adónde ir. No dice qué hay allí.
  action_route text,
  action_reference_id uuid,

  priority varchar(10) not null default 'normal',

  scheduled_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_titulo_no_vacio check (length(trim(generic_title)) > 0),
  constraint notifications_prioridad_valida
    check (priority in ('critica', 'alta', 'normal', 'baja')),
  -- Solo los tipos que de verdad necesitan venir del servidor. Un hábito o
  -- una oración no están en la lista porque se programan en el dispositivo:
  -- si estuvieran, alguien acabaría mandando su texto por aquí.
  constraint notifications_tipo_valido check (
    notification_type in (
      'seguridad', 'dispositivo_nuevo', 'respaldo',
      'iglesia', 'evento', 'suscripcion', 'sistema'
    )
  )
);

comment on table public.notifications is
  'Avisos que deben venir del servidor. NUNCA contenido espiritual: los recordatorios '
  'personales se programan en el dispositivo como notificaciones locales.';
comment on column public.notifications.generic_body is
  'Texto genérico apto para una pantalla bloqueada. Nunca el contenido del usuario.';

create index notifications_user_sin_leer_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_programadas_idx
  on public.notifications (user_id, scheduled_at)
  where sent_at is null;

-- ── Token push en el dispositivo ─────────────────────────────────────────
--
-- **Desviación consciente del Documento 12**, que no contempla la columna. El
-- Documento 13 exige que el token esté asociado al dispositivo y se revoque
-- con él; guardarlo en `profiles` lo ataría a la persona y sobreviviría a la
-- revocación, que es justo lo contrario de lo que se pide.

alter table public.devices add column push_token text;
alter table public.devices add column push_updated_at timestamptz;

comment on column public.devices.push_token is
  'Token de notificaciones push. Se borra al cerrar sesión y se revoca con el dispositivo. '
  'Nunca se usa para seguimiento publicitario ni aparece en un log.';

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_lectura_propia on public.notifications
  for select using (user_id = (select auth.uid()));

-- Marcar como leída es lo único que hace el cliente. **No hay política de
-- inserción**: las escribe el servidor con la clave de servicio. Si el
-- cliente pudiera crearlas, cualquiera podría fabricarse un aviso de
-- seguridad falso a nombre de otro.
create policy notifications_actualizacion_propia on public.notifications
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, update on public.notifications to authenticated;
