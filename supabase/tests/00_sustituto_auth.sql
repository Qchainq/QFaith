-- Sustituto mínimo del esquema `auth` de Supabase, solo para poder ejecutar
-- y probar las migraciones en un PostgreSQL local. **No forma parte del
-- esquema del producto** y nunca se aplica a un entorno real: en Supabase,
-- `auth.users` y `auth.uid()` los proporciona la propia plataforma.
--
-- Reproduce lo justo para que las políticas RLS se comporten igual:
-- `auth.uid()` devuelve el usuario de la sesión actual.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- En Supabase, auth.uid() lee el «sub» del JWT. Aquí lo lee de un ajuste de
-- sesión, que es el equivalente local y permite simular a cada usuario.
--
-- Reproduce **las dos ramas** de la implementación real de Supabase. PostgREST
-- publica el «sub» de dos formas según su versión: como ajuste suelto
-- `request.jwt.claim.sub`, o dentro del JSON completo `request.jwt.claims`.
-- Las versiones actuales usan la segunda, así que una prueba local que solo
-- cubriera la primera estaría validando un camino distinto al de producción.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

-- Equivalente de auth.role(), que algunas políticas de Supabase consultan.
create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

-- Roles que Supabase crea por defecto.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;

-- ── Sustituto del esquema `storage` ──────────────────────────────────────
--
-- Igual que con `auth`: en Supabase lo proporciona la plataforma. Aquí se
-- reproduce lo justo para que las políticas de archivos se puedan ejecutar y,
-- sobre todo, **probar**. Sin esto las políticas de Storage serían el único
-- sitio del proyecto donde nadie comprueba que el aislamiento funciona, que
-- es justo donde acaban las fotografías y los audios de la gente.

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);

-- Divide la ruta en carpetas, como la función real de Supabase. La primera
-- carpeta es el identificador del usuario, y de ahí depende todo el
-- aislamiento.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  partes text[];
begin
  select string_to_array(name, '/') into partes;
  return partes[1 : array_length(partes, 1) - 1];
end
$$;

-- En Supabase, `authenticated` tiene los cuatro verbos sobre `storage.objects`
-- y quien decide es RLS. Reproducirlo es lo que hace que la prueba valga: si
-- aquí se cerrara con privilegios, una política mal escrita pasaría
-- inadvertida.
grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Supabase concede por defecto TODOS los privilegios sobre las tablas nuevas
-- de `public` a `anon` y `authenticated`. Reproducirlo aquí no es un detalle:
-- sin esto, una prueba local parte de una base cerrada que el proyecto real
-- no tiene, y no detecta que una migración se olvide de revocar lo heredado.
-- Fue exactamente el fallo que se coló hasta el proyecto real: `authenticated`
-- conservaba DELETE sobre `journal_entries` y solo RLS lo frenaba.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
