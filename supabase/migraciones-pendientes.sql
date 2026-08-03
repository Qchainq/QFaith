-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Migraciones desde la 0013
--
-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.
-- Solo las migraciones 0013 en adelante. Para una base que ya tiene
-- aplicadas las anteriores. Comprueba en cuál estás con:
--
--   select version from public.schema_migrations order by version;
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 0013_sermones.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0013 — Sermones (Documento 12, tablas 26 a 28).
--
-- El módulo tiene dos mitades con dueños distintos, y la migración las separa
-- a propósito:
--
--   · **El sermón lo publica la iglesia.** Título, predicador, pasajes,
--     resumen y enlaces son institucionales y van en claro: los ve todo el
--     que pertenece a esa iglesia, que es para lo que se publican.
--
--   · **Las notas del sermón son de quien las escribe.** Van cifradas y
--     **nadie de la iglesia las ve, ni siquiera el pastor que predicó**. Lo
--     que alguien anota mientras escucha —«esto va por mí», «hablar con él
--     esta semana»— es tan privado como el diario, aunque el sermón sea
--     público. El Documento 8 lo dice y aquí lo impone la forma de la tabla.
--
-- Tres decisiones:
--
--   1. **Un sermón es institucional o personal, nunca las dos cosas.** La
--      restricción lo impone igual que en `prayer_shares`: dos dueños serían
--      un permiso ambiguo, y un permiso ambiguo se resuelve a favor de quien
--      pide.
--
--   2. **Las acciones prácticas usan el sobre común**, no un
--      `encrypted_title` suelto como describe el Documento 12. Misma
--      desviación consciente que en `habits` y en `memorials`: un sobre por
--      fila mantiene coherente el motor de sincronización y el vínculo
--      criptográfico.
--
--   3. **`due_date` y `completed_at` van en claro.** Son lo que necesita un
--      recordatorio para saber cuándo sonar, y no dicen nada de la acción: el
--      texto —que sí lo dice todo— viaja dentro del sobre.

-- ── sermons ──────────────────────────────────────────────────────────────

create table public.sermons (
  id uuid primary key default gen_random_uuid(),

  -- Exactamente uno de los dos. Ver decisión 1.
  church_id uuid references public.churches (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,

  title text,
  speaker_name text,
  sermon_date date,
  public_summary text,
  bible_references jsonb,
  audio_path text,
  video_url text,
  publication_status varchar(20) not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint sermons_un_solo_dueno check (
    (church_id is not null)::int + (owner_user_id is not null)::int = 1
  ),
  constraint sermons_estado_valido
    check (publication_status in ('draft', 'published', 'archived'))
);

comment on table public.sermons is
  'Sermones publicados por una iglesia o guardados por una persona. Las notas del '
  'usuario sobre ellos son privadas y viven en sermon_notes.';

create index sermons_iglesia_idx
  on public.sermons (church_id, sermon_date desc)
  where deleted_at is null and church_id is not null;
create index sermons_propietario_idx
  on public.sermons (owner_user_id, sermon_date desc)
  where deleted_at is null and owner_user_id is not null;

create trigger sermons_updated_at
  before update on public.sermons
  for each row execute function public.fn_actualizar_updated_at();

-- ── sermon_notes ─────────────────────────────────────────────────────────
--
-- Privadas y cifradas **aunque el sermón sea institucional**. Es la regla que
-- da sentido al módulo: se puede tomar nota con libertad porque nadie la va a
-- leer.

create table public.sermon_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_id uuid references public.sermons (id) on delete set null,

  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint sermon_notes_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint sermon_notes_nonce_no_vacio check (length(nonce) > 0),
  constraint sermon_notes_version_positiva check (version >= 1)
);

comment on table public.sermon_notes is
  'Notas del usuario sobre un sermón. Cifradas. Ni el pastor que predicó puede leerlas.';

-- `sermon_id` queda en `set null` a propósito: si la iglesia retira el
-- sermón, la nota de la persona no desaparece con él. Lo que escribió sigue
-- siendo suyo.
create index sermon_notes_user_idx
  on public.sermon_notes (user_id, created_at desc)
  where deleted_at is null;
