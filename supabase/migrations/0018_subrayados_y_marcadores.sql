-- Migración 0018 — Subrayados y marcadores bíblicos (Documento 12, tablas 19
-- y 21).
--
-- Lo que alguien subraya en su Biblia y dónde deja el punto de lectura.
-- Completan lo que la migración 0008 dejó a medias: allí quedaron el texto y
-- las notas, y faltaban las dos formas más frecuentes de marcar un pasaje.
--
-- ── Decisiones de diseño (Opus) ──────────────────────────────────────────
--
-- 1. **La referencia va en claro y la nota cifrada**, igual que en
--    `bible_notes`. Es el mismo compromiso consciente y conviene repetirlo
--    aquí en lugar de dejarlo implícito: el servidor puede ver que alguien
--    subrayó el Salmo 88, y eso ya dice algo. A cambio, la aplicación puede
--    pintar los subrayados de un capítulo sin descargar y descifrar todos los
--    de la persona, que sería inviable en un teléfono con años de uso.
--
--    Lo que el servidor **no** puede ver es qué escribió sobre ese versículo.
--    La frontera está donde tiene que estar: la ubicación es un índice, el
--    contenido es la vida de alguien.
--
-- 2. **Los subrayados que se solapan no se funden.** Marcar 3-5 y luego 4-6
--    deja dos subrayados, no uno de 3-6. Fundirlos cambiaría en silencio lo
--    que la persona marcó, y con ellos se perdería la nota de uno de los dos
--    (invariante 5). La pantalla los pinta superpuestos, que es lo que hace
--    una Biblia de papel con dos rotuladores.
--
-- 3. **Un marcador es solo una ubicación.** No lleva nota, no lleva nombre y
--    no lleva sobre cifrado: no hay nada que cifrar. Marcar dos veces el
--    mismo sitio es marcarlo una.
--
-- 4. **El estilo es una lista cerrada.** Cinco colores y subrayado. No es
--    texto libre porque una columna de texto libre en una tabla de contenido
--    espiritual acaba llevando otra cosa dentro, y porque el Design System
--    tiene esos colores y no más.

-- ── Subrayados ───────────────────────────────────────────────────────────

create table public.bible_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- La traducción importa: el versículo 7 de un capítulo no cae en el mismo
  -- sitio en dos traducciones distintas.
  translation_id uuid not null references public.bible_translations (id) on delete cascade,
  book_code varchar(20) not null,
  chapter_number smallint not null,
  verse_start smallint not null,
  verse_end smallint not null,

  -- Ver decisión 4.
  highlight_style varchar(30) not null,

  -- Lo que escribió al subrayarlo, si escribió algo. Ver decisión 1.
  --
  -- El Documento 12 lo llama `encrypted_note`; aquí se usa el nombre común
  -- `encrypted_payload` como en el resto de tablas, para que el motor de
  -- sincronización siga leyendo una sola columna de sobre. Es la misma
  -- desviación consciente que en `habits`, `memorials`, `spiritual_pulses` y
  -- `reading_progress`.
  encrypted_payload text,
  encryption_version smallint not null default 1,
  key_id uuid,
  nonce text,
  content_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint bible_highlights_version_positiva check (version >= 1),
  constraint bible_highlights_rango_coherente check (verse_end >= verse_start),
  constraint bible_highlights_versiculos_positivos check (verse_start >= 1),
  -- Los del Design System y ninguno más.
  constraint bible_highlights_estilo_valido check (
    highlight_style in ('amarillo', 'verde', 'azul', 'rosa', 'naranja', 'subrayado')
  ),
  -- Una nota sin nonce sería un criptograma que nadie puede volver a abrir.
  constraint bible_highlights_nota_completa check (
    encrypted_payload is null or (key_id is not null and nonce is not null and length(nonce) > 0)
  )
);

comment on table public.bible_highlights is
  'Subrayados de pasajes. La referencia va en claro para poder pintar un capítulo sin '
  'descifrar todo; lo que la persona escribió sobre el pasaje, no.';
