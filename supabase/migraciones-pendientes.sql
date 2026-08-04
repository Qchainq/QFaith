-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Migraciones desde la 0013
--
-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.
-- Solo las migraciones 0013 en adelante. Para una base que ya tiene
-- aplicadas las anteriores. Comprueba en cuál estás con:
--
--   select version from public.schema_migrations order by version;
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 0013_sermones.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0013 — Sermones (Documento 12, tablas 26 a 28).
--
-- El módulo tiene dos mitades con dueños distintos, y la migración las separa
-- a propósito:
--
--   · **El sermón lo publica la iglesia.** Título, predicador, pasajes,
--     resumen y enlaces son institucionales y van en claro: los ve todo el
--     que pertenece a esa iglesia, que es para lo que se publican.
--
--   · **Las notas del sermón son de quien las escribe.** Van cifradas y
--     **nadie de la iglesia las ve, ni siquiera el pastor que predicó**. Lo
--     que alguien anota mientras escucha —«esto va por mí», «hablar con él
--     esta semana»— es tan privado como el diario, aunque el sermón sea
--     público. El Documento 8 lo dice y aquí lo impone la forma de la tabla.
--
-- Tres decisiones:
--
--   1. **Un sermón es institucional o personal, nunca las dos cosas.** La
--      restricción lo impone igual que en `prayer_shares`: dos dueños serían
--      un permiso ambiguo, y un permiso ambiguo se resuelve a favor de quien
--      pide.
--
--   2. **Las acciones prácticas usan el sobre común**, no un
--      `encrypted_title` suelto como describe el Documento 12. Misma
--      desviación consciente que en `habits` y en `memorials`: un sobre por
--      fila mantiene coherente el motor de sincronización y el vínculo
--      criptográfico.
--
--   3. **`due_date` y `completed_at` van en claro.** Son lo que necesita un
--      recordatorio para saber cuándo sonar, y no dicen nada de la acción: el
--      texto —que sí lo dice todo— viaja dentro del sobre.

-- ── sermons ──────────────────────────────────────────────────────────────

create table public.sermons (
  id uuid primary key default gen_random_uuid(),

  -- Exactamente uno de los dos. Ver decisión 1.
  church_id uuid references public.churches (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,

  title text,
  speaker_name text,
  sermon_date date,
  public_summary text,
  bible_references jsonb,
  audio_path text,
  video_url text,
  publication_status varchar(20) not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint sermons_un_solo_dueno check (
    (church_id is not null)::int + (owner_user_id is not null)::int = 1
  ),
  constraint sermons_estado_valido
    check (publication_status in ('draft', 'published', 'archived'))
);

comment on table public.sermons is
  'Sermones publicados por una iglesia o guardados por una persona. Las notas del '
  'usuario sobre ellos son privadas y viven en sermon_notes.';

create index sermons_iglesia_idx
  on public.sermons (church_id, sermon_date desc)
  where deleted_at is null and church_id is not null;
create index sermons_propietario_idx
  on public.sermons (owner_user_id, sermon_date desc)
  where deleted_at is null and owner_user_id is not null;

create trigger sermons_updated_at
  before update on public.sermons
  for each row execute function public.fn_actualizar_updated_at();

-- ── sermon_notes ─────────────────────────────────────────────────────────
--
-- Privadas y cifradas **aunque el sermón sea institucional**. Es la regla que
-- da sentido al módulo: se puede tomar nota con libertad porque nadie la va a
-- leer.

create table public.sermon_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_id uuid references public.sermons (id) on delete set null,

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

  constraint sermon_notes_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint sermon_notes_nonce_no_vacio check (length(nonce) > 0),
  constraint sermon_notes_version_positiva check (version >= 1)
);

comment on table public.sermon_notes is
  'Notas del usuario sobre un sermón. Cifradas. Ni el pastor que predicó puede leerlas.';

