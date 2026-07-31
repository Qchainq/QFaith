-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Fase 1 · Esquema completo
--
-- ARCHIVO GENERADO. No lo edites: es la concatenación de los archivos de
-- supabase/migrations/ en orden. Para regenerarlo:  npm run sql:combinar
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 0001_extensiones_y_enums.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0001 — Extensiones, enumeraciones y utilidades comunes.
--
-- Fase 1. Base sobre la que se apoyan las demás migraciones.
-- Documento 12: todos los identificadores son UUID y todas las fechas van en
-- UTC (TIMESTAMPTZ).

create extension if not exists "pgcrypto";

-- ── Enumeraciones (Documento 12) ─────────────────────────────────────────

create type public.account_status as enum ('active', 'suspended', 'pending_deletion', 'deleted');

create type public.device_status as enum ('active', 'revoked', 'lost', 'inactive');

create type public.visibility_level as enum ('private', 'trusted_person', 'group', 'church');

create type public.sync_operation as enum ('create', 'update', 'delete');

create type public.sync_status as enum ('pending', 'processing', 'synced', 'failed', 'conflict');

create type public.prayer_status as enum ('active', 'answered', 'archived');

create type public.habit_frequency as enum ('daily', 'weekly', 'monthly', 'custom');

create type public.journal_type as enum (
  'reflection',
  'testimony',
  'learning',
  'gratitude',
  'dream',
  'private_confession',
  'general'
);

create type public.church_role as enum (
  'visitor',
  'member',
  'mentor',
  'leader',
  'pastor',
  'administrator'
);

create type public.notification_channel as enum ('push', 'email', 'local');

-- ── Secuencia de revisiones de sincronización ────────────────────────────
--
-- Los clientes piden los cambios posteriores a una revisión concreta,
-- siempre filtrando por su propio usuario. Basta con que la secuencia sea
-- monótona: si lo es globalmente, también lo es dentro de cada usuario. Se
-- usa una secuencia global en lugar de un contador por usuario para evitar
-- que dos dispositivos del mismo usuario compitan por bloquear la misma
-- fila al escribir a la vez. Los huecos en la numeración de un usuario son
-- esperables y no afectan a la sincronización incremental.
create sequence public.sync_revision_seq as bigint start 1;

-- ── Utilidades ───────────────────────────────────────────────────────────

-- Mantiene updated_at y evita que el cliente lo falsee.
create or replace function public.fn_actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Incrementa `version` en cada modificación real. Es lo que permite detectar
-- conflictos entre dispositivos (Documento 7).
create or replace function public.fn_incrementar_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

comment on sequence public.sync_revision_seq is
  'Revisión monótona global usada como cursor de sincronización incremental.';

-- ───────────────────────────────────────────────────────────
-- 0002_identidad_y_claves.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0002 — Identidad, dispositivos y claves.
--
-- Ninguna de estas tablas guarda una clave en claro. `user_key_envelopes` y
-- `recovery_configurations` contienen exclusivamente material ya cifrado en
-- el dispositivo: el servidor no puede abrirlo (Documento 5).

-- ── profiles ─────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  language_code varchar(10) not null default 'es',
  timezone text not null default 'UTC',
  country_code varchar(2),
  birth_year smallint,
  account_status public.account_status not null default 'active',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_birth_year_valido
    check (birth_year is null or birth_year between 1900 and extract(year from now())::int),
  constraint profiles_language_code_soportado
    check (language_code in ('es', 'en'))
);

comment on table public.profiles is
  'Datos generales del usuario. Nunca contiene información espiritual privada.';
comment on column public.profiles.birth_year is
  'Solo el año: no se almacena la fecha completa porque no hace falta.';

create index profiles_account_status_idx on public.profiles (account_status);
create index profiles_created_at_idx on public.profiles (created_at);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.fn_actualizar_updated_at();

-- ── user_settings ────────────────────────────────────────────────────────

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  theme varchar(20) not null default 'system',
  accent_preference varchar(30),
  font_scale numeric(3, 2) not null default 1.00,
  bible_translation_id uuid,
  notifications_enabled boolean not null default true,
  -- La analítica está desactivada por defecto: privacidad por defecto.
  analytics_enabled boolean not null default false,
  biometric_lock_enabled boolean not null default false,
  auto_lock_seconds integer not null default 60,
  cloud_backup_enabled boolean not null default true,
  wifi_only_downloads boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_valido check (theme in ('system', 'light', 'dark')),
  constraint user_settings_font_scale_valido check (font_scale between 0.80 and 2.00),
  constraint user_settings_auto_lock_valido check (auto_lock_seconds between 0 and 3600)
);

comment on table public.user_settings is
  'Preferencias del usuario. Nunca contiene PIN, claves ni secretos.';

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.fn_actualizar_updated_at();

