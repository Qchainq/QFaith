-- Aislamiento de los archivos privados.
--
-- La ficha de `private_media` se aísla como cualquier otra tabla, y eso es lo
-- fácil. Lo que de verdad importa es el cubo: si `storage.objects` estuviera
-- abierto, cualquiera con una sesión válida podría descargarse el blob de
-- otra persona y probar a descifrarlo con calma en su casa. Un aislamiento
-- perfecto de los metadatos y un cubo abierto protegen exactamente nada.
--
-- Comprueba lo que exige el Documento 14 («las URLs de Storage no permiten
-- acceso público») y el Documento 5 («cada usuario tiene su espacio y nunca
-- puede acceder al de otro»).
--
-- Cada comprobación empieza confirmando que **hay algo que ver**: «Rubén ve
-- cero archivos» se cumpliría igual sobre un cubo vacío.

\set ON_ERROR_STOP on

-- ── Reparto ──────────────────────────────────────────────────────────────
--
-- Sara guarda la foto de su padre en el memorial. Rubén es otro usuario
-- cualquiera, sin ninguna relación con ella. Datos ficticios (invariante 15).

insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-555555555555', 'sara@ejemplo.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'ruben@ejemplo.invalid');

-- ── El cubo no es público ────────────────────────────────────────────────

do $$
begin
  if (select count(*) from storage.buckets where id = 'archivos-privados') <> 1 then
    raise exception 'El cubo de archivos privados debería existir';
  end if;
  if (select public from storage.buckets where id = 'archivos-privados') then
    raise exception
      'FALLO GRAVE: el cubo es público. Cualquiera con la ruta descargaría el archivo.';
  end if;
end $$;

-- ── Sara adjunta una foto a su memorial ──────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

insert into public.memorials (id, user_id, encrypted_payload, key_id, nonce)
  values ('eeeeeeee-0000-4000-8000-000000000001',
          '55555555-5555-4555-8555-555555555555',
          'sobre-del-memorial-de-sara', gen_random_uuid(), 'nonce-memorial');

insert into public.private_media
  (id, user_id, owner_type, owner_id, storage_path,
   encrypted_file_key, file_nonce, mime_type, encrypted_original_name,
   file_size_bytes, content_hash, key_id)
values (
  'ffffffff-0000-4000-8000-000000000001',
  '55555555-5555-4555-8555-555555555555',
  'memorial',
  'eeeeeeee-0000-4000-8000-000000000001',
  '55555555-5555-4555-8555-555555555555/ffffffff-0000-4000-8000-000000000001',
  'clave-del-archivo-envuelta', 'nonce-del-archivo',
  'image/jpeg',
  -- El nombre va cifrado: «mi-padre-en-la-playa.jpg» no puede acabar en un log.
  'nombre-original-cifrado',
  482913, 'hmac-con-clave-de-sara', gen_random_uuid()
);

-- Y el blob sube al cubo, bajo su carpeta.
insert into storage.objects (id, bucket_id, name, owner)
values (
  '99999999-0000-4000-8000-000000000001',
  'archivos-privados',
  '55555555-5555-4555-8555-555555555555/ffffffff-0000-4000-8000-000000000001',
  '55555555-5555-4555-8555-555555555555'
);

do $$
begin
  if (select count(*) from public.private_media) <> 1 then
    raise exception 'Sara debería ver su propia ficha: la prueba sería vacía';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'archivos-privados') <> 1 then
    raise exception 'Sara debería ver su propio blob: la prueba sería vacía';
  end if;
end $$;

-- ── La ruta no puede apuntar a la carpeta de otro ────────────────────────
--
-- Sin esta restricción, Sara podría dejar una ficha suya apuntando al espacio
-- de Rubén. La política del cubo la frenaría al leer, pero la ficha quedaría
-- mintiendo sobre dónde está el archivo, y la purga de la papelera intentaría
-- borrar algo que no es suyo.

do $$
begin
  begin
    insert into public.private_media
      (id, user_id, owner_type, owner_id, storage_path,
       encrypted_file_key, file_nonce, mime_type, file_size_bytes, content_hash, key_id)
    values (
      'ffffffff-0000-4000-8000-000000000002',
      '55555555-5555-4555-8555-555555555555',
      'memorial', 'eeeeeeee-0000-4000-8000-000000000001',
      -- La carpeta de Rubén.
      '66666666-6666-4666-8666-666666666666/ffffffff-0000-4000-8000-000000000002',
      'clave', 'nonce', 'image/jpeg', 100, 'hash-distinto', gen_random_uuid()
    );
    raise exception 'FALLO GRAVE: se aceptó una ruta bajo la carpeta de otro usuario';
  exception
    when check_violation then null;
  end;
end $$;

-- ── Un tipo de archivo fuera de la lista no entra ────────────────────────
--
-- La columna existe para saber si se enseña una imagen o se descarga un PDF.
-- Si admitiera texto libre acabaría llevando otra cosa dentro.

