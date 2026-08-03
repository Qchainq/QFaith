-- Aislamiento del módulo Iglesia.
--
-- Es la batería más importante del proyecto. Todo lo demás protege a alguien
-- de un desconocido; esta lo protege **de su propia iglesia**, que es quien
-- tiene motivos, contexto y a menudo autoridad moral para querer mirar.
--
-- Las cuatro pruebas obligatorias del Documento 8:
--
--   1. Una iglesia no puede acceder al diario de un miembro.
--   2. Un mentor no puede leer datos no compartidos.
--   3. Un administrador no puede descifrar contenido privado.
--   4. Un identificador adivinado no concede acceso.
--
-- Cada comprobación empieza confirmando que **hay algo que ver**. Sin eso,
-- «el pastor ve cero filas» pasaría igual sobre una tabla vacía, que es
-- exactamente el falso positivo que ya nos mordió una vez.

\set ON_ERROR_STOP on

-- ── Reparto ──────────────────────────────────────────────────────────────
--
-- Marta es miembro. Pablo es el pastor. Elisa es su mentora. Nadie inventado
-- se parece a nadie real: datos ficticios (invariante 15).

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'marta@ejemplo.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'pablo@ejemplo.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'elisa@ejemplo.invalid');

insert into public.churches (id, name, slug, timezone) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Iglesia de prueba', 'iglesia-de-prueba', 'UTC');

insert into public.church_memberships (church_id, user_id, role, membership_status) values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'member', 'active'),
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'pastor', 'active'),
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'mentor', 'active');

-- Mentoría activa y aceptada, con todos los permisos que el modelo admite.
insert into public.mentor_relationships
  (church_id, mentor_user_id, mentee_user_id, status, permissions, started_at)
values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'active',
  '{"oraciones": true, "objetivos": true, "diario": true, "todo": true}'::jsonb,
  now()
);

-- ── Marta escribe su vida privada ────────────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

insert into public.journal_entries (user_id, entry_type, entry_date, encrypted_payload, key_id, nonce)
  values ('11111111-1111-4111-8111-111111111111', 'reflection', current_date,
          'sobre-del-diario-de-marta', gen_random_uuid(), 'nonce-marta');

insert into public.prayers (id, user_id, status, visibility, encrypted_payload, key_id, nonce)
  values ('bbbbbbbb-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111', 'active', 'private',
          'sobre-de-la-peticion-de-marta', gen_random_uuid(), 'nonce-peticion');

insert into public.memorials (user_id, encrypted_payload, key_id, nonce)
  values ('11111111-1111-4111-8111-111111111111',
          'sobre-del-memorial-de-marta', gen_random_uuid(), 'nonce-memorial');

insert into public.ai_conversations (id, user_id, encrypted_payload, key_id, nonce)
  values ('cccccccc-0000-4000-8000-000000000001',
          '11111111-1111-4111-8111-111111111111',
          'sobre-de-la-conversacion-de-marta', gen_random_uuid(), 'nonce-ia');

insert into public.ai_messages (user_id, conversation_id, role, encrypted_payload, key_id, nonce)
  values ('11111111-1111-4111-8111-111111111111',
          'cccccccc-0000-4000-8000-000000000001', 'usuario',
          'sobre-del-mensaje-de-marta', gen_random_uuid(), 'nonce-mensaje');

do $$
begin
  if (select count(*) from public.journal_entries) < 1
     or (select count(*) from public.prayers) < 1
     or (select count(*) from public.memorials) < 1
     or (select count(*) from public.ai_messages) < 1 then
    raise exception 'Marta debería ver su propio contenido: la prueba sería vacía';
  end if;
end $$;

-- ── 1 y 3. Ni el pastor ni el administrador alcanzan nada privado ────────

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
declare
  v_tabla text;
  v_filas int;
