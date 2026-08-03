-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Esquema completo
--
-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.
-- Concatenación de todos los archivos de supabase/migrations/ en orden.
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

-- ───────────────────────────────────────────────────────────
-- 0005_revocar_privilegios_heredados.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0005 — Revocar los privilegios heredados de Supabase.
--
-- Supabase concede por defecto TODOS los privilegios sobre las tablas nuevas
-- de `public` a `anon` y `authenticated`. La migración 0004 revoca ese ajuste
-- para las tablas *futuras* (`alter default privileges`), pero eso no toca las
-- que ya existían: las de 0002 y 0003 nacieron con los privilegios heredados
-- y ahí siguen.
--
-- El resultado es que `authenticated` conservaba DELETE sobre `journal_entries`
-- y UPDATE y DELETE sobre `sync_change_log` y `audit_events`, operaciones que
-- 0004 nunca concedió. No hubo pérdida de datos porque no existen políticas de
-- borrado y RLS filtra todas las filas, pero eso deja a RLS como única defensa
-- y hace que un intento de borrado responda «correcto, cero filas» en lugar de
-- «no tienes permiso». Añadir mañana una política de lectura amplia por
-- descuido convertiría ese privilegio inofensivo en pérdida de datos.
--
-- Esta migración parte de cero: revoca todo y vuelve a conceder únicamente lo
-- que cada rol necesita. Es idempotente y se puede reaplicar sin efecto.

-- ── Punto de partida: ningún privilegio ──────────────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Y que las tablas futuras tampoco los reciban, por si 0004 se aplicó en un
-- orden distinto o alguien restauró los ajustes de Supabase.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Lo que el usuario autenticado sí necesita ────────────────────────────
--
-- Lectura, alta y modificación de su propio contenido. El filtrado por
-- usuario lo hacen las políticas de 0004; esto solo abre la operación.

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

-- Borrado real solo donde tiene sentido: un dispositivo se desvincula, un
-- sobre de clave se revoca y un conflicto resuelto desaparece. El contenido
-- espiritual nunca se borra así, siempre con `deleted_at` (invariante 6).
grant delete on
  public.devices,
  public.user_key_envelopes,
  public.sync_conflicts
  to authenticated;

-- Solo lectura: la bitácora la escribe el trigger y la auditoría no la edita
-- el auditado.
grant select on public.sync_change_log, public.audit_events to authenticated;

-- La secuencia de revisiones la consume `fn_registrar_cambio_sincronizacion`,
-- que es SECURITY DEFINER y corre como propietaria. Ningún cliente necesita
-- tocarla: si pudiera, podría agotarla o desordenar los cursores de
-- sincronización de sus propios dispositivos.

-- El rol anónimo no recibe nada. No se le concede ninguna tabla.

-- ───────────────────────────────────────────────────────────
-- 0006_oracion.sql
-- ───────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────
-- 0007_habitos.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0007 — Hábitos (Documento 12, tablas 7 y 8).
--
-- Desviación consciente del Documento 12: la tabla 7 describe
-- `title_encrypted` y `description_encrypted` como columnas separadas. Aquí se
-- usa el **sobre común** (`encrypted_payload` + nonce + key_id + versión), con
-- el título y la descripción dentro.
--
-- El motivo no es comodidad. El motor de sincronización, el control de
-- versión y el vínculo criptográfico están construidos sobre un sobre por
-- fila: dos columnas cifradas necesitarían dos nonces y dos vínculos, y un
-- conflicto podría dejar el título de una versión con la descripción de otra.
-- La privacidad es idéntica; la coherencia, no.
--
-- Lo que sí se respeta al pie de la letra: **nada de rachas punitivas**
-- (invariante 12). Por eso no existe ninguna columna de racha ni de fallos
-- consecutivos. Contar lo que alguien no hizo es una decisión de esquema, no
-- solo de interfaz, y no se toma.

-- ── habits ───────────────────────────────────────────────────────────────

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Título y descripción viajan aquí dentro: un hábito puede ser «dejar de
  -- beber» o «volver a hablar con mi padre».
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  category_code varchar(40),
  frequency public.habit_frequency not null default 'daily',
  -- Días y reglas de repetición. Es lo que necesita el servidor para los
  -- recordatorios, y no dice nada del contenido del hábito.
  schedule_config jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date,
  reminder_enabled boolean not null default false,
  reminder_time time,
  is_active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint habits_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint habits_nonce_no_vacio check (length(nonce) > 0),
  constraint habits_version_positiva check (version >= 1),
  constraint habits_fechas_coherentes check (end_date is null or end_date >= start_date),
  -- Categorías generales, nunca texto de la persona.
  constraint habits_categoria_valida check (
    category_code is null
    or category_code in (
      'oracion', 'lectura', 'gratitud', 'servicio',
      'ayuno', 'comunidad', 'descanso', 'otro'
    )
  )
);

comment on table public.habits is
  'Hábitos espirituales. Título y descripción cifrados; sin rachas ni conteo de fallos.';
comment on column public.habits.schedule_config is
  'Días y reglas de repetición. No describe el hábito, solo cuándo toca.';

create index habits_user_idx on public.habits (user_id) where deleted_at is null;
create index habits_user_activos_idx on public.habits (user_id, is_active) where deleted_at is null;
create index habits_user_actualizado_idx on public.habits (user_id, updated_at desc);
create index habits_user_revision_idx on public.habits (user_id, sync_revision);

create trigger habits_updated_at
  before update on public.habits
  for each row execute function public.fn_actualizar_updated_at();

create trigger habits_version
  before update on public.habits
  for each row execute function public.fn_incrementar_version();

