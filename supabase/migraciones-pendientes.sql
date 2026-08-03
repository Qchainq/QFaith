-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Migraciones desde la 0006
--
-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.
-- Solo las migraciones 0006 en adelante. Para una base que ya tiene
-- aplicadas las anteriores. Comprueba en cuál estás con:
--
--   select version from public.schema_migrations order by version;
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════

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
  ('0006_oracion'),
  ('0007_habitos'),
  ('0008_biblia'),
  ('0009_biblioteca_de_vida'),
  ('0010_ia'),
  ('0011_memorial')
on conflict (version) do nothing;
