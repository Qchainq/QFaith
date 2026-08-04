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