-- ── devices ──────────────────────────────────────────────────────────────

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_public_id text not null,
  device_name text,
  platform varchar(20) not null,
  os_version text,
  app_version text,
  -- Clave pública del dispositivo. Sirve para entregarle claves cifradas sin
  -- que pasen en claro por el servidor.
  public_key text,
  status public.device_status not null default 'active',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_unico_por_usuario unique (user_id, device_public_id),
  constraint devices_platform_valida check (platform in ('ios', 'android', 'web')),
  constraint devices_revocado_con_fecha
    check ((status <> 'revoked') or (revoked_at is not null))
);

comment on table public.devices is
  'Dispositivos autorizados. Nunca se almacenan identificadores publicitarios.';

create index devices_user_id_idx on public.devices (user_id);
create index devices_status_idx on public.devices (user_id, status);
create index devices_last_seen_idx on public.devices (user_id, last_seen_at desc);

create trigger devices_updated_at
  before update on public.devices
  for each row execute function public.fn_actualizar_updated_at();

-- ── user_key_envelopes ───────────────────────────────────────────────────

create table public.user_key_envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  key_id uuid not null,
  key_type varchar(30) not null,
  -- Siempre material envuelto. Que aquí llegue una clave en claro sería un
  -- fallo grave: el servidor no debe poder descifrar nada.
  encrypted_key text not null,
  encryption_method varchar(50) not null,
  key_version smallint not null default 1,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_key_envelopes_key_type_valido
    check (key_type in ('contenido', 'maestra_envuelta', 'dispositivo')),
  constraint user_key_envelopes_unico unique (user_id, key_id, device_id)
);

comment on table public.user_key_envelopes is
  'Contenedores de claves ya cifradas. La empresa no puede abrirlos.';

create index user_key_envelopes_user_id_idx on public.user_key_envelopes (user_id);
create index user_key_envelopes_device_id_idx on public.user_key_envelopes (device_id);
create index user_key_envelopes_key_id_idx on public.user_key_envelopes (user_id, key_id);

-- ── recovery_configurations ──────────────────────────────────────────────

create table public.recovery_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  recovery_method varchar(30) not null default 'frase',
  -- Clave maestra envuelta con una clave derivada de la frase de
  -- recuperación. Sin la frase, esto es indescifrable.
  encrypted_recovery_envelope text not null,
  recovery_nonce text not null,
  kdf_algorithm varchar(30) not null,
  kdf_parameters jsonb not null,
  recovery_version smallint not null default 1,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_configurations_metodo_valido check (recovery_method in ('frase')),
  constraint recovery_configurations_kdf_valido check (kdf_algorithm in ('argon2id')),
  -- Los parámetros no son secretos, pero deben validarse: un cliente
  -- malicioso no puede rebajarlos para debilitar el sobre de otro.
  constraint recovery_configurations_kdf_parametros_minimos check (
    (kdf_parameters ->> 'memoriaKiB')::int >= 19456
    and (kdf_parameters ->> 'iteraciones')::int >= 2
    and (kdf_parameters ->> 'paralelismo')::int >= 1
    and length(kdf_parameters ->> 'salBase64') >= 16
  )
);

comment on table public.recovery_configurations is
  'Solo el contenedor cifrado y los parámetros de derivación. Nunca la frase.';

create trigger recovery_configurations_updated_at
  before update on public.recovery_configurations
  for each row execute function public.fn_actualizar_updated_at();

-- ── account_deletion_requests ────────────────────────────────────────────

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  status varchar(20) not null default 'pendiente',
  constraint account_deletion_requests_status_valido
    check (status in ('pendiente', 'cancelada', 'completada')),
  -- Periodo de cancelación: el borrado nunca es inmediato.
  constraint account_deletion_requests_periodo_gracia
    check (scheduled_for > requested_at)
);

create unique index account_deletion_requests_una_activa
  on public.account_deletion_requests (user_id)
  where status = 'pendiente';

-- ───────────────────────────────────────────────────────────
-- 0003_contenido_privado_y_sincronizacion.sql
-- ───────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────
-- 0004_politicas_rls.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0004 — Row Level Security.
--
-- Regla base: un usuario solo alcanza las filas cuyo user_id coincide con
-- auth.uid(). No existe ninguna política que permita a líderes, pastores,
-- mentores ni administradores leer contenido privado, y no debe añadirse
-- ninguna (Documento 12).
--
-- RLS se activa en todas las tablas y además con `force`, de modo que ni
-- siquiera el propietario de las tablas las lea sin política. El acceso
-- administrativo legítimo pasa por la clave de servicio, que salta RLS de
-- forma explícita y auditada.

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.user_key_envelopes enable row level security;
alter table public.user_key_envelopes force row level security;
alter table public.recovery_configurations enable row level security;
alter table public.recovery_configurations force row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;
alter table public.sync_change_log enable row level security;
alter table public.sync_change_log force row level security;
alter table public.sync_conflicts enable row level security;
alter table public.sync_conflicts force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

-- ── profiles ─────────────────────────────────────────────────────────────

create policy profiles_lectura_propia on public.profiles
  for select using (id = (select auth.uid()));

create policy profiles_insercion_propia on public.profiles
  for insert with check (id = (select auth.uid()));