create trigger habits_sync_log
  before insert or update on public.habits
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── habit_logs ───────────────────────────────────────────────────────────
--
-- Un registro por día cumplido. **Solo se anota lo que se hizo**: no existe
-- fila para un día fallado, y por eso no hay forma de construir una racha
-- punitiva a partir de esta tabla aunque alguien quisiera.

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,

  completion_date date not null,
  completed boolean not null default true,
  completed_at timestamptz,

  -- Nota opcional del día. Siempre hay sobre, aunque la nota esté vacía: así
  -- el motor trata todas las filas igual.
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

  constraint habit_logs_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint habit_logs_version_positiva check (version >= 1),
  -- Un día se cumple una vez. Sin esto, dos dispositivos sin conexión
  -- crearían dos registros del mismo día y el recuento saldría doblado.
  constraint habit_logs_un_dia_por_habito unique (habit_id, completion_date)
);

create index habit_logs_user_fecha_idx on public.habit_logs (user_id, completion_date desc);
create index habit_logs_habito_fecha_idx on public.habit_logs (habit_id, completion_date desc);
create index habit_logs_user_revision_idx on public.habit_logs (user_id, sync_revision);

create trigger habit_logs_updated_at
  before update on public.habit_logs
  for each row execute function public.fn_actualizar_updated_at();

create trigger habit_logs_version
  before update on public.habit_logs
  for each row execute function public.fn_incrementar_version();

create trigger habit_logs_sync_log
  before insert or update on public.habit_logs
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.habits enable row level security;
alter table public.habits force row level security;
alter table public.habit_logs enable row level security;
alter table public.habit_logs force row level security;

create policy habits_lectura_propia on public.habits
  for select using (user_id = (select auth.uid()));
create policy habits_insercion_propia on public.habits
  for insert with check (user_id = (select auth.uid()));
create policy habits_actualizacion_propia on public.habits
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy habit_logs_lectura_propia on public.habit_logs
  for select using (user_id = (select auth.uid()));
create policy habit_logs_insercion_propia on public.habit_logs
  for insert with check (user_id = (select auth.uid()));
create policy habit_logs_actualizacion_propia on public.habit_logs
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────

grant select, insert, update on public.habits, public.habit_logs to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0008_biblia.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0008 — Biblia (Documento 12, tablas 16 a 20).
--
-- Este módulo rompe el molde de los anteriores, y el esquema tiene que
-- reflejarlo. Hay dos naturalezas distintas conviviendo:
--
--   · **Texto bíblico**: público, compartido por todos, licenciado por un
--     tercero. No pertenece al usuario y no se cifra. Se puede cachear.
--   · **Notas del usuario sobre un versículo**: privadas y cifradas, como el
--     resto de su contenido.
--
-- Mezclarlas en una sola tabla habría sido el error fácil. Van separadas
-- porque sus reglas de acceso son opuestas.
--
-- **El catálogo lo carga un proceso administrativo con la clave de servicio,
-- nunca el cliente.** Un cliente que pudiera escribir versículos podría
-- corromper el texto bíblico para todo el mundo, no solo para él.

-- ── bible_translations ───────────────────────────────────────────────────

create table public.bible_translations (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  name text not null,
  language_code varchar(10) not null,
  publisher text,
  -- Sin licencia válida no se publica una traducción. Es una obligación
  -- legal, no una preferencia.
  license_type varchar(40) not null,
  license_reference text,
  offline_available boolean not null default false,
  audio_available boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bible_translations_licencia_valida
    check (license_type in ('dominio_publico', 'licencia_abierta', 'licencia_comercial'))
);

comment on table public.bible_translations is
  'Catálogo de traducciones. No publicar ninguna sin licencia válida.';

create index bible_translations_idioma_idx
  on public.bible_translations (language_code)
  where is_active;

create trigger bible_translations_updated_at
  before update on public.bible_translations
  for each row execute function public.fn_actualizar_updated_at();

-- ── bible_books ──────────────────────────────────────────────────────────

create table public.bible_books (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.bible_translations (id) on delete cascade,
  book_code varchar(20) not null,
  book_name text not null,
  testament varchar(20) not null,
  book_order smallint not null,
  chapter_count smallint not null,
  constraint bible_books_unico unique (translation_id, book_code),
  constraint bible_books_testamento_valido check (testament in ('antiguo', 'nuevo')),
  constraint bible_books_capitulos_positivos check (chapter_count > 0)
);

create index bible_books_orden_idx on public.bible_books (translation_id, book_order);

-- ── bible_verses ─────────────────────────────────────────────────────────

create table public.bible_verses (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.bible_translations (id) on delete cascade,
  book_code varchar(20) not null,
  chapter_number smallint not null,
  verse_number smallint not null,
  verse_text text not null,
  search_vector tsvector,
  constraint bible_verses_unico
    unique (translation_id, book_code, chapter_number, verse_number),
  constraint bible_verses_numeros_positivos
    check (chapter_number > 0 and verse_number > 0)
);

comment on table public.bible_verses is
  'Texto bíblico. Público y licenciado: no pertenece al usuario y no se cifra.';

create index bible_verses_capitulo_idx
  on public.bible_verses (translation_id, book_code, chapter_number, verse_number);
create index bible_verses_busqueda_idx on public.bible_verses using gin (search_vector);

-- ── bible_notes ──────────────────────────────────────────────────────────
--
-- La otra cara: lo que la persona escribe sobre un pasaje. Va cifrado y pasa
-- por el mismo motor de sincronización que el diario o las oraciones.
--
-- La **referencia** (libro, capítulo, versículos) queda en claro porque hace
-- falta para mostrar la nota junto a su pasaje sin descargar y descifrar
-- todas las notas de la persona. Es un compromiso consciente: revela qué
-- pasajes le interesan, no qué piensa de ellos.