-- `sermon_id` queda en `set null` a propósito: si la iglesia retira el
-- sermón, la nota de la persona no desaparece con él. Lo que escribió sigue
-- siendo suyo.
create index sermon_notes_user_idx
  on public.sermon_notes (user_id, created_at desc)
  where deleted_at is null;
create index sermon_notes_sermon_idx on public.sermon_notes (sermon_id);
create index sermon_notes_user_revision_idx on public.sermon_notes (user_id, sync_revision);

create trigger sermon_notes_updated_at
  before update on public.sermon_notes
  for each row execute function public.fn_actualizar_updated_at();

create trigger sermon_notes_version
  before update on public.sermon_notes
  for each row execute function public.fn_incrementar_version();

create trigger sermon_notes_sync_log
  before insert or update on public.sermon_notes
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── sermon_actions ───────────────────────────────────────────────────────

create table public.sermon_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_note_id uuid references public.sermon_notes (id) on delete set null,

  -- El texto de la acción va en el sobre. Ver decisión 2.
  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  -- En claro: es lo que necesita un recordatorio. Ver decisión 3.
  due_date date,
  completed_at timestamptz,
  reminder_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint sermon_actions_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint sermon_actions_version_positiva check (version >= 1)
);

comment on table public.sermon_actions is
  'Aplicaciones prácticas que la persona se propone. El texto va cifrado; solo la fecha '
  'queda en claro, para poder recordarla.';

create index sermon_actions_user_idx
  on public.sermon_actions (user_id, due_date)
  where deleted_at is null and completed_at is null;
create index sermon_actions_nota_idx on public.sermon_actions (sermon_note_id);
create index sermon_actions_user_revision_idx on public.sermon_actions (user_id, sync_revision);

create trigger sermon_actions_updated_at
  before update on public.sermon_actions
  for each row execute function public.fn_actualizar_updated_at();

create trigger sermon_actions_version
  before update on public.sermon_actions
  for each row execute function public.fn_incrementar_version();

create trigger sermon_actions_sync_log
  before insert or update on public.sermon_actions
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.sermons enable row level security;
alter table public.sermons force row level security;
alter table public.sermon_notes enable row level security;
alter table public.sermon_notes force row level security;
alter table public.sermon_actions enable row level security;
alter table public.sermon_actions force row level security;

-- Un sermón institucional lo ven los miembros de esa iglesia, y solo si está
-- publicado: un borrador no se enseña a nadie. Uno personal, solo su dueño.
create policy sermons_lectura on public.sermons
  for select using (
    deleted_at is null
    and (
      owner_user_id = (select auth.uid())
      or (
        church_id is not null
        and publication_status = 'published'
        and public.fn_es_miembro_activo(church_id)
      )
      or (church_id is not null and public.fn_lidera_iglesia(church_id))
    )
  );

create policy sermons_insercion on public.sermons
  for insert with check (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  );

create policy sermons_actualizacion on public.sermons
  for update using (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  )
  with check (
    owner_user_id = (select auth.uid())
    or (church_id is not null and public.fn_lidera_iglesia(church_id))
  );

-- Las notas y las acciones son de su dueño y de nadie más. **No hay política
-- para el liderazgo de la iglesia, y no debe añadirse ninguna**: quien
-- predicó no puede leer lo que alguien anotó mientras le escuchaba.
create policy sermon_notes_lectura_propia on public.sermon_notes
  for select using (user_id = (select auth.uid()));
create policy sermon_notes_insercion_propia on public.sermon_notes
  for insert with check (user_id = (select auth.uid()));
create policy sermon_notes_actualizacion_propia on public.sermon_notes
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sermon_actions_lectura_propia on public.sermon_actions
  for select using (user_id = (select auth.uid()));
create policy sermon_actions_insercion_propia on public.sermon_actions
  for insert with check (user_id = (select auth.uid()));
