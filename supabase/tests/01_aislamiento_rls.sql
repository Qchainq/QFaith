-- Pruebas de aislamiento entre usuarios (Documento 14, «pruebas de
-- aislamiento»). Se ejecutan sobre un PostgreSQL local con el sustituto de
-- `auth` cargado.
--
-- Cada bloque falla la ejecución completa si la comprobación no se cumple,
-- de modo que el script sirve como puerta en integración continua.

\set ON_ERROR_STOP on

-- ── Preparación ──────────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ana@ejemplo.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'beto@ejemplo.invalid');

-- Datos ficticios: nunca contenido real de personas.

-- ── Ana crea su contenido ────────────────────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.profiles (id, timezone) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Europe/Madrid');
insert into public.devices (user_id, device_public_id, platform)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dispositivo-ana-1', 'ios');
insert into public.journal_entries (user_id, entry_type, entry_date, encrypted_payload, key_id, nonce)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gratitude', current_date,
    'sobre-cifrado-de-ana', gen_random_uuid(), 'nonce-de-ana'
  );

do $$
begin
  if (select count(*) from public.journal_entries) <> 1 then
    raise exception 'Ana debería ver exactamente su propia entrada';
  end if;
end $$;

-- ── Beto no alcanza el contenido de Ana ──────────────────────────────────

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

do $$
begin
  if (select count(*) from public.journal_entries) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto ve entradas del diario de Ana';
  end if;
  if (select count(*) from public.devices) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto ve dispositivos de Ana';
  end if;
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto ve el perfil de Ana';
  end if;
end $$;

-- Tampoco puede modificarlo: el UPDATE no afecta a ninguna fila.
do $$
declare v_afectadas int;
begin
  update public.journal_entries set is_favorite = true;
  get diagnostics v_afectadas = row_count;
  if v_afectadas <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto modificó % filas de Ana', v_afectadas;
  end if;
end $$;

-- Ni puede escribir una fila haciéndola pasar por suya y atribuyéndola a Ana.
do $$
begin
  begin
    insert into public.journal_entries (user_id, entry_date, encrypted_payload, key_id, nonce)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date, 'intruso', gen_random_uuid(), 'n');
    raise exception 'FALLO DE AISLAMIENTO: Beto insertó una entrada a nombre de Ana';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Ni robar sus claves envueltas.
do $$
begin
  if (select count(*) from public.user_key_envelopes) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto ve sobres de claves ajenos';
  end if;
  if (select count(*) from public.recovery_configurations) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Beto ve la configuración de recuperación de Ana';
  end if;
end $$;

-- ── El borrado de contenido privado es siempre lógico ────────────────────

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

do $$
begin
  begin
    delete from public.journal_entries;
    raise exception 'El borrado físico del diario no debería estar permitido';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── La bitácora de sincronización no se puede falsear ────────────────────

do $$
begin
  begin
    insert into public.sync_change_log (user_id, entity_type, entity_id, operation, revision)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'journal_entries', gen_random_uuid(), 'update', 1);
    raise exception 'El cliente no debería poder escribir en la bitácora';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Pero el trigger sí la alimentó al crear la entrada.
do $$
begin
  if (select count(*) from public.sync_change_log where operation = 'create') <> 1 then
    raise exception 'El trigger de sincronización no registró la creación';
  end if;
end $$;

-- ── La auditoría no la escribe ni la borra el auditado ───────────────────

do $$
begin
  begin
    insert into public.audit_events (user_id, event_type) values (auth.uid(), 'inventado');
    raise exception 'El usuario no debería poder escribir en la auditoría';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── Versión y revisión avanzan en cada cambio ────────────────────────────

do $$
declare
  v_version_inicial bigint;
  v_version_final bigint;
  v_revision_inicial bigint;
  v_revision_final bigint;
begin
  select version, sync_revision into v_version_inicial, v_revision_inicial
    from public.journal_entries limit 1;

  update public.journal_entries set is_favorite = true;

  select version, sync_revision into v_version_final, v_revision_final
    from public.journal_entries limit 1;

  if v_version_final <> v_version_inicial + 1 then
    raise exception 'La versión no se incrementó: % -> %', v_version_inicial, v_version_final;
  end if;
  if v_revision_final <= v_revision_inicial then
    raise exception 'La revisión no avanzó: % -> %', v_revision_inicial, v_revision_final;
  end if;
end $$;

-- El borrado lógico se propaga como «delete» a los demás dispositivos.
do $$
begin
  update public.journal_entries set deleted_at = now();
  if (select count(*) from public.sync_change_log where operation = 'delete') <> 1 then
    raise exception 'El borrado lógico no se registró como delete en la bitácora';
  end if;
end $$;

-- ── El rol anónimo no alcanza nada ───────────────────────────────────────

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  begin
    perform count(*) from public.journal_entries;
    raise exception 'El rol anónimo no debería poder leer el diario';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ── Los parámetros de derivación no se pueden rebajar ────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

do $$
begin
  begin
    insert into public.recovery_configurations
      (user_id, encrypted_recovery_envelope, recovery_nonce, kdf_algorithm, kdf_parameters)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sobre', 'nonce', 'argon2id',
      '{"memoriaKiB": 8, "iteraciones": 1, "paralelismo": 1, "salBase64": "corta"}'::jsonb
    );
    raise exception 'Se aceptaron parámetros de derivación por debajo del mínimo';
  exception
    when check_violation then null;
  end;
end $$;

-- Con parámetros correctos sí entra.
insert into public.recovery_configurations
  (user_id, encrypted_recovery_envelope, recovery_nonce, kdf_algorithm, kdf_parameters)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sobre-cifrado', 'nonce', 'argon2id',
  '{"memoriaKiB": 19456, "iteraciones": 2, "paralelismo": 1, "salBase64": "MTIzNDU2Nzg5MGFiY2RlZg=="}'::jsonb
);

reset role;

select 'Todas las pruebas de aislamiento pasaron' as resultado;