create table public.bible_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  translation_id uuid references public.bible_translations (id) on delete set null,
  book_code varchar(20) not null,
  chapter_number smallint not null,
  verse_start smallint,
  verse_end smallint,

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

  constraint bible_notes_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint bible_notes_nonce_no_vacio check (length(nonce) > 0),
  constraint bible_notes_version_positiva check (version >= 1),
  constraint bible_notes_rango_coherente
    check (verse_end is null or verse_start is null or verse_end >= verse_start)
);

create index bible_notes_user_pasaje_idx
  on public.bible_notes (user_id, book_code, chapter_number)
  where deleted_at is null;
create index bible_notes_user_actualizado_idx on public.bible_notes (user_id, updated_at desc);
create index bible_notes_user_revision_idx on public.bible_notes (user_id, sync_revision);

create trigger bible_notes_updated_at
  before update on public.bible_notes
  for each row execute function public.fn_actualizar_updated_at();

create trigger bible_notes_version
  before update on public.bible_notes
  for each row execute function public.fn_incrementar_version();

create trigger bible_notes_sync_log
  before insert or update on public.bible_notes
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────
--
-- Las tablas públicas también llevan RLS activado. No es redundante: sin
-- política, la tabla queda cerrada por defecto, y así conceder lectura es un
-- acto explícito y visible en lugar de un olvido.

alter table public.bible_translations enable row level security;
alter table public.bible_translations force row level security;
alter table public.bible_books enable row level security;
alter table public.bible_books force row level security;
alter table public.bible_verses enable row level security;
alter table public.bible_verses force row level security;
alter table public.bible_notes enable row level security;
alter table public.bible_notes force row level security;

-- El catálogo se lee, no se escribe. Cualquiera con sesión puede leerlo: es
-- el mismo texto para todos y no revela nada de nadie.
create policy bible_translations_lectura on public.bible_translations
  for select using (is_active);
create policy bible_books_lectura on public.bible_books for select using (true);
create policy bible_verses_lectura on public.bible_verses for select using (true);

-- Sin políticas de INSERT, UPDATE ni DELETE en las tres: el catálogo lo carga
-- un proceso con clave de servicio, que salta RLS de forma explícita.

create policy bible_notes_lectura_propia on public.bible_notes
  for select using (user_id = (select auth.uid()));
create policy bible_notes_insercion_propia on public.bible_notes
  for insert with check (user_id = (select auth.uid()));
create policy bible_notes_actualizacion_propia on public.bible_notes
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────

grant select on public.bible_translations, public.bible_books, public.bible_verses
  to authenticated;
grant select, insert, update on public.bible_notes to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0009_biblioteca_de_vida.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0009 — Biblioteca de Vida (Documento 12, tabla 31).
--
-- Guarda **referencias y clasificación**, nunca una copia del contenido. Si
-- duplicara el original, cada entrada del diario existiría dos veces y
-- borrarla dejaría un rastro legible en el otro sitio. La regla del Documento
-- 12 es explícita y aquí la impone la forma de la tabla: hay `source_type` y
-- `source_id`, no hay columna de contenido original.
--
-- Misma desviación consciente que en `habits`: el Documento describe
-- `encrypted_title`, `encrypted_summary` y `encrypted_tags` como columnas
-- separadas; aquí van los tres dentro del sobre común. Tres columnas cifradas
-- necesitarían tres nonces y tres vínculos, y un conflicto podría dejar el
-- título de una versión con las etiquetas de otra.
--
-- **La clasificación ocurre en el dispositivo, después de descifrar.** El
-- servidor nunca sabe de qué trata una entrada: solo ve que existe una
-- referencia a un registro que ya conocía.

create table public.life_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Qué módulo y qué registro. No añade información: el servidor ya veía ese
  -- registro y su tipo en la bitácora de sincronización.
  source_type varchar(30) not null,
  source_id uuid not null,

  -- Título, resumen y temas espirituales, cifrados. Los temas dicen mucho:
  -- «ansiedad» o «perdón» describen un momento de la vida de alguien.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  occurred_at timestamptz,
  is_favorite boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint life_library_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint life_library_nonce_no_vacio check (length(nonce) > 0),
  constraint life_library_version_positiva check (version >= 1),
  -- Una referencia por registro de origen. Sin esto, reclasificar crearía una
  -- entrada nueva cada vez y la biblioteca se llenaría de duplicados.
  constraint life_library_una_por_origen unique (user_id, source_type, source_id),
  constraint life_library_origen_valido check (
    source_type in ('diario', 'oracion', 'habito', 'notaBiblica', 'memorial', 'notaSermon')
  )
);

comment on table public.life_library_items is
  'Referencias clasificadas. Nunca una copia del contenido original.';

create index life_library_user_idx
  on public.life_library_items (user_id, occurred_at desc)
  where deleted_at is null;
create index life_library_user_origen_idx on public.life_library_items (user_id, source_type);
create index life_library_user_revision_idx on public.life_library_items (user_id, sync_revision);

create trigger life_library_updated_at
  before update on public.life_library_items
  for each row execute function public.fn_actualizar_updated_at();

create trigger life_library_version
  before update on public.life_library_items
  for each row execute function public.fn_incrementar_version();

create trigger life_library_sync_log
  before insert or update on public.life_library_items
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.life_library_items enable row level security;
alter table public.life_library_items force row level security;

