-- Privilegios de tabla, por debajo de RLS.
--
-- Las baterías 01 y 02 comprueban que las políticas filtran las filas. Esta
-- comprueba la capa anterior: que los roles ni siquiera tengan concedida la
-- operación. Son cosas distintas y hacen falta las dos.
--
-- Sin esto, un `DELETE` sin política de borrado devuelve «correcto, cero
-- filas» en lugar de «no tienes permiso»: RLS lo filtra y queda un privilegio
-- concedido que nada justifica. Si algún día se añadiera una política de
-- lectura amplia por descuido, ese privilegio pasaría de inofensivo a pérdida
-- de datos.
--
-- Supabase concede ALL sobre las tablas nuevas de `public` a `anon` y
-- `authenticated`, así que revocarlo es una acción explícita, no el estado de
-- partida.

\set ON_ERROR_STOP on

do $$
declare
  v_tabla text;
  v_operacion text;
  v_rol text;
  -- Operaciones que cada rol NO debe tener sobre cada tabla.
  v_prohibido text[][] := array[
    -- El diario solo se borra de forma lógica (invariante 6).
    ['authenticated', 'journal_entries', 'DELETE'],
    -- El perfil no se borra: lo retira el proceso de eliminación de cuenta.
    ['authenticated', 'profiles', 'DELETE'],
    ['authenticated', 'user_settings', 'DELETE'],
    ['authenticated', 'recovery_configurations', 'DELETE'],
    ['authenticated', 'account_deletion_requests', 'DELETE'],
    -- La bitácora la escribe el trigger. Si el usuario pudiera tocarla,
    -- podría falsear revisiones y provocar que otro de sus dispositivos se
    -- saltara cambios.
    ['authenticated', 'sync_change_log', 'INSERT'],
    ['authenticated', 'sync_change_log', 'UPDATE'],
    ['authenticated', 'sync_change_log', 'DELETE'],
    -- Una auditoría que el auditado puede editar no sirve de nada.
    ['authenticated', 'audit_events', 'INSERT'],
    ['authenticated', 'audit_events', 'UPDATE'],
    ['authenticated', 'audit_events', 'DELETE'],
    -- La oración se archiva o se marca respondida; nunca se borra de golpe.
    ['authenticated', 'prayers', 'DELETE'],
    ['authenticated', 'prayer_updates', 'DELETE'],
    ['authenticated', 'habits', 'DELETE'],
    ['authenticated', 'habit_logs', 'DELETE'],
    ['authenticated', 'bible_notes', 'DELETE'],
    -- El texto bíblico lo carga un proceso administrativo. Un cliente que
    -- pudiera escribirlo corrompería la Escritura para todo el mundo.
    ['authenticated', 'bible_verses', 'INSERT'],
    ['authenticated', 'bible_verses', 'UPDATE'],
    ['authenticated', 'bible_verses', 'DELETE'],
    ['authenticated', 'bible_books', 'INSERT'],
    ['authenticated', 'bible_books', 'UPDATE'],
    ['authenticated', 'bible_translations', 'INSERT'],
    ['authenticated', 'bible_translations', 'UPDATE'],
    ['authenticated', 'life_library_items', 'DELETE']
  ];
begin
  for i in 1 .. array_length(v_prohibido, 1) loop
    v_rol := v_prohibido[i][1];
    v_tabla := v_prohibido[i][2];
    v_operacion := v_prohibido[i][3];

    if has_table_privilege(v_rol, format('public.%I', v_tabla), v_operacion) then
      raise exception
        '% conserva el privilegio % sobre %. Revócalo: RLS no debe ser la única defensa.',
        v_rol, v_operacion, v_tabla;
    end if;
  end loop;
end
$$;

-- El rol anónimo no alcanza absolutamente nada.
do $$
declare
  v_tabla text;
  v_operacion text;
begin
  for v_tabla in
    select tablename from pg_tables where schemaname = 'public'
  loop
    foreach v_operacion in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', format('public.%I', v_tabla), v_operacion) then
        raise exception 'anon conserva el privilegio % sobre %.', v_operacion, v_tabla;
      end if;
    end loop;
  end loop;
end
$$;

-- Y sí conserva lo que necesita para funcionar: negarlo todo sería igual de
-- erróneo, solo que el fallo aparecería en tiempo de ejecución.
do $$
declare
  v_tabla text;
  v_operacion text;
  v_necesario text[][] := array[
    ['profiles', 'SELECT'], ['profiles', 'INSERT'], ['profiles', 'UPDATE'],
    ['journal_entries', 'SELECT'], ['journal_entries', 'INSERT'], ['journal_entries', 'UPDATE'],
    ['sync_change_log', 'SELECT'],
    ['audit_events', 'SELECT'],
    ['devices', 'SELECT'], ['devices', 'INSERT'], ['devices', 'UPDATE'], ['devices', 'DELETE'],
    ['user_key_envelopes', 'SELECT'], ['user_key_envelopes', 'INSERT'],
    ['user_key_envelopes', 'DELETE'],
    ['sync_conflicts', 'SELECT'], ['sync_conflicts', 'INSERT'], ['sync_conflicts', 'DELETE'],
    ['prayers', 'SELECT'], ['prayers', 'INSERT'], ['prayers', 'UPDATE'],
    ['prayer_updates', 'SELECT'], ['prayer_updates', 'INSERT'], ['prayer_updates', 'UPDATE'],
    ['habits', 'SELECT'], ['habits', 'INSERT'], ['habits', 'UPDATE'],
    ['habit_logs', 'SELECT'], ['habit_logs', 'INSERT'], ['habit_logs', 'UPDATE'],
    ['bible_translations', 'SELECT'], ['bible_books', 'SELECT'], ['bible_verses', 'SELECT'],
    ['bible_notes', 'SELECT'], ['bible_notes', 'INSERT'], ['bible_notes', 'UPDATE'],
    ['life_library_items', 'SELECT'], ['life_library_items', 'INSERT'],
    ['life_library_items', 'UPDATE']
  ];
begin
  for i in 1 .. array_length(v_necesario, 1) loop
    v_tabla := v_necesario[i][1];
    v_operacion := v_necesario[i][2];

    if not has_table_privilege('authenticated', format('public.%I', v_tabla), v_operacion) then
      raise exception
        'authenticated ha perdido el privilegio % sobre %, que sí necesita.',
        v_operacion, v_tabla;
    end if;
  end loop;
end
$$;

-- La secuencia de revisiones la consume el trigger, que es SECURITY DEFINER y
-- corre como propietario. Ningún cliente necesita tocarla, y si pudiera
-- podría agotarla o desordenar los cursores de sincronización.
do $$
begin
  if has_sequence_privilege('authenticated', 'public.sync_revision_seq', 'USAGE')
     or has_sequence_privilege('anon', 'public.sync_revision_seq', 'USAGE') then
    raise exception 'la secuencia de revisiones no debe ser accesible a los clientes.';
  end if;
end
$$;

select 'privilegios de tabla verificados' as resultado;