begin
  -- El pastor sí ve la iglesia y a sus miembros: eso es lo institucional.
  if not public.fn_lidera_iglesia('aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'El pastor debería reconocerse como liderazgo de su iglesia';
  end if;
  if (select count(*) from public.church_memberships) < 3 then
    raise exception 'El pastor debería ver las membresías de su iglesia';
  end if;

  -- Y no alcanza absolutamente nada de la vida privada de Marta.
  foreach v_tabla in array array[
    'journal_entries', 'prayers', 'memorials', 'bible_notes',
    'life_library_items', 'ai_conversations', 'ai_messages',
    'habits', 'habit_logs'
  ] loop
    execute format('select count(*) from public.%I', v_tabla) into v_filas;
    if v_filas <> 0 then
      raise exception
        'FALLO GRAVE: el pastor ve % filas en %. El invariante 3 no admite matices.',
        v_filas, v_tabla;
    end if;
  end loop;
end $$;

-- Tampoco puede escribir en el contenido de Marta ni marcárselo.
do $$
declare v_afectadas int;
begin
  update public.journal_entries set is_favorite = true;
  get diagnostics v_afectadas = row_count;
  if v_afectadas <> 0 then
    raise exception 'FALLO GRAVE: el pastor modificó % entradas del diario de Marta', v_afectadas;
  end if;
end $$;

-- El rol de administrador es el más alto que existe, y tampoco.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
reset role;
update public.church_memberships
  set role = 'administrator'
  where user_id = '22222222-2222-4222-8222-222222222222';
set role authenticated;

do $$
begin
  if (select count(*) from public.journal_entries) <> 0
     or (select count(*) from public.ai_messages) <> 0 then
    raise exception 'FALLO GRAVE: un administrador alcanza contenido privado';
  end if;
end $$;

-- ── 2. El mentor no lee lo que no se le ha compartido ────────────────────

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

do $$
begin
  -- La mentoría existe y está activa: la comprobación no es vacía.
  if (select count(*) from public.mentor_relationships
      where mentee_user_id = '11111111-1111-4111-8111-111111111111'
        and status = 'active') <> 1 then
    raise exception 'La mentoría debería existir y estar activa';
  end if;

  -- Y aun con «diario: true» y «todo: true» en sus permisos, no ve nada. El
  -- campo describe información compartida; no abre políticas que no existen.
  if (select count(*) from public.journal_entries) <> 0
     or (select count(*) from public.prayers) <> 0
     or (select count(*) from public.memorials) <> 0
     or (select count(*) from public.ai_messages) <> 0 then
    raise exception 'FALLO GRAVE: el mentor alcanza contenido no compartido';
  end if;
end $$;

-- ── Compartir una petición: qué concede y qué no ─────────────────────────

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

insert into public.prayer_shares
  (id, prayer_id, owner_user_id, recipient_user_id,
   encrypted_shared_payload, encrypted_content_key, nonce)
values (
  'dddddddd-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'copia-cifrada-para-elisa', 'clave-envuelta-para-elisa', 'nonce-compartido'
);

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

do $$
begin
  -- Elisa recibe la copia cifrada…
  if (select count(*) from public.prayer_shares) <> 1 then
    raise exception 'El destinatario debería ver la compartición vigente';
  end if;
  -- …y sigue sin alcanzar la petición original ni nada más.
  if (select count(*) from public.prayers) <> 0 then
    raise exception 'FALLO GRAVE: compartir dio acceso a la petición original';
  end if;
  if (select count(*) from public.journal_entries) <> 0 then
    raise exception 'FALLO GRAVE: compartir una petición dio acceso al diario';
  end if;
end $$;

-- Revocar corta el acceso de inmediato.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
update public.prayer_shares set revoked_at = now()
  where id = 'dddddddd-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
begin
  if (select count(*) from public.prayer_shares) <> 0 then
    raise exception 'FALLO GRAVE: una compartición revocada sigue siendo legible';
  end if;
end $$;

-- Una compartición caducada tampoco vale, aunque no se haya revocado.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
update public.prayer_shares
  set revoked_at = null, expires_at = now() - interval '1 hour'
  where id = 'dddddddd-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
do $$
begin
  if (select count(*) from public.prayer_shares) <> 0 then
    raise exception 'FALLO GRAVE: una compartición caducada sigue siendo legible';
  end if;
end $$;

-- ── 4. Un identificador adivinado no concede nada ────────────────────────

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
declare v_filas int;
begin
  -- El pastor conoce el UUID de la petición de Marta: aparece en esta prueba.
  -- Conocerlo no sirve de nada.
  select count(*) into v_filas from public.prayers
    where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: conocer el identificador concedió acceso';
  end if;

  select count(*) into v_filas from public.ai_conversations
    where id = 'cccccccc-0000-4000-8000-000000000001';
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: conocer el identificador de una conversación concedió acceso';
  end if;
end $$;

-- Y no puede fabricar una compartición a su favor sobre la petición de Marta.
do $$
begin
  begin
    insert into public.prayer_shares
      (prayer_id, owner_user_id, recipient_user_id,
       encrypted_shared_payload, encrypted_content_key, nonce)
    values (
      'bbbbbbbb-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'copia', 'clave', 'nonce'
    );
    raise exception 'FALLO GRAVE: el pastor fabricó una compartición a su favor';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Un no miembro no ve la vida institucional ────────────────────────────

reset role;
insert into auth.users (id, email)
  values ('44444444-4444-4444-8444-444444444444', 'ajena@ejemplo.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);

do $$
begin
  if (select count(*) from public.church_memberships) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: alguien de fuera ve las membresías de la iglesia';
  end if;
  if (select count(*) from public.church_groups) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: alguien de fuera ve los grupos de la iglesia';
  end if;
  -- Sí puede ver la iglesia: es lo que le permite encontrarla para unirse.
  if (select count(*) from public.churches) <> 1 then
    raise exception 'Una iglesia activa debería poder encontrarse para unirse a ella';
  end if;
end $$;

-- ── Un solo destino por compartición ─────────────────────────────────────

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $$
begin
  begin
    insert into public.prayer_shares
      (prayer_id, owner_user_id, recipient_user_id, church_id,
       encrypted_shared_payload, encrypted_content_key, nonce)
    values (
      'bbbbbbbb-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-0000-4000-8000-000000000001',
      'copia', 'clave', 'nonce'
    );
    raise exception 'Dos destinos a la vez deberían estar prohibidos';
  exception
    when check_violation then null;
  end;
end $$;

-- ── Claves públicas de compartición ──────────────────────────────────────

do $$
begin
  insert into public.user_sharing_keys (user_id, public_key)
    values ('11111111-1111-4111-8111-111111111111', 'publica-de-marta');
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
begin
  -- Cualquiera puede leerla: es el único modo de poder sellarle algo.
  if (select count(*) from public.user_sharing_keys) <> 1 then
    raise exception 'La clave pública de compartición debería ser legible';
  end if;

  -- Pero nadie puede sustituirla por la suya, que sería la forma de hacer que
  -- lo compartido con otro acabe llegando a uno mismo.
  begin
    update public.user_sharing_keys set public_key = 'publica-del-pastor'
      where user_id = '11111111-1111-4111-8111-111111111111';
    if found then
      raise exception 'FALLO GRAVE: el pastor sustituyó la clave pública de Marta';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  if (select public_key from public.user_sharing_keys
      where user_id = '11111111-1111-4111-8111-111111111111') <> 'publica-de-marta' then
    raise exception 'FALLO GRAVE: la clave pública de Marta cambió';
  end if;
end $$;

reset role;

select 'aislamiento del módulo Iglesia verificado' as resultado;