create policy sermon_actions_actualizacion_propia on public.sermon_actions
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.sermons to authenticated;
grant select, insert, update on public.sermon_notes to authenticated;
grant select, insert, update on public.sermon_actions to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0014_notificaciones.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0014 — Notificaciones (Documento 12, tabla 39; Documento 13).
--
-- La regla que gobierna esta tabla cabe en una línea: **aquí nunca entra
-- contenido espiritual.** Ni el texto de una oración, ni el nombre de una
-- persona, ni de qué trata una entrada del diario. Las columnas se llaman
-- `generic_title` y `generic_body` a propósito: el nombre recuerda para qué
-- sirven cada vez que alguien las lee.
--
-- Lo que llega a una pantalla bloqueada es «Tienes un recordatorio en
-- QFaith», nunca «Recuerda orar por la enfermedad de María». Esa diferencia
-- es todo el Documento 13, y es la regla que más se incumple en las
-- aplicaciones que hacen esto mal.
--
-- Tres decisiones:
--
--   1. **Las notificaciones espirituales no pasan por aquí.** Hábitos,
--      oración, devocional y lectura se programan **en el dispositivo** con
--      notificaciones locales: funcionan sin Internet, no cuestan nada y
--      sobre todo su contenido nunca sale. Esta tabla es para lo que **tiene**
--      que venir del servidor: seguridad, iglesia, eventos y facturación.
--
--   2. **`action_reference_id` es opaco.** Dice a qué registro ir, no qué
--      dice. Antes de navegar, el cliente comprueba sesión, dispositivo y
--      permisos, y pide desbloqueo si el destino es privado.
--
--   3. **El token push vive en `devices`.** Es del dispositivo, no de la
--      persona: al revocar un dispositivo se revoca su token, y al cerrar
--      sesión se borra. **Nunca se usa para seguimiento publicitario y nunca
--      aparece en un log.**

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  notification_type varchar(40) not null,

  -- Genéricos. Ver la nota de cabecera: aquí no entra contenido espiritual.
  generic_title text not null,
  generic_body text,

  -- Adónde ir. No dice qué hay allí.
  action_route text,
  action_reference_id uuid,

  priority varchar(10) not null default 'normal',

  scheduled_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_titulo_no_vacio check (length(trim(generic_title)) > 0),
  constraint notifications_prioridad_valida
    check (priority in ('critica', 'alta', 'normal', 'baja')),
  -- Solo los tipos que de verdad necesitan venir del servidor. Un hábito o
  -- una oración no están en la lista porque se programan en el dispositivo:
  -- si estuvieran, alguien acabaría mandando su texto por aquí.
  constraint notifications_tipo_valido check (
    notification_type in (
      'seguridad', 'dispositivo_nuevo', 'respaldo',
      'iglesia', 'evento', 'suscripcion', 'sistema'
    )
  )
);

comment on table public.notifications is
  'Avisos que deben venir del servidor. NUNCA contenido espiritual: los recordatorios '
  'personales se programan en el dispositivo como notificaciones locales.';
comment on column public.notifications.generic_body is
  'Texto genérico apto para una pantalla bloqueada. Nunca el contenido del usuario.';

create index notifications_user_sin_leer_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_programadas_idx
  on public.notifications (user_id, scheduled_at)
  where sent_at is null;

-- ── Token push en el dispositivo ─────────────────────────────────────────
--
-- **Desviación consciente del Documento 12**, que no contempla la columna. El
-- Documento 13 exige que el token esté asociado al dispositivo y se revoque
-- con él; guardarlo en `profiles` lo ataría a la persona y sobreviviría a la
-- revocación, que es justo lo contrario de lo que se pide.

alter table public.devices add column push_token text;
alter table public.devices add column push_updated_at timestamptz;

comment on column public.devices.push_token is
  'Token de notificaciones push. Se borra al cerrar sesión y se revoca con el dispositivo. '
  'Nunca se usa para seguimiento publicitario ni aparece en un log.';

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_lectura_propia on public.notifications
  for select using (user_id = (select auth.uid()));