do $$
begin
  begin
    insert into public.private_media
      (id, user_id, owner_type, owner_id, storage_path,
       encrypted_file_key, file_nonce, mime_type, file_size_bytes, content_hash, key_id)
    values (
      'ffffffff-0000-4000-8000-000000000003',
      '55555555-5555-4555-8555-555555555555',
      'memorial', 'eeeeeeee-0000-4000-8000-000000000001',
      '55555555-5555-4555-8555-555555555555/ffffffff-0000-4000-8000-000000000003',
      'clave', 'nonce', 'text/plain; el diario dice que', 100, 'otro-hash', gen_random_uuid()
    );
    raise exception 'FALLO GRAVE: el tipo de archivo admite texto libre';
  exception
    when check_violation then null;
  end;
end $$;

-- ── Rubén no alcanza nada de Sara ────────────────────────────────────────

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);

do $$
declare v_filas int;
begin
  -- Ni la ficha…
  if (select count(*) from public.private_media) <> 0 then
    raise exception 'FALLO GRAVE: Rubén ve fichas de archivos de Sara';
  end if;

  -- …ni el blob, que es lo que de verdad se puede descifrar por fuerza bruta
  -- si algún día se rompe algo.
  if (select count(*) from storage.objects where bucket_id = 'archivos-privados') <> 0 then
    raise exception 'FALLO GRAVE: Rubén ve el archivo de Sara en el cubo';
  end if;

  -- Conocer la ruta exacta tampoco sirve de nada (Documento 8, prueba 4).
  if exists (
    select 1 from storage.objects
    where name = '55555555-5555-4555-8555-555555555555/ffffffff-0000-4000-8000-000000000001'
  ) then
    raise exception 'FALLO GRAVE: adivinar la ruta concede acceso al archivo';
  end if;

  -- No puede borrar el archivo de Sara.
  --
  -- Sin `where` a propósito. PostgreSQL aplica también las políticas de
  -- lectura a un `delete` que menciona columnas, así que
  -- `delete ... where bucket_id = '...'` pasaría igual aunque la política de
  -- borrado estuviera abierta de par en par: la de lectura ya esconde la
  -- fila. La comprobación parecería sólida y no probaría nada. Sin `where`,
  -- lo único que decide es la política de borrado, que es lo que aquí
  -- interesa.
  delete from storage.objects;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: Rubén borró % archivos de Sara', v_filas;
  end if;

  -- Ni cambiarle la ficha. Mismo motivo para omitir el `where`.
  update public.private_media set upload_status = 'failed';
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: Rubén modificó % fichas de Sara', v_filas;
  end if;
end $$;

-- Tampoco puede dejar un archivo dentro de la carpeta de Sara. Escribir en el
-- espacio de otro permitiría llenárselo o sustituirle un adjunto.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'archivos-privados',
      '55555555-5555-4555-8555-555555555555/intruso',
      '66666666-6666-4666-8666-666666666666'
    );
    raise exception 'FALLO GRAVE: Rubén escribió en la carpeta de Sara';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Y no puede crear una ficha a nombre de Sara.
do $$
begin
  begin
    insert into public.private_media
      (user_id, owner_type, owner_id, storage_path,
       encrypted_file_key, file_nonce, mime_type, file_size_bytes, content_hash, key_id)
    values (
      '55555555-5555-4555-8555-555555555555',
      'memorial', 'eeeeeeee-0000-4000-8000-000000000001',
      '55555555-5555-4555-8555-555555555555/aaaaaaaa-0000-4000-8000-00000000000f',
      'clave', 'nonce', 'image/png', 100, 'hash-de-ruben', gen_random_uuid()
    );
    raise exception 'FALLO GRAVE: Rubén creó una ficha a nombre de Sara';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Los archivos se retiran a la papelera, no se borran ──────────────────

select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

do $$
begin
  begin
    delete from public.private_media where id = 'ffffffff-0000-4000-8000-000000000001';
    raise exception 'FALLO: se pudo borrar una ficha de archivo directamente';
  exception
    when insufficient_privilege then null;
  end;
end $$;

update public.private_media
  set deleted_at = now()
  where id = 'ffffffff-0000-4000-8000-000000000001';

do $$
begin
  if (select deleted_at from public.private_media
      where id = 'ffffffff-0000-4000-8000-000000000001') is null then
    raise exception 'Sara debería poder retirar su archivo a la papelera';
  end if;
  -- El blob sigue ahí: hasta que la purga se lleve la ficha, la persona puede
  -- arrepentirse (invariante 6).
  if (select count(*) from storage.objects where bucket_id = 'archivos-privados') <> 1 then
    raise exception 'El blob no debería desaparecer al retirar la ficha a la papelera';
  end if;
end $$;

-- Y cuando de verdad quiere irse, puede llevarse su blob.
delete from storage.objects
  where name = '55555555-5555-4555-8555-555555555555/ffffffff-0000-4000-8000-000000000001';

do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'archivos-privados') <> 0 then
    raise exception 'Sara debería poder borrar su propio blob';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

select 'aislamiento de archivos privados verificado' as resultado;
