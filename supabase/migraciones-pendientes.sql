-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Migraciones desde la 0017
--
-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.
-- Solo las migraciones 0017 en adelante. Para una base que ya tiene
-- aplicadas las anteriores. Comprueba en cuál estás con:
--
--   select version from public.schema_migrations order by version;
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 0017_planes_de_lectura.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0017 — Planes de lectura (Documento 12, tablas 22 a 25;
-- Documento 6, «Devocionales y planes»).
--
-- Un plan es contenido de catálogo: lo escribe QFaith o una iglesia, y lo lee
-- quien quiera. Lo que la persona hace con él —dónde va, qué días completó y
-- qué escribió al reflexionar— es suyo y privado.
--
-- Esa frontera parte el módulo en dos mitades con reglas opuestas, y confundir
-- una con otra es el único error grave que se puede cometer aquí:
--
--   · `reading_plans` y `reading_plan_days` son **catálogo**. Sin cifrar, sin
--     `user_id`, legibles por cualquiera con sesión. Nadie los sincroniza
--     porque no son de nadie.
--
--   · `user_reading_plans` y `reading_progress` son **personales**. Con RLS,
--     con las columnas de sincronización y con la reflexión cifrada.
--
-- ── Decisiones de diseño (Opus) ──────────────────────────────────────────
--
-- 1. **`current_day` avanza al completar un día, nunca por calendario.** Es la
--    decisión que más se nota. Si alguien empieza un plan de treinta días y lo
--    deja el día tres, un mes después sigue en el día tres: el plan le espera
--    y no le ha «fallado» a nada. Contar días de calendario convertiría un
--    acompañamiento en una deuda, y el invariante 12 lo prohíbe. Por eso
--    `started_at` existe —hace falta para ordenar la lista— y no hay ninguna
--    columna que reste fechas.
--
-- 2. **No hay racha, ni días perdidos, ni porcentaje de cumplimiento.** No es
--    que no se enseñen: no existe columna con la que calcularlos. Una tabla no
--    puede producir un dato que no guarda, y eso es más firme que una promesa
--    en el código de la pantalla.
--
-- 3. **El contenido de pago está cerrado desde ahora**, aunque la suscripción
--    todavía no exista. `fn_tiene_acceso_premium` devuelve `false` hoy y la
--    política ya la consulta. Abrirlo «mientras tanto» y cerrarlo después
--    significaría que el contenido ya se ha repartido: una vez descargado, no
--    se recupera. Cuando llegue la capa de suscripción cambia el cuerpo de esa
--    función y nada más.
--
-- 4. **La reflexión de cada día va cifrada.** Es tan personal como una entrada
--    del diario: lo que alguien escribe al leer sobre el perdón habla de a
--    quién le cuesta perdonar.

-- ── Catálogo ─────────────────────────────────────────────────────────────

create table public.reading_plans (
  id uuid primary key default gen_random_uuid(),

  -- Quién lo escribió. `creator_id` queda nulo cuando lo escribe QFaith.
  creator_type varchar(20) not null,
  creator_id uuid,

  title text not null,
  description text,
  language_code varchar(10) not null,
  duration_days integer not null,

  is_premium boolean not null default false,
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reading_plans_creador_valido check (creator_type in ('qfaith', 'church', 'user')),
  -- Un plan de QFaith no tiene autor concreto; uno de iglesia o de persona sí.
  constraint reading_plans_autor_coherente check (
    (creator_type = 'qfaith' and creator_id is null)
    or (creator_type <> 'qfaith' and creator_id is not null)
  ),
  -- Los temas del Documento 6 van de una semana a un par de meses. El techo
  -- no es arbitrario: un «plan» de mil días es una lista, no un plan.
  constraint reading_plans_duracion_razonable check (duration_days between 1 and 365)
);

comment on table public.reading_plans is
  'Catálogo de planes. Contenido público, sin cifrar y sin dueño: lo personal '
  'vive en user_reading_plans y reading_progress.';

