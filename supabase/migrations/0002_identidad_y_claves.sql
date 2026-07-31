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
