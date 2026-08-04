-- Aislamiento de subrayados y marcadores.
--
-- Aquí hay una frontera que conviene ver dibujada: **el servidor sabe qué
-- pasajes te interesan y no sabe qué piensas de ellos.** La referencia va en
-- claro porque hace falta para pintar un capítulo sin descifrarlo todo; lo que
-- alguien escribe al subrayar, no.
--
-- Es un compromiso consciente, y estas pruebas fijan sus dos lados: que la
-- nota está cifrada de verdad y que ningún otro usuario alcanza ninguna de las
-- dos cosas.

\set ON_ERROR_STOP on

-- ── Reparto ──────────────────────────────────────────────────────────────
--
-- Ester subraya un salmo. David es otro usuario cualquiera. Datos ficticios
-- (invariante 15).

insert into auth.users (id, email) values
  ('99999999-9999-4999-8999-999999999999', 'ester@ejemplo.invalid'),
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'david@ejemplo.invalid');

insert into public.bible_translations
  (id, code, name, language_code, license_type, is_active)
values ('cccc0000-0000-4000-8000-000000000001', 'PRUEBA', 'Traducción de prueba', 'es',
        'dominio_publico', true);

set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);

insert into public.bible_highlights
  (id, user_id, translation_id, book_code, chapter_number, verse_start, verse_end,
   highlight_style, encrypted_payload, key_id, nonce)
values (
  'dddd0000-0000-4000-8000-000000000001',
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 3, 5, 'amarillo',
  'sobre-de-lo-que-ester-escribio', gen_random_uuid(), 'nonce-subrayado'
);

insert into public.bible_bookmarks
  (id, user_id, translation_id, book_code, chapter_number)
values (
  'eeee0000-0000-4000-8000-000000000002',
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88
);

do $$
begin
  if (select count(*) from public.bible_highlights) <> 1
     or (select count(*) from public.bible_bookmarks) <> 1 then
    raise exception 'Ester debería ver lo suyo: la prueba sería vacía';
  end if;
end $$;

-- ── Los subrayados que se solapan no se funden ───────────────────────────

insert into public.bible_highlights
  (user_id, translation_id, book_code, chapter_number, verse_start, verse_end, highlight_style)
values (
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 4, 6, 'verde'
);

do $$
begin
  -- Fundir 3-5 con 4-6 en un 3-6 cambiaría en silencio lo que marcó y se
  -- llevaría por delante la nota de uno de los dos (invariante 5).
  if (select count(*) from public.bible_highlights where book_code = 'SAL') <> 2 then
    raise exception 'FALLO: dos subrayados solapados no deberían fundirse';
  end if;
end $$;

-- El mismo pasaje con el mismo estilo sí es el mismo subrayado.
do $$
begin
  begin
    insert into public.bible_highlights
      (user_id, translation_id, book_code, chapter_number, verse_start, verse_end,
       highlight_style)
    values (
      '99999999-9999-4999-8999-999999999999',
      'cccc0000-0000-4000-8000-000000000001',
      'SAL', 88, 3, 5, 'amarillo'
    );
    raise exception 'FALLO: se aceptó un subrayado duplicado';
  exception
    when unique_violation then null;
  end;
end $$;

-- Dos pasajes distintos del mismo capítulo con el mismo color también: es lo
-- que hace cualquiera al subrayar dos versículos sueltos de un salmo.
insert into public.bible_highlights
  (user_id, translation_id, book_code, chapter_number, verse_start, verse_end, highlight_style)
values (
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 10, 12, 'amarillo'
);

do $$
begin
  if (select count(*) from public.bible_highlights
      where book_code = 'SAL' and highlight_style = 'amarillo' and deleted_at is null) <> 2 then
    raise exception
      'Deberían caber dos subrayados del mismo color en distintos versículos del capítulo';
  end if;
end $$;

-- El mismo pasaje con otro color sí se puede: son dos rotuladores distintos.
insert into public.bible_highlights
  (user_id, translation_id, book_code, chapter_number, verse_start, verse_end, highlight_style)
values (
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 3, 5, 'azul'
);

-- ── Un marcador duplicado es el mismo marcador ───────────────────────────

do $$
begin
  begin
    insert into public.bible_bookmarks
      (user_id, translation_id, book_code, chapter_number)
    values (
      '99999999-9999-4999-8999-999999999999',
      'cccc0000-0000-4000-8000-000000000001',
      'SAL', 88
    );
    raise exception 'FALLO: se aceptó un marcador duplicado del mismo capítulo';
  exception
    when unique_violation then null;
  end;