create index reading_plans_publicados_idx
  on public.reading_plans (language_code, duration_days)
  where is_published;

create trigger reading_plans_updated_at
  before update on public.reading_plans
  for each row execute function public.fn_actualizar_updated_at();

create table public.reading_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.reading_plans (id) on delete cascade,

  day_number integer not null,
  title text,
  content text,

  -- Referencias como `[{"libro": "SAL", "capitulo": 23}]`. En JSON y no en
  -- texto libre para que la pantalla pueda abrir el pasaje en lugar de
  -- enseñar una cadena que alguien tenga que buscar a mano.
  bible_references jsonb not null default '[]'::jsonb,
  reflection_questions jsonb,

  constraint reading_plan_days_unico unique (plan_id, day_number),
  constraint reading_plan_days_dia_positivo check (day_number >= 1),
  constraint reading_plan_days_referencias_lista check (jsonb_typeof(bible_references) = 'array'),
  constraint reading_plan_days_preguntas_lista check (
    reflection_questions is null or jsonb_typeof(reflection_questions) = 'array'
  )
);

comment on table public.reading_plan_days is
  'Contenido de cada día de un plan. Público como el plan al que pertenece.';

/**
 * ¿Esta persona puede leer contenido de pago?
 *
 * Hoy siempre no: la capa de suscripción no existe todavía. Existe ya como
 * función, y la política ya la consulta, para que el contenido de pago nunca
 * llegue a estar abierto. Ver decisión 3.
 *
 * `security definer` con `search_path` fijo por la misma razón que en la
 * migración 0012: sin fijarlo, un esquema en el camino de búsqueda podría
 * sustituir lo que la función mira.
 */
create or replace function public.fn_tiene_acceso_premium()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false;
$$;

comment on function public.fn_tiene_acceso_premium() is
  'Devuelve false hasta que exista la capa de suscripción. Cambiar solo su cuerpo: '
  'las políticas que la consultan no deben tocarse.';

-- ── Lo personal ──────────────────────────────────────────────────────────

create table public.user_reading_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.reading_plans (id) on delete restrict,

  -- Cuándo lo empezó. Sirve para ordenar la lista y para nada más: ver
  -- decisión 1.
  started_at date not null default current_date,
  current_day integer not null default 1,
  completed_at date,
  status varchar(20) not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint user_reading_plans_version_positiva check (version >= 1),
  constraint user_reading_plans_dia_positivo check (current_day >= 1),
  -- «abandonado» no es un fracaso: es una opción legítima y el vocabulario lo
  -- refleja. Nada en el esquema penaliza estar aquí.
  constraint user_reading_plans_estado_valido check (
    status in ('active', 'paused', 'completed', 'abandoned')
  ),
  constraint user_reading_plans_final_coherente check (
    (status = 'completed') = (completed_at is not null)
  )
);

comment on table public.user_reading_plans is
  'Dónde va cada persona en un plan. Sin racha, sin días perdidos y sin porcentaje: '
  'no hay columna con la que calcularlos (invariante 12).';

-- Una sola inscripción viva por plan. Sin esto, dos dispositivos sin conexión
-- crearían dos y ninguno sabría cuál vale.
create unique index user_reading_plans_uno_activo_idx
  on public.user_reading_plans (user_id, plan_id)
  where deleted_at is null and status in ('active', 'paused');

create index user_reading_plans_user_idx
  on public.user_reading_plans (user_id, started_at desc)
  where deleted_at is null;
create index user_reading_plans_user_revision_idx
  on public.user_reading_plans (user_id, sync_revision);

create trigger user_reading_plans_updated_at
  before update on public.user_reading_plans
  for each row execute function public.fn_actualizar_updated_at();
create trigger user_reading_plans_version
  before update on public.user_reading_plans
  for each row execute function public.fn_incrementar_version();
create trigger user_reading_plans_sync_log
  before insert or update on public.user_reading_plans
  for each row execute function public.fn_registrar_cambio_sincronizacion();