create policy life_library_lectura_propia on public.life_library_items
  for select using (user_id = (select auth.uid()));
create policy life_library_insercion_propia on public.life_library_items
  for insert with check (user_id = (select auth.uid()));
create policy life_library_actualizacion_propia on public.life_library_items
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.life_library_items to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0010_ia.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0010 — Asistente de IA (Documento 12, tablas 29 y 30).
--
-- Es el módulo con más superficie de riesgo del proyecto, y el esquema
-- refleja tres decisiones que no son negociables:
--
--   1. **Las conversaciones se cifran en reposo.** Ni el título ni un solo
--      mensaje quedan legibles en el servidor. Lo que alguien le cuenta a
--      este asistente puede ser lo más delicado que escriba en toda la
--      aplicación.
--
--   2. **`provider_reference_hash` no puede revelar nada del usuario.** Es
--      una referencia opaca a la conversación en el proveedor, no un
--      identificador derivado de quién es la persona.
--
--   3. **`safety_category` es un código cerrado.** Marca que un mensaje entró
--      en Modo Crisis, sin decir nada de su contenido. Sirve para aplicar la
--      política de retención especial, no para clasificar a nadie.
--
-- **Estas conversaciones nunca se usan para entrenamiento.** No hay columna
-- que lo permita ni proceso que las exporte.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- El título lo escribe o lo deduce el cliente, y va cifrado como todo lo
  -- demás: «¿por qué Dios permitió lo de mi hija?» es un título.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  conversation_type varchar(30) not null default 'general',
  -- Referencia opaca en el proveedor. Nunca se deriva del usuario.
  provider_reference_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint ai_conversations_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint ai_conversations_nonce_no_vacio check (length(nonce) > 0),
  constraint ai_conversations_version_positiva check (version >= 1),
  constraint ai_conversations_tipo_valido
    check (conversation_type in ('general', 'biblia', 'devocional', 'plan', 'pulso'))
);

comment on table public.ai_conversations is
  'Conversaciones con el asistente. Cifradas en reposo y nunca usadas para entrenamiento.';
comment on column public.ai_conversations.provider_reference_hash is
  'Referencia opaca en el proveedor. No se deriva del usuario ni revela nada de él.';

create index ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc)
  where deleted_at is null;
create index ai_conversations_user_revision_idx on public.ai_conversations (user_id, sync_revision);

create trigger ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.fn_actualizar_updated_at();

create trigger ai_conversations_version
  before update on public.ai_conversations
  for each row execute function public.fn_incrementar_version();

create trigger ai_conversations_sync_log
  before insert or update on public.ai_conversations
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── ai_messages ──────────────────────────────────────────────────────────

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,

  role varchar(20) not null,

  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  -- Solo el hecho de que hubo una señal de crisis, nunca cuál ni qué se dijo.
  safety_category varchar(30),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint ai_messages_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint ai_messages_version_positiva check (version >= 1),
  constraint ai_messages_rol_valido check (role in ('usuario', 'asistente')),
  constraint ai_messages_categoria_valida
    check (safety_category is null or safety_category in ('crisis'))
);

comment on column public.ai_messages.safety_category is
  'Marca que el mensaje entró en Modo Crisis. No describe el contenido ni clasifica a la persona.';

create index ai_messages_conversacion_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_revision_idx on public.ai_messages (user_id, sync_revision);

create trigger ai_messages_updated_at
  before update on public.ai_messages
  for each row execute function public.fn_actualizar_updated_at();

create trigger ai_messages_version
  before update on public.ai_messages
  for each row execute function public.fn_incrementar_version();

create trigger ai_messages_sync_log
  before insert or update on public.ai_messages
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;

create policy ai_conversations_lectura_propia on public.ai_conversations
  for select using (user_id = (select auth.uid()));
create policy ai_conversations_insercion_propia on public.ai_conversations
  for insert with check (user_id = (select auth.uid()));
create policy ai_conversations_actualizacion_propia on public.ai_conversations
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ai_messages_lectura_propia on public.ai_messages
  for select using (user_id = (select auth.uid()));
create policy ai_messages_insercion_propia on public.ai_messages
  for insert with check (user_id = (select auth.uid()));
create policy ai_messages_actualizacion_propia on public.ai_messages
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin políticas para nadie más. Ningún líder, pastor ni administrador puede
-- leer una conversación con el asistente, y no debe añadirse ninguna política
-- que lo permita: es donde alguien cuenta lo que no le cuenta a nadie.

grant select, insert, update on public.ai_conversations, public.ai_messages to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0011_memorial.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0011 — Memorial (Documento 12, tabla 13).
--
-- El memorial es el registro de lo que alguien vio que Dios hizo. Nace casi
-- siempre de una oración marcada como respondida, y por eso `prayer_id` es la
-- única relación de la tabla.
--
-- Tres decisiones sobre la forma:
--
--   1. **`prayer_id` es opcional y `on delete set null`.** Un memorial puede
--      escribirse sin que haya una petición detrás —hay cosas que uno no pidió
--      y agradece igual—, y borrar la petición no puede llevarse por delante
--      el recuerdo de la respuesta.
--
--   2. **`occurred_on` es una fecha, no un instante.** Nadie recuerda a qué
--      hora pasó algo importante; recuerda el día. Un `timestamptz` obligaría
--      a inventar una hora y a convertirla entre zonas horarias, y la fecha
--      del recuerdo cambiaría al viajar.
--
--   3. **Nada del contenido queda fuera del sobre.** Ni un título, ni un
--      resumen. El Documento 12 lo deja en `encrypted_payload` y aquí no se
--      añade ninguna columna de texto que el servidor pueda leer.
--
-- El invariante 3 se aplica sin matices: **ningún líder, pastor, mentor ni
-- administrador puede leer un memorial**, ni siquiera cuando la petición de la
-- que nació estuviera compartida. Compartir una oración no comparte lo que
-- alguien escribió después sobre lo que le pasó.

