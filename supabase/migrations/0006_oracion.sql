-- Migración 0006 — Módulo de Oración (Documento 12, tablas 10 y 11).
--
-- Sigue exactamente el patrón de `journal_entries`: el contenido va cifrado,
-- fuera quedan solo los campos que el servidor necesita para ordenar y
-- filtrar, el borrado es lógico y la revisión la sella el mismo trigger.
--
-- Lo que **no** entra aquí: `prayer_shares`. Compartir una petición es del
-- módulo Iglesia y tiene su propio modelo de permisos; mezclarlo ahora
-- abriría una vía de acceso de terceros antes de tener las reglas escritas.

-- ── prayers ──────────────────────────────────────────────────────────────

create table public.prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  status public.prayer_status not null default 'active',
  -- Por defecto privada. Compartir es siempre un acto voluntario y explícito.
  visibility public.visibility_level not null default 'private',
  category_code varchar(40),

  -- Título, descripción, personas y detalles viajan aquí dentro.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  reminder_enabled boolean not null default false,
  next_reminder_at timestamptz,
  -- Marcar respondida no borra la petición: cambia su estado y deja la fecha.
  answered_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint prayers_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint prayers_nonce_no_vacio check (length(nonce) > 0),
  constraint prayers_version_positiva check (version >= 1),
  -- Las categorías del Documento 11. Es un código, no un texto del usuario:
  -- si fuera libre revelaría información y no se podría traducir.
  constraint prayers_categoria_valida check (
    category_code is null
    or category_code in (
      'personal', 'familia', 'iglesia', 'trabajo',
      'salud', 'finanzas', 'amigos', 'ministerio'
    )
  ),
  constraint prayers_respondida_con_fecha
    check ((status <> 'answered') or (answered_at is not null)),
  constraint prayers_archivada_con_fecha
    check ((status <> 'archived') or (archived_at is not null))
);

comment on table public.prayers is
  'Peticiones de oración. Contenido cifrado en el dispositivo; el servidor solo ve el sobre.';
comment on column public.prayers.category_code is
  'Código cerrado, no texto libre: un texto del usuario aquí sería contenido sin cifrar.';

create index prayers_user_estado_idx
  on public.prayers (user_id, status)
  where deleted_at is null;
create index prayers_user_recordatorio_idx
  on public.prayers (user_id, next_reminder_at)
  where deleted_at is null and reminder_enabled;
create index prayers_user_actualizado_idx on public.prayers (user_id, updated_at desc);
create index prayers_user_revision_idx on public.prayers (user_id, sync_revision);
create index prayers_papelera_idx on public.prayers (deleted_at) where deleted_at is not null;

create trigger prayers_updated_at
  before update on public.prayers
  for each row execute function public.fn_actualizar_updated_at();

create trigger prayers_version
  before update on public.prayers
  for each row execute function public.fn_incrementar_version();

create trigger prayers_sync_log
  before insert or update on public.prayers
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── prayer_updates ───────────────────────────────────────────────────────
--
-- Cada avance que el usuario anota sobre una petición. Se guarda aparte para
-- conservar la cronología: sobrescribir la petición perdería el recorrido,
-- que es justo lo que da sentido al memorial.

create table public.prayer_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prayer_id uuid not null references public.prayers (id) on delete cascade,

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

  constraint prayer_updates_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint prayer_updates_version_positiva check (version >= 1)
);

create index prayer_updates_peticion_idx on public.prayer_updates (prayer_id, created_at desc);
create index prayer_updates_user_actualizado_idx
  on public.prayer_updates (user_id, updated_at desc);
create index prayer_updates_user_revision_idx on public.prayer_updates (user_id, sync_revision);

create trigger prayer_updates_updated_at
  before update on public.prayer_updates
  for each row execute function public.fn_actualizar_updated_at();

create trigger prayer_updates_version
  before update on public.prayer_updates
  for each row execute function public.fn_incrementar_version();

create trigger prayer_updates_sync_log
  before insert or update on public.prayer_updates
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────
--
-- Mismo patrón que el diario. Ninguna política permite a líderes, pastores,
-- mentores ni administradores leer estas filas, y no debe añadirse ninguna.

alter table public.prayers enable row level security;
alter table public.prayers force row level security;
alter table public.prayer_updates enable row level security;
alter table public.prayer_updates force row level security;

create policy prayers_lectura_propia on public.prayers
  for select using (user_id = (select auth.uid()));
create policy prayers_insercion_propia on public.prayers
  for insert with check (user_id = (select auth.uid()));
create policy prayers_actualizacion_propia on public.prayers
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy prayer_updates_lectura_propia on public.prayer_updates
  for select using (user_id = (select auth.uid()));
create policy prayer_updates_insercion_propia on public.prayer_updates
  for insert with check (user_id = (select auth.uid()));
create policy prayer_updates_actualizacion_propia on public.prayer_updates
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de DELETE en ninguna de las dos: el borrado es lógico y el
-- purgado lo hace un proceso con clave de servicio tras la papelera de 30
-- días (invariante 6).

-- ── Privilegios ──────────────────────────────────────────────────────────
--
-- Las tablas nuevas nacen sin privilegios porque la migración 0005 revocó los
-- que Supabase concede por defecto. Se conceden aquí de forma explícita, que
-- es justo lo que evita que olvidarse de RLS exponga datos por descuido.

grant select, insert, update on public.prayers, public.prayer_updates to authenticated;