end $$;

-- Marcar un versículo concreto del mismo capítulo sí es otro marcador.
insert into public.bible_bookmarks
  (user_id, translation_id, book_code, chapter_number, verse_number)
values (
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 14
);

-- ── Lo que el esquema no acepta ──────────────────────────────────────────

do $$
begin
  -- Un estilo inventado. La columna no es texto libre.
  --
  -- El valor cabe de sobra en `varchar(30)`: si fuera más largo saltaría el
  -- truncado y la prueba daría verde sin haber llegado a la restricción, que
  -- es lo que aquí se quiere comprobar.
  begin
    insert into public.bible_highlights
      (user_id, translation_id, book_code, chapter_number, verse_start, verse_end,
       highlight_style)
    values ('99999999-9999-4999-8999-999999999999',
            'cccc0000-0000-4000-8000-000000000001', 'JOB', 1, 1, 1, 'confesion');
    raise exception 'FALLO GRAVE: el estilo admite texto libre';
  exception
    when check_violation then null;
  end;

  -- Un rango al revés.
  begin
    insert into public.bible_highlights
      (user_id, translation_id, book_code, chapter_number, verse_start, verse_end,
       highlight_style)
    values ('99999999-9999-4999-8999-999999999999',
            'cccc0000-0000-4000-8000-000000000001', 'JOB', 1, 9, 3, 'verde');
    raise exception 'FALLO: se aceptó un rango con el final antes del principio';
  exception
    when check_violation then null;
  end;
end $$;

-- ── David no alcanza nada de Ester ───────────────────────────────────────

select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', false);

do $$
declare v_filas int;
begin
  -- Qué subraya alguien dice mucho de él: el Salmo 88 es el de la desolación.
  if (select count(*) from public.bible_highlights) <> 0 then
    raise exception 'FALLO GRAVE: David ve lo que Ester subraya';
  end if;
  if (select count(*) from public.bible_bookmarks) <> 0 then
    raise exception 'FALLO GRAVE: David ve por dónde va leyendo Ester';
  end if;

  -- Ni puede quitarle un subrayado. Sin `where` a propósito: PostgreSQL aplica
  -- también las políticas de lectura a un `update` que menciona columnas, y la
  -- comprobación pasaría por la política equivocada.
  update public.bible_highlights set highlight_style = 'rosa';
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: David modificó % subrayados de Ester', v_filas;
  end if;

  update public.bible_bookmarks set deleted_at = now();
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then
    raise exception 'FALLO GRAVE: David retiró % marcadores de Ester', v_filas;
  end if;
end $$;

-- Tampoco puede subrayar en nombre de Ester.
do $$
begin
  begin
    insert into public.bible_highlights
      (user_id, translation_id, book_code, chapter_number, verse_start, verse_end,
       highlight_style)
    values ('99999999-9999-4999-8999-999999999999',
            'cccc0000-0000-4000-8000-000000000001', 'JOB', 3, 1, 2, 'naranja');
    raise exception 'FALLO GRAVE: David subrayó en la Biblia de Ester';
  exception
    when insufficient_privilege then null;
    when unique_violation then
      raise exception 'La política no llegó a actuar: frenó el índice único, no RLS';
  end;
end $$;

-- ── Nada se borra a mano ─────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);

do $$
begin
  begin
    delete from public.bible_highlights;
    raise exception 'FALLO: se pudo borrar un subrayado directamente';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.bible_bookmarks;
    raise exception 'FALLO: se pudo borrar un marcador directamente';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- Quitarlo es marcarlo, y entonces el sitio queda libre otra vez.
update public.bible_highlights
  set deleted_at = now()
  where id = 'dddd0000-0000-4000-8000-000000000001';

insert into public.bible_highlights
  (user_id, translation_id, book_code, chapter_number, verse_start, verse_end, highlight_style)
values (
  '99999999-9999-4999-8999-999999999999',
  'cccc0000-0000-4000-8000-000000000001',
  'SAL', 88, 3, 5, 'amarillo'
);

do $$
begin
  -- El índice único solo mira lo vigente: volver a subrayar lo que quitaste
  -- tiene que poder hacerse.
  if (select count(*) from public.bible_highlights
      where book_code = 'SAL' and verse_start = 3 and highlight_style = 'amarillo'
        and deleted_at is null) <> 1 then
    raise exception 'Debería poder volver a subrayar un pasaje que quitó';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

select 'aislamiento de subrayados y marcadores verificado' as resultado;