create table public.memorials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- La petición de la que nació, si nació de una. Ver decisión 1.
  prayer_id uuid references public.prayers (id) on delete set null,

  -- El día en que ocurrió, no el día en que se escribió. Ver decisión 2.
  occurred_on date,

  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  is_favorite boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint memorials_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint memorials_nonce_no_vacio check (length(nonce) > 0),
  constraint memorials_version_positiva check (version >= 1)
);

comment on table public.memorials is
  'Registro de respuestas recibidas. Cifrado entero; ni la iglesia ni un mentor pueden leerlo.';
comment on column public.memorials.prayer_id is
  'Petición de origen, opcional. Borrarla no borra el memorial.';

create index memorials_user_fecha_idx
  on public.memorials (user_id, occurred_on desc)
  where deleted_at is null;
create index memorials_user_favoritos_idx
  on public.memorials (user_id, is_favorite)
  where deleted_at is null and is_favorite;
create index memorials_peticion_idx on public.memorials (prayer_id);
create index memorials_user_revision_idx on public.memorials (user_id, sync_revision);

create trigger memorials_updated_at
  before update on public.memorials
  for each row execute function public.fn_actualizar_updated_at();

create trigger memorials_version
  before update on public.memorials
  for each row execute function public.fn_incrementar_version();

create trigger memorials_sync_log
  before insert or update on public.memorials
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.memorials enable row level security;
alter table public.memorials force row level security;

create policy memorials_lectura_propia on public.memorials
  for select using (user_id = (select auth.uid()));
create policy memorials_insercion_propia on public.memorials
  for insert with check (user_id = (select auth.uid()));
create policy memorials_actualizacion_propia on public.memorials
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de borrado: el memorial se retira con `deleted_at` y espera en
-- la papelera 30 días (invariante 6). Es justo el contenido que alguien puede
-- borrar en un mal día y querer de vuelta al siguiente.
grant select, insert, update on public.memorials to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0012_iglesia.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0012 — Iglesia y comunidad (Documento 12, tablas 32 a 38, y 12).
--
-- Es la migración con más superficie de permisos del proyecto, y por eso
-- conviene decir primero lo que **no** hace:
--
--   **Ninguna política de este archivo permite a un líder, un pastor, un
--   mentor ni un administrador leer contenido espiritual privado.** No hay
--   una política sobre `journal_entries`, ni sobre `prayers`, ni sobre
--   `memorials`, ni sobre `ai_messages`. Ni siquiera una restringida. El
--   invariante 3 no admite matices y la forma de garantizarlo es que el
--   permiso no exista, no que esté apagado.
--
-- Lo que sí se comparte es siempre **una copia cifrada para el destinatario**
-- (`prayer_shares`), nunca acceso a la fila original. Esa diferencia es todo
-- el modelo: revocar es dejar de descifrar, no confiar en que una política
-- deje de aplicarse.
--
-- Cuatro decisiones de diseño:
--
--   1. **La pertenencia se comprueba con una función `security definer`.**
--      Una política que consultara `church_memberships` directamente se
--      llamaría a sí misma al evaluar las políticas de esa misma tabla. La
--      función corta la recursión y además se puede probar aparte.
--
--   2. **Un miembro ve a los demás miembros de su iglesia, no sus perfiles.**
--      `church_memberships` dice que alguien pertenece y con qué rol. El
--      nombre y el resto del perfil siguen protegidos por la política de
--      `profiles`, que no se toca aquí.
--
--   3. **`prayer_shares` tiene un único destino válido**, impuesto por una
--      restricción y no por el código: tres columnas de destino con dos
--      rellenas serían un permiso ambiguo, y un permiso ambiguo se acaba
--      resolviendo a favor de quien pide.
--
--   4. **Un permiso caducado o revocado no concede nada.** Se comprueba en la
--      propia política, no al leer: si dependiera del cliente, bastaría con
--      no preguntar.

-- ── churches ─────────────────────────────────────────────────────────────

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  logo_path text,
  country_code varchar(2),
  city text,
  address text,
  timezone text not null default 'UTC',
  contact_email text,
  website_url text,
  status varchar(20) not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint churches_nombre_no_vacio check (length(trim(name)) > 0),
  constraint churches_slug_valido check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  constraint churches_status_valido check (status in ('active', 'suspended', 'closed'))
);

comment on table public.churches is
  'Datos públicos de una iglesia. Nunca contiene información de sus miembros.';

create index churches_status_idx on public.churches (status);

create trigger churches_updated_at
  before update on public.churches
  for each row execute function public.fn_actualizar_updated_at();

-- ── church_memberships ───────────────────────────────────────────────────

create table public.church_memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  role public.church_role not null default 'member',
  membership_status varchar(20) not null default 'active',
  joined_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_memberships_unica unique (church_id, user_id),
  constraint church_memberships_status_valido
    check (membership_status in ('pending', 'active', 'inactive', 'left'))
);

comment on table public.church_memberships is
  'Pertenencia y rol. Un rol NUNCA concede acceso a contenido espiritual privado.';

create index church_memberships_church_idx
  on public.church_memberships (church_id, membership_status);
create index church_memberships_user_idx on public.church_memberships (user_id);

create trigger church_memberships_updated_at
  before update on public.church_memberships
  for each row execute function public.fn_actualizar_updated_at();

