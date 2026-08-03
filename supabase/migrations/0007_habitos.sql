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
