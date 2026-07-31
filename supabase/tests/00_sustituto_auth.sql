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
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
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