-- Marcar como leída es lo único que hace el cliente. **No hay política de
-- inserción**: las escribe el servidor con la clave de servicio. Si el
-- cliente pudiera crearlas, cualquiera podría fabricarse un aviso de
-- seguridad falso a nombre de otro.
create policy notifications_actualizacion_propia on public.notifications
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, update on public.notifications to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0015_pulso_espiritual.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0015 — Pulso Espiritual (Documento 12, tabla 9; Documento 6).
--
-- «¿Cómo está tu corazón hoy?». Una pregunta al día, opcional, con nueve
-- respuestas posibles y un espacio para explicarlo si a la persona le apetece.
--
-- Es la tabla con el equilibrio más delicado del proyecto, y conviene decir
-- por qué. El `mood_code` va **en claro** porque el servidor lo necesita para
-- que la IA prepare una lectura y una oración adecuadas sin descargar toda la
-- vida de alguien. Pero «ansioso» o «alejado de Dios» dicen mucho de una
-- persona, así que el esquema pone tres límites duros:
--
--   1. **Es un código cerrado de nueve valores.** No es texto libre y no
--      admite matices: no se puede guardar «ansioso por el diagnóstico de mi
--      madre» en esta columna aunque alguien quisiera.
--
--   2. **La explicación va cifrada.** Lo que la persona escribe sobre por qué
--      se siente así es contenido privado como cualquier otro.
--
--   3. **Ningún líder, pastor ni administrador lo ve.** No hay política que
--      lo permita. «Cuántos miembros están ansiosos» no es una estadística
--      que este esquema pueda producir, y esa imposibilidad es deliberada
--      (Documento 8).
--
-- **Nunca se usa para publicidad, segmentación ni diagnóstico.** No hay
-- columna que lo permita ni proceso que lo exporte.
--
-- Una decisión más: `intensity` existe en el Documento 12 y se conserva, pero
-- **no hay columna de racha ni de días seguidos**. Un pulso es una pregunta,
-- no un marcador; contar cuántos días lleva alguien «triste» convertiría un
-- acompañamiento en una vigilancia (invariante 12).

create table public.spiritual_pulses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  pulse_date date not null,

  -- Código general, nunca texto de la persona. Ver decisión 1.
  mood_code varchar(40) not null,
  intensity smallint,

  -- El «por qué», si lo escribe. Ver decisión 2.
  --
  -- El Documento 12 lo llama `encrypted_note`; aquí se usa el nombre común
  -- `encrypted_payload` como en todas las demás tablas. El motor de
  -- sincronización lee una sola columna de sobre, y una excepción por su
  -- nombre obligaría a un caso especial en el único sitio que ahora no tiene
  -- ninguno. Es la misma desviación consciente que en `habits` y `memorials`.
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

  -- Un pulso por día. Sin esto, dos dispositivos sin conexión crearían dos
  -- respuestas para el mismo día y no habría forma de saber cuál vale.
  constraint spiritual_pulses_uno_por_dia unique (user_id, pulse_date),
  constraint spiritual_pulses_version_positiva check (version >= 1),
  constraint spiritual_pulses_intensidad_valida
    check (intensity is null or intensity between 1 and 5),
  -- Los nueve estados del Documento 6, y ninguno más.
  constraint spiritual_pulses_estado_valido check (
    mood_code in (
      'enPaz', 'agradecido', 'ansioso', 'triste', 'cansado',
      'tentado', 'confundido', 'necesitoDireccion', 'alejadoDeDios'
    )
  ),
  -- Si hay nota, hay sobre completo. Una nota sin nonce sería un criptograma
  -- que nadie puede abrir, guardado para siempre.
  constraint spiritual_pulses_nota_completa check (
    encrypted_payload is null or (key_id is not null and nonce is not null and length(nonce) > 0)
  )
);

comment on table public.spiritual_pulses is
  'Respuesta diaria opcional a «¿cómo está tu corazón hoy?». Nunca se usa para publicidad, '
  'segmentación ni diagnóstico, y ningún rol de iglesia puede leerla.';