-- ── Funciones de pertenencia ─────────────────────────────────────────────
--
-- `security definer` para cortar la recursión de políticas (decisión 1).
-- `search_path` fijado: sin él, un esquema en el camino de búsqueda del
-- llamante podría suplantar a `public` y la función devolvería lo que otro
-- quisiera.

create or replace function public.fn_es_miembro_activo(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = p_church_id
      and user_id = (select auth.uid())
      and membership_status = 'active'
  );
$$;

comment on function public.fn_es_miembro_activo(uuid) is
  'Pertenencia activa del usuario actual. No concede acceso a nada privado.';

create or replace function public.fn_lidera_iglesia(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = p_church_id
      and user_id = (select auth.uid())
      and membership_status = 'active'
      and role in ('leader', 'pastor', 'administrator')
  );
$$;

comment on function public.fn_lidera_iglesia(uuid) is
  'Permite administrar la vida institucional: eventos, grupos y publicaciones. '
  'NUNCA leer contenido espiritual privado de un miembro.';

revoke all on function public.fn_es_miembro_activo(uuid) from public;
revoke all on function public.fn_lidera_iglesia(uuid) from public;
grant execute on function public.fn_es_miembro_activo(uuid) to authenticated;
grant execute on function public.fn_lidera_iglesia(uuid) to authenticated;

-- ── church_groups ────────────────────────────────────────────────────────

create table public.church_groups (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,

  name text not null,
  description text,
  group_type varchar(30) not null default 'grupo',
  leader_user_id uuid references auth.users (id) on delete set null,
  meeting_schedule jsonb,
  status varchar(20) not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_groups_nombre_no_vacio check (length(trim(name)) > 0),
  constraint church_groups_tipo_valido check (
    group_type in ('grupo', 'mentoria', 'discipulado', 'escuela', 'ministerio')
  ),
  constraint church_groups_status_valido check (status in ('active', 'inactive', 'closed'))
);

create index church_groups_church_idx on public.church_groups (church_id, status);

create trigger church_groups_updated_at
  before update on public.church_groups
  for each row execute function public.fn_actualizar_updated_at();

-- ── group_memberships ────────────────────────────────────────────────────

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.church_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  role varchar(20) not null default 'member',
  status varchar(20) not null default 'active',
  joined_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_memberships_unica unique (group_id, user_id),
  constraint group_memberships_rol_valido check (role in ('member', 'leader')),
  constraint group_memberships_status_valido check (status in ('pending', 'active', 'left'))
);

create index group_memberships_group_idx on public.group_memberships (group_id, status);
create index group_memberships_user_idx on public.group_memberships (user_id);

create trigger group_memberships_updated_at
  before update on public.group_memberships
  for each row execute function public.fn_actualizar_updated_at();

create or replace function public.fn_pertenece_al_grupo(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

revoke all on function public.fn_pertenece_al_grupo(uuid) from public;
grant execute on function public.fn_pertenece_al_grupo(uuid) to authenticated;

-- ── church_events ────────────────────────────────────────────────────────

create table public.church_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  group_id uuid references public.church_groups (id) on delete set null,

  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer,
  registration_required boolean not null default false,
  status varchar(20) not null default 'scheduled',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint church_events_titulo_no_vacio check (length(trim(title)) > 0),
  constraint church_events_fechas_coherentes check (ends_at is null or ends_at >= starts_at),
  constraint church_events_aforo_valido check (capacity is null or capacity > 0),
  constraint church_events_status_valido check (status in ('scheduled', 'cancelled', 'finished'))
);

create index church_events_church_idx
  on public.church_events (church_id, starts_at)
  where deleted_at is null;

create trigger church_events_updated_at
  before update on public.church_events
  for each row execute function public.fn_actualizar_updated_at();

-- ── event_registrations ──────────────────────────────────────────────────

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.church_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  status varchar(20) not null default 'registered',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,

  constraint event_registrations_unica unique (event_id, user_id),
  constraint event_registrations_status_valido
    check (status in ('registered', 'cancelled', 'attended'))
);

create index event_registrations_event_idx on public.event_registrations (event_id, status);
create index event_registrations_user_idx on public.event_registrations (user_id);

-- ── mentor_relationships ─────────────────────────────────────────────────

create table public.mentor_relationships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches (id) on delete set null,
  mentor_user_id uuid not null references auth.users (id) on delete cascade,
  mentee_user_id uuid not null references auth.users (id) on delete cascade,

  status varchar(20) not null default 'pending',
  -- Solo describe qué información compartida alcanza el mentor. Nunca concede
  -- acceso general al diario, a la IA ni al memorial: no hay política que lo
  -- permita, así que ningún valor de este campo puede abrirla.
  permissions jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mentor_relationships_distintos check (mentor_user_id <> mentee_user_id),
  constraint mentor_relationships_status_valido
    check (status in ('pending', 'active', 'ended', 'rejected'))
);

comment on column public.mentor_relationships.permissions is
  'Qué información compartida alcanza el mentor. Nunca acceso general a nada privado.';

create index mentor_relationships_mentor_idx
  on public.mentor_relationships (mentor_user_id, status);
create index mentor_relationships_mentee_idx
  on public.mentor_relationships (mentee_user_id, status);

create trigger mentor_relationships_updated_at
  before update on public.mentor_relationships
  for each row execute function public.fn_actualizar_updated_at();

-- ── prayer_shares ────────────────────────────────────────────────────────
--
-- Aquí está el corazón del modelo de compartición. El destinatario **no lee
-- la fila de `prayers`**: lee esta, que contiene una copia cifrada para él.
-- Revocar es dejar de poder descifrar, no confiar en que una política deje de
-- aplicarse.