create index sermon_notes_sermon_idx on public.sermon_notes (sermon_id);
create index sermon_notes_user_revision_idx on public.sermon_notes (user_id, sync_revision);

create trigger sermon_notes_updated_at
  before update on public.sermon_notes
  for each row execute function public.fn_actualizar_updated_at();

create trigger sermon_notes_version
  before update on public.sermon_notes
  for each row execute function public.fn_incrementar_version();

create trigger sermon_notes_sync_log
  before insert or update on public.sermon_notes
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── sermon_actions ───────────────────────────────────────────────────────

create table public.sermon_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_note_id uuid references public.sermon_notes (id) on delete set null,

  -- El texto de la acción va en el sobre. Ver decisión 2.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  -- En claro: es lo que necesita un recordatorio. Ver decisión 3.
  due_date date,
  completed_at timestamptz,
  reminder_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint sermon_actions_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint sermon_actions_version_positiva check (version >= 1)
);

comment on table public.sermon_actions is
  'Aplicaciones prácticas que la persona se propone. El texto va cifrado; solo la fecha '
  'queda en claro, para poder recordarla.';

create index sermon_actions_user_idx
  on public.sermon_actions (user_id, due_date)
  where deleted_at is null and completed_at is null;
create index sermon_actions_nota_idx on public.sermon_actions (sermon_note_id);
create index sermon_actions_user_revision_idx on public.sermon_actions (user_id, sync_revision);

create trigger sermon_actions_updated_at
  before update on public.sermon_actions
  for each row execute function public.fn_actualizar_updated_at();

create trigger sermon_actions_version
  before update on public.sermon_actions
  for each row execute function public.fn_incrementar_version();

create trigger sermon_actions_sync_log
  before insert or update on public.sermon_actions
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.sermons enable row level security;
alter table public.sermons force row level security;
alter table public.sermon_notes enable row level security;
alter table public.sermon_notes force row level security;
alter table public.sermon_actions enable row level security;
alter table public.sermon_actions force row level security;

-- Un sermón institucional lo ven los miembros de esa iglesia, y solo si está
-- publicado: un borrador no se enseña a nadie. Uno personal, solo su dueño.
create policy sermons_lectura on public.sermons
  for select using (
    deleted_at is null
    and (
      owner_user_id = (select auth.uid())
      or (
        church_id is not null
        and publication_status = 'published'
        and public.fn_es_miembro_activo(church_id)
      )
      or (church_id is not null and public.fn_lidera_iglesia(church_id))
    )
  );

create policy sermons_insercion on public.sermons
  for insert with check (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  );

create policy sermons_actualizacion on public.sermons
  for update using (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  )
  with check (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  );

-- Las notas y las acciones son de su dueño y de nadie más. **No hay política
-- para el liderazgo de la iglesia, y no debe añadirse ninguna**: quien
-- predicó no puede leer lo que alguien anotó mientras le escuchaba.
create policy sermon_notes_lectura_propia on public.sermon_notes
  for select using (user_id = (select auth.uid()));
create policy sermon_notes_insercion_propia on public.sermon_notes
  for insert with check (user_id = (select auth.uid()));
create policy sermon_notes_actualizacion_propia on public.sermon_notes
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sermon_actions_lectura_propia on public.sermon_actions
  for select using (user_id = (select auth.uid()));
create policy sermon_actions_insercion_propia on public.sermon_actions
  for insert with check (user_id = (select auth.uid()));
create policy sermon_actions_actualizacion_propia on public.sermon_actions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.sermons to authenticated;
grant select, insert, update on public.sermon_notes to authenticated;
grant select, insert, update on public.sermon_actions to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0014_notificaciones.sql
-- ───────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────
-- Registro de migraciones aplicadas
-- ───────────────────────────────────────────────────────────

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;
-- Sin políticas y sin privilegios: es información de operación, no del
-- usuario. Solo la ve quien entra por el panel o con la clave de servicio.
revoke all on public.schema_migrations from anon, authenticated;

insert into public.schema_migrations (version) values
  ('0013_sermones'),
  ('0014_notificaciones')
on conflict (version) do nothing;