create table public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_plan_id uuid not null references public.user_reading_plans (id) on delete cascade,

  day_number integer not null,
  completed_at timestamptz,

  -- Lo que escribió al leer ese día. Ver decisión 4: se cifra como el diario.
  --
  -- El Documento 12 llama a esta columna `encrypted_reflection`; aquí se usa
  -- el nombre común `encrypted_payload` como en todas las demás tablas, para
  -- que el motor de sincronización siga leyendo una sola columna de sobre. Es
  -- la misma desviación consciente que en `habits`, `memorials` y
  -- `spiritual_pulses`.
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

  constraint reading_progress_unico unique (user_plan_id, day_number),
  constraint reading_progress_version_positiva check (version >= 1),
  constraint reading_progress_dia_positivo check (day_number >= 1),
  -- Una reflexión sin nonce sería un criptograma que nadie puede volver a
  -- abrir, guardado para siempre.
  constraint reading_progress_reflexion_completa check (
    encrypted_payload is null or (key_id is not null and nonce is not null and length(nonce) > 0)
  )
);

comment on table public.reading_progress is
  'Un día de un plan para una persona. La reflexión va cifrada: lo que alguien escribe '
  'leyendo sobre el perdón dice a quién le cuesta perdonar.';

create index reading_progress_plan_idx
  on public.reading_progress (user_plan_id, day_number)
  where deleted_at is null;
create index reading_progress_user_revision_idx
  on public.reading_progress (user_id, sync_revision);

create trigger reading_progress_updated_at
  before update on public.reading_progress
  for each row execute function public.fn_actualizar_updated_at();
create trigger reading_progress_version
  before update on public.reading_progress
  for each row execute function public.fn_incrementar_version();
create trigger reading_progress_sync_log
  before insert or update on public.reading_progress
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.reading_plans enable row level security;
alter table public.reading_plans force row level security;
alter table public.reading_plan_days enable row level security;
alter table public.reading_plan_days force row level security;
alter table public.user_reading_plans enable row level security;
alter table public.user_reading_plans force row level security;
alter table public.reading_progress enable row level security;
alter table public.reading_progress force row level security;

-- El catálogo se lee, no se escribe desde el cliente. Un plan lo publica un
-- proceso con clave de servicio, igual que el texto bíblico.
create policy reading_plans_lectura_publicados on public.reading_plans
  for select using (
    is_published and (not is_premium or public.fn_tiene_acceso_premium())
  );

-- Los días heredan la decisión del plan. Comprobarlo aquí también, y no solo
-- al listar planes, es lo que impide que alguien pida los días de un plan de
-- pago por su identificador sin pasar por el catálogo.
create policy reading_plan_days_lectura_publicados on public.reading_plan_days
  for select using (
    exists (
      select 1 from public.reading_plans p
      where p.id = plan_id
        and p.is_published
        and (not p.is_premium or public.fn_tiene_acceso_premium())
    )
  );

create policy user_reading_plans_lectura_propia on public.user_reading_plans
  for select using (user_id = (select auth.uid()));
create policy user_reading_plans_insercion_propia on public.user_reading_plans
  for insert with check (user_id = (select auth.uid()));
create policy user_reading_plans_actualizacion_propia on public.user_reading_plans
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy reading_progress_lectura_propia on public.reading_progress
  for select using (user_id = (select auth.uid()));
create policy reading_progress_insercion_propia on public.reading_progress
  for insert with check (user_id = (select auth.uid()));
create policy reading_progress_actualizacion_propia on public.reading_progress
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────
--
-- Sin borrado en ninguna de las cuatro. El catálogo no lo toca el cliente, y
-- lo personal se retira con `deleted_at` (invariante 6).

grant select on public.reading_plans, public.reading_plan_days to authenticated;
grant select, insert, update on public.user_reading_plans to authenticated;
grant select, insert, update on public.reading_progress to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0018_subrayados_y_marcadores.sql
-- ───────────────────────────────────────────────────────────

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
  ('0017_planes_de_lectura'),
  ('0018_subrayados_y_marcadores')
on conflict (version) do nothing;
