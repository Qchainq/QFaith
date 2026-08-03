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
