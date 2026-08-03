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