create table public.prayer_shares (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayers (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,

  -- Un único destino. Ver decisión 3.
  recipient_user_id uuid references auth.users (id) on delete cascade,
  group_id uuid references public.church_groups (id) on delete cascade,
  church_id uuid references public.churches (id) on delete cascade,

  -- Copia cifrada para el destinatario, con su clave de contenido envuelta.
  -- El servidor no puede abrir ninguna de las dos.
  encrypted_shared_payload text not null,
  encrypted_content_key text not null,
  nonce text not null,

  permission_level varchar(30) not null default 'read',
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),

  constraint prayer_shares_payload_no_vacio check (length(encrypted_shared_payload) > 0),
  constraint prayer_shares_clave_no_vacia check (length(encrypted_content_key) > 0),
  constraint prayer_shares_permiso_valido check (permission_level in ('read', 'read_and_pray')),
  -- Exactamente un destino, ni cero ni dos.
  constraint prayer_shares_un_solo_destino check (
    (recipient_user_id is not null)::int
    + (group_id is not null)::int
    + (church_id is not null)::int = 1
  )
  -- Sin restricción sobre `expires_at`. La tentación era exigir que fuera
  -- futura, pero eso impediría acortar una caducidad ya puesta —una forma
  -- legítima de cortar el acceso— y dejaría la ruta de caducidad sin poder
  -- probarse. Una caducidad en el pasado falla hacia el lado seguro: la
  -- política la deja invisible, que es justo lo que se quiere.
);

comment on table public.prayer_shares is
  'Copia cifrada de una petición para un destinatario. No concede acceso a la petición original '
  'ni a ningún otro contenido del usuario.';

create index prayer_shares_owner_idx on public.prayer_shares (owner_user_id, prayer_id);
create index prayer_shares_destinatario_idx
  on public.prayer_shares (recipient_user_id)
  where revoked_at is null;
create index prayer_shares_grupo_idx on public.prayer_shares (group_id) where revoked_at is null;
create index prayer_shares_iglesia_idx on public.prayer_shares (church_id) where revoked_at is null;

/**
 * ¿Sigue vigente esta compartición?
 *
 * Se comprueba en la política, no al leer (decisión 4). Si dependiera del
 * cliente, bastaría con no preguntar.
 */
create or replace function public.fn_comparticion_vigente(
  p_revoked_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select p_revoked_at is null and (p_expires_at is null or p_expires_at > now());
$$;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.churches enable row level security;
alter table public.churches force row level security;
alter table public.church_memberships enable row level security;
alter table public.church_memberships force row level security;
alter table public.church_groups enable row level security;
alter table public.church_groups force row level security;
alter table public.group_memberships enable row level security;
alter table public.group_memberships force row level security;
alter table public.church_events enable row level security;
alter table public.church_events force row level security;
alter table public.event_registrations enable row level security;
alter table public.event_registrations force row level security;
alter table public.mentor_relationships enable row level security;
alter table public.mentor_relationships force row level security;
alter table public.prayer_shares enable row level security;
alter table public.prayer_shares force row level security;

-- Iglesias: cualquiera con sesión puede buscarlas para unirse. Solo hay datos
-- institucionales, ninguno de una persona.
create policy churches_lectura on public.churches
  for select using (status = 'active');
create policy churches_actualizacion_por_liderazgo on public.churches
  for update using (public.fn_lidera_iglesia(id))
  with check (public.fn_lidera_iglesia(id));

-- Membresías: se ve la propia siempre, y las de la iglesia a la que se
-- pertenece. Ver decisión 2: esto dice quién pertenece, no quién es.
create policy church_memberships_lectura on public.church_memberships
  for select using (
    user_id = (select auth.uid()) or public.fn_es_miembro_activo(church_id)
  );
-- Unirse es un acto propio: se inserta la fila de uno mismo.
create policy church_memberships_insercion_propia on public.church_memberships
  for insert with check (user_id = (select auth.uid()));
-- El usuario puede abandonar la iglesia cuando quiera; el liderazgo gestiona
-- roles y estados de los demás.
create policy church_memberships_actualizacion on public.church_memberships
  for update using (
    user_id = (select auth.uid()) or public.fn_lidera_iglesia(church_id)
  )
  with check (
    user_id = (select auth.uid()) or public.fn_lidera_iglesia(church_id)
  );

create policy church_groups_lectura on public.church_groups
  for select using (public.fn_es_miembro_activo(church_id));
create policy church_groups_gestion on public.church_groups
  for insert with check (public.fn_lidera_iglesia(church_id));
create policy church_groups_actualizacion on public.church_groups
  for update using (public.fn_lidera_iglesia(church_id))
  with check (public.fn_lidera_iglesia(church_id));

create policy group_memberships_lectura on public.group_memberships
  for select using (
    user_id = (select auth.uid()) or public.fn_pertenece_al_grupo(group_id)
  );
create policy group_memberships_insercion_propia on public.group_memberships
  for insert with check (user_id = (select auth.uid()));
create policy group_memberships_actualizacion_propia on public.group_memberships
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy church_events_lectura on public.church_events
  for select using (deleted_at is null and public.fn_es_miembro_activo(church_id));
create policy church_events_gestion on public.church_events
  for insert with check (public.fn_lidera_iglesia(church_id));
create policy church_events_actualizacion on public.church_events
  for update using (public.fn_lidera_iglesia(church_id))
  with check (public.fn_lidera_iglesia(church_id));

-- Inscripciones: cada uno ve la suya. El liderazgo ve las de sus eventos,
-- porque para eso existe el control de asistencia.
create policy event_registrations_lectura on public.event_registrations
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  );
create policy event_registrations_insercion_propia on public.event_registrations
  for insert with check (user_id = (select auth.uid()));