comment on column public.spiritual_pulses.mood_code is
  'Código general de nueve valores. Nunca texto escrito por la persona.';

create index spiritual_pulses_user_fecha_idx
  on public.spiritual_pulses (user_id, pulse_date desc)
  where deleted_at is null;
create index spiritual_pulses_user_revision_idx
  on public.spiritual_pulses (user_id, sync_revision);

create trigger spiritual_pulses_updated_at
  before update on public.spiritual_pulses
  for each row execute function public.fn_actualizar_updated_at();

create trigger spiritual_pulses_version
  before update on public.spiritual_pulses
  for each row execute function public.fn_incrementar_version();

create trigger spiritual_pulses_sync_log
  before insert or update on public.spiritual_pulses
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.spiritual_pulses enable row level security;
alter table public.spiritual_pulses force row level security;

create policy spiritual_pulses_lectura_propia on public.spiritual_pulses
  for select using (user_id = (select auth.uid()));
create policy spiritual_pulses_insercion_propia on public.spiritual_pulses
  for insert with check (user_id = (select auth.uid()));
create policy spiritual_pulses_actualizacion_propia on public.spiritual_pulses
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política para nadie más, y sin política de borrado: el pulso se retira
-- con `deleted_at` y espera en la papelera como todo lo demás.
grant select, insert, update on public.spiritual_pulses to authenticated;

-- ───────────────────────────────────────────────────────────
-- 0016_archivos_privados.sql
-- ───────────────────────────────────────────────────────────

-- Migración 0016 — Archivos privados (Documento 12, tabla 15; Documento 5,
-- «Storage»; Documento 4, «Archivos»).
--
-- Fotografías, audios y documentos que la gente adjunta a su diario, a una
-- oración, a un memorial o a la nota de un sermón. Es el contenido más
-- delicado del proyecto: una foto de un ser querido que murió, la grabación
-- de una oración dicha llorando.
--
-- ── Decisiones de diseño (Opus) ──────────────────────────────────────────
--
-- 1. **El archivo se cifra en el dispositivo y Storage recibe un blob.** No
--    hay ningún camino por el que el archivo original salga del teléfono. El
--    cubo no es público y no se generan URLs públicas: se accede con
--    autorización temporal (Documento 5).
--
-- 2. **Cada archivo lleva su propia clave**, envuelta con la clave de
--    dominio `medios`. No se cifra con la clave de dominio directamente. Dos
--    razones: compartir una foto en el futuro no puede obligar a entregar la
--    clave de todas las demás, y un archivo se puede retirar de circulación
--    tirando su clave sin tocar el resto.
--
-- 3. **La ruta no dice nada.** `storage_path` es `{user_id}/{id}`, sin
--    nombre, sin extensión y sin fecha. El nombre original va cifrado en
--    `encrypted_original_name`, porque el invariante 2 prohíbe registrar
--    nombres de archivos privados y una ruta es lo primero que aparece en un
--    log de servidor. «catequesis-de-mi-hija.jpg» no puede estar ahí.
--
-- 4. **`content_hash` es un HMAC con clave del usuario**, como en el resto de
--    tablas. Un SHA-256 a secas permitiría al servidor comprobar si dos
--    personas tienen el mismo archivo, o si alguien guarda una imagen
--    concreta y conocida. Con clave derivada sirve para no subir dos veces lo
--    mismo y para nada más.
--
-- 5. **`mime_type` y `file_size_bytes` van en claro.** El tamaño lo ve el
--    servidor de todas formas —tiene el blob delante— y el tipo hace falta
--    para saber si se enseña una imagen o se ofrece descargar un PDF. Se
--    acepta la fuga, pero acotada: el tipo es una lista cerrada, no texto
--    libre, para que la columna no se convierta en un canal por donde acabe
--    pasando otra cosa.
--
-- 6. **`upload_status` existe porque la aplicación es offline-first.** La
--    ficha se crea en local antes de que haya red; el archivo sube cuando la
--    hay. Una ficha en `pending` es normal, no un error. Que la subida falle
--    no puede perder el adjunto ni bloquear a nadie (invariante 4).
--
-- 7. **Ningún rol de iglesia aparece aquí.** No hay política que deje a un
--    líder, un pastor, un mentor ni un administrador leer un archivo de otra
--    persona, ni en la tabla ni en el cubo (Documento 8).