create policy profiles_actualizacion_propia on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Sin política de DELETE: los perfiles no se borran directamente, se marcan
-- y los retira el proceso de eliminación de cuenta.

-- ── user_settings ────────────────────────────────────────────────────────

create policy user_settings_lectura_propia on public.user_settings
  for select using (user_id = (select auth.uid()));

create policy user_settings_insercion_propia on public.user_settings
  for insert with check (user_id = (select auth.uid()));

create policy user_settings_actualizacion_propia on public.user_settings
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── devices ──────────────────────────────────────────────────────────────

create policy devices_lectura_propia on public.devices
  for select using (user_id = (select auth.uid()));

create policy devices_insercion_propia on public.devices
  for insert with check (user_id = (select auth.uid()));

create policy devices_actualizacion_propia on public.devices
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_borrado_propio on public.devices
  for delete using (user_id = (select auth.uid()));

-- ── user_key_envelopes ───────────────────────────────────────────────────

create policy user_key_envelopes_lectura_propia on public.user_key_envelopes
  for select using (user_id = (select auth.uid()));

create policy user_key_envelopes_insercion_propia on public.user_key_envelopes
  for insert with check (user_id = (select auth.uid()));

-- Un sobre no se edita: se revoca creando otro. Solo se permite marcar la
-- revocación.
create policy user_key_envelopes_revocacion_propia on public.user_key_envelopes
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy user_key_envelopes_borrado_propio on public.user_key_envelopes
  for delete using (user_id = (select auth.uid()));

-- ── recovery_configurations ──────────────────────────────────────────────

create policy recovery_configurations_lectura_propia on public.recovery_configurations
  for select using (user_id = (select auth.uid()));

create policy recovery_configurations_insercion_propia on public.recovery_configurations
  for insert with check (user_id = (select auth.uid()));

create policy recovery_configurations_actualizacion_propia on public.recovery_configurations
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── journal_entries ──────────────────────────────────────────────────────
--
-- Patrón que seguirán todas las tablas de contenido privado de la Fase 2.

create policy journal_entries_lectura_propia on public.journal_entries
  for select using (user_id = (select auth.uid()));

create policy journal_entries_insercion_propia on public.journal_entries
  for insert with check (user_id = (select auth.uid()));

create policy journal_entries_actualizacion_propia on public.journal_entries
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de DELETE: el borrado es lógico mediante deleted_at y el
-- purgado definitivo lo hace un proceso con clave de servicio tras la
-- papelera de 30 días (Documento 12).

-- ── sync_change_log ──────────────────────────────────────────────────────
--
-- Solo lectura para el cliente. La bitácora la escribe el trigger, no el
-- usuario: si pudiera insertar filas podría falsear revisiones y provocar
-- que otro de sus dispositivos se saltara cambios.

create policy sync_change_log_lectura_propia on public.sync_change_log
  for select using (user_id = (select auth.uid()));

-- ── sync_conflicts ───────────────────────────────────────────────────────

create policy sync_conflicts_lectura_propia on public.sync_conflicts
  for select using (user_id = (select auth.uid()));

create policy sync_conflicts_insercion_propia on public.sync_conflicts
  for insert with check (user_id = (select auth.uid()));

create policy sync_conflicts_actualizacion_propia on public.sync_conflicts
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sync_conflicts_borrado_propio on public.sync_conflicts
  for delete using (user_id = (select auth.uid()));

-- ── audit_events ─────────────────────────────────────────────────────────
--
-- El usuario puede consultar su propia actividad (dispositivos, accesos),
-- que es un derecho de acceso a sus datos. No puede escribirla ni borrarla:
-- una auditoría que el auditado puede editar no sirve de nada.

create policy audit_events_lectura_propia on public.audit_events
  for select using (user_id = (select auth.uid()));

-- ── account_deletion_requests ────────────────────────────────────────────

create policy account_deletion_requests_lectura_propia on public.account_deletion_requests
  for select using (user_id = (select auth.uid()));

create policy account_deletion_requests_insercion_propia on public.account_deletion_requests
  for insert with check (user_id = (select auth.uid()));

-- Cancelar una solicitud es un derecho del usuario durante el periodo de
-- gracia.
create policy account_deletion_requests_cancelacion_propia on public.account_deletion_requests
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Permisos de esquema ──────────────────────────────────────────────────
--
-- Los roles anónimo y autenticado no reciben permisos por defecto sobre
-- objetos futuros: cada tabla nueva debe conceder los suyos de forma
-- explícita, para que olvidarse de RLS no exponga datos por descuido.

alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon;

grant select, insert, update on
  public.profiles,
  public.user_settings,
  public.devices,
  public.user_key_envelopes,
  public.recovery_configurations,
  public.journal_entries,
  public.sync_conflicts,
  public.account_deletion_requests
  to authenticated;

grant delete on
  public.devices,
  public.user_key_envelopes,
  public.sync_conflicts
  to authenticated;

grant select on public.sync_change_log, public.audit_events to authenticated;
