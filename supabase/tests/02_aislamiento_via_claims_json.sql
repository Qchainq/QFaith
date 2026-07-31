-- El mismo aislamiento, pero identificando al usuario por el JSON completo
-- de reclamaciones en lugar del ajuste suelto.
--
-- Es la vía que usan las versiones actuales de PostgREST, y por tanto la que
-- se ejecuta de verdad contra Supabase. Sin esta prueba, todo el aislamiento
-- quedaría verificado únicamente por el camino antiguo.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carla@ejemplo.invalid'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'diego@ejemplo.invalid');

set role authenticated;

-- Carla escribe, identificada por el JSON de reclamaciones.
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  false
);

do $$
begin
  if auth.uid() <> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid then
    raise exception 'auth.uid() no resuelve desde request.jwt.claims: %', auth.uid();
  end if;
  if auth.role() <> 'authenticated' then
    raise exception 'auth.role() no resuelve desde request.jwt.claims';
  end if;
end $$;

insert into public.profiles (id, timezone)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Europe/Madrid');
insert into public.journal_entries (user_id, entry_date, encrypted_payload, key_id, nonce)
  values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', current_date,
    'sobre-cifrado-de-carla', gen_random_uuid(), 'nonce-de-carla'
  );

do $$
begin
  if (select count(*) from public.journal_entries) <> 1 then
    raise exception 'Carla no ve su propia entrada';
  end if;
end $$;

-- Diego llega por la misma vía y no debe alcanzar nada de Carla.
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  false
);

do $$
begin
  if (select count(*) from public.journal_entries) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Diego ve el diario de Carla';
  end if;
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Diego ve el perfil de Carla';
  end if;
  if (select count(*) from public.user_key_envelopes) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Diego ve sobres de claves ajenos';
  end if;
end $$;

do $$
declare v_afectadas int;
begin
  update public.journal_entries set is_favorite = true;
  get diagnostics v_afectadas = row_count;
  if v_afectadas <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: Diego modificó % filas de Carla', v_afectadas;
  end if;
end $$;

-- Sin ninguna reclamación, auth.uid() es nulo y no se alcanza nada.
select set_config('request.jwt.claims', '', false);

do $$
begin
  if auth.uid() is not null then
    raise exception 'auth.uid() debería ser nulo sin reclamaciones';
  end if;
  if (select count(*) from public.journal_entries) <> 0 then
    raise exception 'FALLO DE AISLAMIENTO: se ven filas sin usuario identificado';
  end if;
end $$;

reset role;

select 'Aislamiento verificado también por request.jwt.claims' as resultado;