create table public.private_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- A qué se adjunta. `owner_id` no lleva clave foránea a propósito: apunta a
  -- cuatro tablas distintas y una referencia por tabla obligaría a cuatro
  -- columnas nulas. La coherencia la mantiene el cliente, que es quien puede
  -- saber de cuál se trata.
  owner_type varchar(30) not null,
  owner_id uuid not null,

  -- Ver decisión 3. La ruta se comprueba contra el patrón, no se confía.
  storage_path text not null,

  -- Ver decisión 2: clave del archivo, envuelta.
  encrypted_file_key text not null,
  file_nonce text not null,

  mime_type text not null,
  encrypted_original_name text,
  file_size_bytes bigint not null,
  content_hash text not null,

  upload_status varchar(20) not null default 'pending',

  encryption_version smallint not null default 1,
  key_id uuid not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint private_media_version_positiva check (version >= 1),

  -- Las cuatro del Documento 12 y ninguna más. Añadir una quinta es una
  -- decisión de producto, no un descuido que deba pasar por aquí.
  constraint private_media_origen_valido check (
    owner_type in ('journal', 'prayer', 'memorial', 'sermon_note')
  ),

  constraint private_media_estado_valido check (
    upload_status in ('pending', 'uploading', 'uploaded', 'failed')
  ),

  -- Ver decisión 5. Lista cerrada: lo que la aplicación sabe enseñar.
  constraint private_media_tipo_valido check (
    mime_type in (
      'image/jpeg', 'image/png', 'image/heic', 'image/webp',
      'audio/m4a', 'audio/mpeg', 'audio/wav',
      'application/pdf'
    )
  ),

  -- Ver decisión 3. Sin esto, un cliente podría escribir la ruta de otro y
  -- dejar una ficha apuntando a un archivo ajeno; la política del cubo lo
  -- frenaría al leer, pero la ficha quedaría mintiendo.
  constraint private_media_ruta_propia check (
    storage_path = user_id::text || '/' || id::text
  ),

  -- Un archivo vacío no es un archivo, y un tamaño negativo no existe. El
  -- techo son 50 MiB: por encima, ni el cifrado en el dispositivo ni la
  -- subida por una conexión mala son razonables.
  constraint private_media_tamano_razonable check (
    file_size_bytes > 0 and file_size_bytes <= 52428800
  ),

  -- Sin nonce no hay forma de abrir el archivo. Guardarlo así sería conservar
  -- para siempre algo que nadie puede volver a leer.
  constraint private_media_sobre_completo check (
    length(encrypted_file_key) > 0 and length(file_nonce) > 0
  ),

  -- No tiene sentido subir dos veces el mismo archivo al mismo registro.
  constraint private_media_sin_duplicados unique (user_id, owner_type, owner_id, content_hash)
);

comment on table public.private_media is
  'Metadatos de archivos cifrados en el dispositivo. El servidor guarda un blob '
  'ilegible y nunca ve el archivo original ni su nombre.';
comment on column public.private_media.storage_path is
  'Siempre {user_id}/{id}. Nunca contiene el nombre del archivo (invariante 2).';
comment on column public.private_media.content_hash is
  'HMAC con clave derivada del usuario, no un hash a secas: el servidor no puede '
  'comprobar si dos personas tienen el mismo archivo.';

create index private_media_user_idx
  on public.private_media (user_id)
  where deleted_at is null;
create index private_media_origen_idx
  on public.private_media (owner_type, owner_id)
  where deleted_at is null;
