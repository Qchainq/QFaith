-- Migración 0003 — Contenido privado y sincronización.
--
-- `journal_entries` es la tabla privada de referencia de la Fase 1: sobre
-- ella se demuestra el criterio de salida (crear, cifrar, sincronizar y
-- restaurar un registro entre dos dispositivos). Las demás tablas de
-- contenido de la Fase 2 seguirán exactamente este mismo patrón.

-- ── journal_entries ──────────────────────────────────────────────────────

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type public.journal_type not null default 'general',
  entry_date date not null,

  -- El servidor no interpreta nada de esto. Título, contenido y etiquetas
  -- privadas viajan dentro de encrypted_payload.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  is_favorite boolean not null default false,
  -- Modo Arca: exige autenticación adicional en el cliente. El servidor no
  -- puede distinguir el contenido de una confesión privada del resto.
  is_ark_protected boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint journal_entries_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint journal_entries_nonce_no_vacio check (length(nonce) > 0),
  constraint journal_entries_version_positiva check (version >= 1)
);

comment on table public.journal_entries is
  'Diario espiritual. Contenido cifrado en el dispositivo; el servidor solo ve el sobre.';
comment on column public.journal_entries.content_hash is
  'HMAC con clave derivada del usuario, no un hash simple: el servidor no puede confirmar hipótesis sobre el contenido.';

create index journal_entries_user_fecha_idx
  on public.journal_entries (user_id, entry_date desc)
  where deleted_at is null;
create index journal_entries_user_tipo_idx
  on public.journal_entries (user_id, entry_type)
  where deleted_at is null;
create index journal_entries_user_actualizado_idx
  on public.journal_entries (user_id, updated_at desc);
create index journal_entries_user_revision_idx
  on public.journal_entries (user_id, sync_revision);
-- Índice de la papelera: sirve para el purgado a los 30 días.
create index journal_entries_papelera_idx
  on public.journal_entries (deleted_at)
  where deleted_at is not null;

create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.fn_actualizar_updated_at();

create trigger journal_entries_version
  before update on public.journal_entries
  for each row execute function public.fn_incrementar_version();

-- ── sync_change_log ──────────────────────────────────────────────────────

create table public.sync_change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type varchar(40) not null,
  entity_id uuid not null,
  operation public.sync_operation not null,
  revision bigint not null,
  device_id uuid references public.devices (id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table public.sync_change_log is
  'Solo identificadores, operación y revisión. Nunca contenido privado.';

create index sync_change_log_user_revision_idx on public.sync_change_log (user_id, revision);
create index sync_change_log_user_changed_idx on public.sync_change_log (user_id, changed_at desc);

-- Registra el cambio y sella la revisión en la propia fila. Es SECURITY
-- DEFINER porque el usuario no debe poder escribir en la bitácora a mano:
-- solo el trigger la alimenta.
create or replace function public.fn_registrar_cambio_sincronizacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_operacion public.sync_operation;
  v_fila record;
begin
  v_revision := nextval('public.sync_revision_seq');
  v_fila := coalesce(new, old);

  if tg_op = 'INSERT' then
    v_operacion := 'create';
  elsif tg_op = 'DELETE' then
    v_operacion := 'delete';
  elsif new.deleted_at is not null and old.deleted_at is null then
    -- El borrado normal es lógico: se propaga como delete para que los otros
    -- dispositivos lo retiren de su vista.
    v_operacion := 'delete';
  else
    v_operacion := 'update';
  end if;

  insert into public.sync_change_log (user_id, entity_type, entity_id, operation, revision, device_id)
  values (
    v_fila.user_id,
    tg_table_name,
    v_fila.id,
    v_operacion,
    v_revision,
    v_fila.last_modified_device_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.sync_revision := v_revision;
  return new;
end;
$$;

create trigger journal_entries_sync_log
  before insert or update on public.journal_entries
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── sync_conflicts ───────────────────────────────────────────────────────

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type varchar(40) not null,
  entity_id uuid not null,
  local_version bigint not null,
  remote_version bigint not null,
  -- Las dos versiones en conflicto se conservan cifradas hasta que el
  -- usuario decide. Nunca se sobrescribe en silencio (Documento 7).
  encrypted_local_snapshot text,
  encrypted_remote_snapshot text,
  status varchar(20) not null default 'pendiente',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sync_conflicts_status_valido
    check (status in ('pendiente', 'resuelto_local', 'resuelto_remoto', 'resuelto_fusion')),
  constraint sync_conflicts_resuelto_con_fecha
    check ((status = 'pendiente') or (resolved_at is not null))
);

create index sync_conflicts_user_pendientes_idx
  on public.sync_conflicts (user_id)
  where status = 'pendiente';

-- ── audit_events ─────────────────────────────────────────────────────────

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  event_type varchar(50) not null,
  severity varchar(20) not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  -- La IP se guarda como hash: sirve para detectar accesos sospechosos sin
  -- conservar un dato personal en claro.
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint audit_events_severity_valida check (severity in ('info', 'aviso', 'error', 'critico'))
);

comment on table public.audit_events is
  'Errores, accesos y eventos críticos. Nunca contenido espiritual, claves ni tokens.';

create index audit_events_user_idx on public.audit_events (user_id, created_at desc);
create index audit_events_tipo_idx on public.audit_events (event_type, created_at desc);