create policy event_registrations_actualizacion on public.event_registrations
  for update using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  );

-- Mentorías: las ven las dos partes y nadie más. Ni siquiera el liderazgo de
-- la iglesia: a quién acompaña quién no es información institucional.
create policy mentor_relationships_lectura on public.mentor_relationships
  for select using (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );
create policy mentor_relationships_insercion on public.mentor_relationships
  for insert with check (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );
-- El acompañado puede revocar cuando quiera; el mentor solo puede aceptar o
-- terminar la suya.
create policy mentor_relationships_actualizacion on public.mentor_relationships
  for update using (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  )
  with check (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );

-- Comparticiones: el propietario ve las suyas; el destinatario ve solo las
-- vigentes que le apuntan a él, a un grupo suyo o a su iglesia.
create policy prayer_shares_lectura_propietario on public.prayer_shares
  for select using (owner_user_id = (select auth.uid()));

create policy prayer_shares_lectura_destinatario on public.prayer_shares
  for select using (
    public.fn_comparticion_vigente(revoked_at, expires_at)
    and (
      recipient_user_id = (select auth.uid())
      or (group_id is not null and public.fn_pertenece_al_grupo(group_id))
      or (church_id is not null and public.fn_es_miembro_activo(church_id))
    )
  );

-- Solo se comparte lo propio, y solo si la petición es de uno.
create policy prayer_shares_insercion_propia on public.prayer_shares
  for insert with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.prayers p
      where p.id = prayer_id and p.user_id = (select auth.uid())
    )
  );

-- Revocar es una actualización, y solo la hace el propietario.
create policy prayer_shares_actualizacion_propietario on public.prayer_shares
  for update using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────
--
-- Sin DELETE en ninguna: las membresías se marcan, los eventos se cancelan y
-- las comparticiones se revocan. Un borrado físico dejaría al otro lado sin
-- forma de saber que algo cambió.

grant select on public.churches to authenticated;
grant update on public.churches to authenticated;
grant select, insert, update on public.church_memberships to authenticated;
grant select, insert, update on public.church_groups to authenticated;
grant select, insert, update on public.group_memberships to authenticated;
grant select, insert, update on public.church_events to authenticated;
grant select, insert, update on public.event_registrations to authenticated;
grant select, insert, update on public.mentor_relationships to authenticated;
grant select, insert, update on public.prayer_shares to authenticated;

-- Y lo que este archivo NO concede, dicho en voz alta para que se note si
-- alguien lo añade: ninguna política ni privilegio sobre journal_entries,
-- prayers, memorials, bible_notes, life_library_items, ai_conversations,
-- ai_messages, habits ni habit_logs. Un rol de iglesia no alcanza nada de eso.

-- ── user_sharing_keys ────────────────────────────────────────────────────
--
-- **Desviación consciente del Documento 12**, que no contempla esta tabla.
-- Hace falta para que compartir sea posible sin que el servidor pueda leer:
-- quien comparte necesita la clave pública del destinatario, y sin un sitio
-- donde publicarla el único camino sería que el servidor mediara, que es
-- exactamente lo que el invariante 1 impide.
--
-- La alternativa era añadir la columna a `profiles`, pero eso obligaría a
-- abrir la lectura de perfiles ajenos —nombre, año de nacimiento, país— solo
-- para llegar a un dato que no es personal. Una tabla aparte con un único
-- dato público es menos superficie.
--
-- **Una clave pública es pública por definición.** Publicarla no filtra nada:
-- sin la privada, que se deriva de la clave maestra y nunca sale del
-- dispositivo, no abre ningún sobre.

create table public.user_sharing_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_key text not null,
  algorithm varchar(20) not null default 'x25519',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_sharing_keys_publica_no_vacia check (length(public_key) > 0),
  constraint user_sharing_keys_algoritmo_valido check (algorithm in ('x25519'))
);

comment on table public.user_sharing_keys is
  'Clave pública de compartición. Nunca contiene material privado: sin la privada, '
  'que se deriva de la clave maestra en el dispositivo, no abre ningún sobre.';

create trigger user_sharing_keys_updated_at
  before update on public.user_sharing_keys
  for each row execute function public.fn_actualizar_updated_at();

alter table public.user_sharing_keys enable row level security;
alter table public.user_sharing_keys force row level security;

-- Cualquiera con sesión puede leerla: es el único modo de poder sellarle algo
-- a alguien. Solo su dueño puede escribirla, o alguien podría sustituirla por
-- la suya y hacer que le llegara a él lo que se comparte con otro.
create policy user_sharing_keys_lectura on public.user_sharing_keys
  for select using (true);
create policy user_sharing_keys_insercion_propia on public.user_sharing_keys
  for insert with check (user_id = (select auth.uid()));
create policy user_sharing_keys_actualizacion_propia on public.user_sharing_keys
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_sharing_keys to authenticated;

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
  ('0001_extensiones_y_enums'),
  ('0002_identidad_y_claves'),
  ('0003_contenido_privado_y_sincronizacion'),
  ('0004_politicas_rls'),
  ('0005_revocar_privilegios_heredados'),
  ('0006_oracion'),
  ('0007_habitos'),
  ('0008_biblia'),
  ('0009_biblioteca_de_vida'),
  ('0010_ia'),
  ('0011_memorial'),
  ('0012_iglesia')
on conflict (version) do nothing;