create index private_media_hash_idx
  on public.private_media (user_id, content_hash);
create index private_media_user_revision_idx
  on public.private_media (user_id, sync_revision);

-- Las fichas pendientes de subir se consultan a menudo al recuperar la red.
create index private_media_pendientes_idx
  on public.private_media (user_id, upload_status)
  where upload_status <> 'uploaded' and deleted_at is null;

create trigger private_media_updated_at
  before update on public.private_media
  for each row execute function public.fn_actualizar_updated_at();

create trigger private_media_version
  before update on public.private_media
  for each row execute function public.fn_incrementar_version();

create trigger private_media_sync_log
  before insert or update on public.private_media
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security de la ficha ───────────────────────────────────────

alter table public.private_media enable row level security;
alter table public.private_media force row level security;

create policy private_media_lectura_propia on public.private_media
  for select using (user_id = (select auth.uid()));
create policy private_media_insercion_propia on public.private_media
  for insert with check (user_id = (select auth.uid()));
create policy private_media_actualizacion_propia on public.private_media
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de borrado: el archivo se retira con `deleted_at` y espera en
-- la papelera treinta días (invariante 6). El blob de Storage se borra en la
-- purga, no antes: hasta entonces la persona puede arrepentirse.
grant select, insert, update on public.private_media to authenticated;

-- ── El cubo de Storage ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archivos-privados',
  'archivos-privados',
  -- Ver decisión 1. Que esto sea `false` es lo que impide que exista una URL
  -- pública. La prueba de Documento 14 lo comprueba.
  false,
  52428800,
  -- El blob cifrado no es un JPEG ni un PDF: es ruido. Declararlo como tal
  -- evita que Storage intente adivinar el tipo o servirlo como imagen.
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Row Level Security del cubo ──────────────────────────────────────────
--
-- Es la parte que de verdad protege los archivos. La ficha se puede aislar
-- perfectamente y, si el cubo estuviera abierto, cualquiera con una sesión
-- válida podría descargar el blob de otra persona y probar a descifrarlo.
--
-- La regla es la primera carpeta de la ruta: solo se toca lo que está bajo la
-- carpeta con el identificador propio.

-- En un proyecto real de Supabase, `storage.objects` ya tiene RLS activo y su
-- dueño es `supabase_storage_admin`, no el rol con el que se aplican las
-- migraciones. Ahí este `alter` no hace falta y puede fallar por permisos, lo
-- que abortaría toda la migración —el editor SQL ejecuta lo pegado en una
-- única transacción—. En el PostgreSQL local sí hace falta, porque la tabla
-- se crea desnuda.
--
-- Se intenta y se ignora el fallo de permisos. Si RLS no estuviera activo, lo
-- delataría la batería 05, que comprueba el aislamiento de verdad en lugar de
-- dar por hecho que esta línea funcionó.
do $$
begin
  execute 'alter table storage.objects enable row level security';
exception
  when insufficient_privilege then null;
end $$;

create policy archivos_privados_lectura_propia on storage.objects
  for select using (
    bucket_id = 'archivos-privados'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy archivos_privados_subida_propia on storage.objects
  for insert with check (
    bucket_id = 'archivos-privados'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy archivos_privados_reemplazo_propio on storage.objects
  for update using (
    bucket_id = 'archivos-privados'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'archivos-privados'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Aquí sí hay borrado, y no contradice el invariante 6: la papelera vive en
-- `private_media.deleted_at`. Cuando la purga se lleva la ficha, el blob debe
-- poder irse con ella; si no, quedaría ocupando espacio para siempre sin que
-- nadie pueda ya abrirlo.
create policy archivos_privados_borrado_propio on storage.objects
  for delete using (
    bucket_id = 'archivos-privados'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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
  ('0013_sermones'),
  ('0014_notificaciones'),
  ('0015_pulso_espiritual'),
  ('0016_archivos_privados')
on conflict (version) do nothing;