comment on column public.bible_highlights.highlight_style is
  'Lista cerrada de los colores del Design System. Nunca texto libre.';

-- El mismo pasaje con el mismo estilo dos veces es el mismo subrayado. Sin
-- esto, dos dispositivos sin conexión dejarían dos copias superpuestas que la
-- persona vería como una y no podría quitar del todo.
create unique index bible_highlights_sin_duplicados_idx
  on public.bible_highlights (
    user_id, translation_id, book_code, chapter_number, verse_start, verse_end, highlight_style
  )
  where deleted_at is null;

create index bible_highlights_user_pasaje_idx
  on public.bible_highlights (user_id, translation_id, book_code, chapter_number)
  where deleted_at is null;
create index bible_highlights_user_revision_idx
  on public.bible_highlights (user_id, sync_revision);

create trigger bible_highlights_updated_at
  before update on public.bible_highlights
  for each row execute function public.fn_actualizar_updated_at();
create trigger bible_highlights_version
  before update on public.bible_highlights
  for each row execute function public.fn_incrementar_version();
create trigger bible_highlights_sync_log
  before insert or update on public.bible_highlights
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Marcadores ───────────────────────────────────────────────────────────

create table public.bible_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  translation_id uuid not null references public.bible_translations (id) on delete cascade,
  book_code varchar(20) not null,
  chapter_number smallint not null,
  -- Nulo cuando se marca el capítulo entero, que es lo habitual al dejar la
  -- lectura a medias.
  verse_number smallint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint bible_bookmarks_version_positiva check (version >= 1),
  constraint bible_bookmarks_versiculo_positivo check (
    verse_number is null or verse_number >= 1
  )
);

comment on table public.bible_bookmarks is
  'Puntos de lectura guardados. Solo ubicación: no hay nada que cifrar porque la '
  'persona no escribe nada aquí.';

-- Ver decisión 3. `coalesce` porque en un índice único dos nulos no chocan, y
-- sin él se podría marcar el mismo capítulo tantas veces como se quisiera.
create unique index bible_bookmarks_sin_duplicados_idx
  on public.bible_bookmarks (
    user_id, translation_id, book_code, chapter_number, coalesce(verse_number, 0)
  )
  where deleted_at is null;

create index bible_bookmarks_user_idx
  on public.bible_bookmarks (user_id, updated_at desc)
  where deleted_at is null;
create index bible_bookmarks_user_revision_idx
  on public.bible_bookmarks (user_id, sync_revision);

create trigger bible_bookmarks_updated_at
  before update on public.bible_bookmarks
  for each row execute function public.fn_actualizar_updated_at();
create trigger bible_bookmarks_version
  before update on public.bible_bookmarks
  for each row execute function public.fn_incrementar_version();
create trigger bible_bookmarks_sync_log
  before insert or update on public.bible_bookmarks
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.bible_highlights enable row level security;
alter table public.bible_highlights force row level security;
alter table public.bible_bookmarks enable row level security;
alter table public.bible_bookmarks force row level security;

create policy bible_highlights_lectura_propia on public.bible_highlights
  for select using (user_id = (select auth.uid()));
create policy bible_highlights_insercion_propia on public.bible_highlights
  for insert with check (user_id = (select auth.uid()));
create policy bible_highlights_actualizacion_propia on public.bible_highlights
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy bible_bookmarks_lectura_propia on public.bible_bookmarks
  for select using (user_id = (select auth.uid()));
create policy bible_bookmarks_insercion_propia on public.bible_bookmarks
  for insert with check (user_id = (select auth.uid()));
create policy bible_bookmarks_actualizacion_propia on public.bible_bookmarks
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de borrado en ninguna de las dos: quitar un subrayado o un
-- marcador es `deleted_at`, y espera en la papelera como todo lo demás
-- (invariante 6). Quitar un subrayado por error y no poder recuperar la nota
-- que llevaba dentro sería una pérdida real.
grant select, insert, update on public.bible_highlights to authenticated;
grant select, insert, update on public.bible_bookmarks to authenticated;
