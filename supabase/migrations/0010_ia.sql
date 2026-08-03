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
