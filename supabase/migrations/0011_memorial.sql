-- Migración 0011 — Memorial (Documento 12, tabla 13).
--
-- El memorial es el registro de lo que alguien vio que Dios hizo. Nace casi
-- siempre de una oración marcada como respondida, y por eso `prayer_id` es la
-- única relación de la tabla.
--
-- Tres decisiones sobre la forma:
--
--   1. **`prayer_id` es opcional y `on delete set null`.** Un memorial puede
--      escribirse sin que haya una petición detrás —hay cosas que uno no pidió
--      y agradece igual—, y borrar la petición no puede llevarse por delante
--      el recuerdo de la respuesta.
--
--   2. **`occurred_on` es una fecha, no un instante.** Nadie recuerda a qué
--      hora pasó algo importante; recuerda el día. Un `timestamptz` obligaría
--      a inventar una hora y a convertirla entre zonas horarias, y la fecha
--      del recuerdo cambiaría al viajar.
--
--   3. **Nada del contenido queda fuera del sobre.** Ni un título, ni un
--      resumen. El Documento 12 lo deja en `encrypted_payload` y aquí no se
--      añade ninguna columna de texto que el servidor pueda leer.
--
-- El invariante 3 se aplica sin matices: **ningún líder, pastor, mentor ni
-- administrador puede leer un memorial**, ni siquiera cuando la petición de la
-- que nació estuviera compartida. Compartir una oración no comparte lo que
-- alguien escribió después sobre lo que le pasó.

create table public.memorials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- La petición de la que nació, si nació de una. Ver decisión 1.
  prayer_id uuid references public.prayers (id) on delete set null,

  -- El día en que ocurrió, no el día en que se escribió. Ver decisión 2.
  occurred_on date,

  encrypted_payload text not null,
  encryption_version smallint not null default 1,
  key_id uuid not null,
  nonce text not null,
  content_hash text,

  is_favorite boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  constraint memorials_payload_no_vacio check (length(encrypted_payload) > 0),
  constraint memorials_nonce_no_vacio check (length(nonce) > 0),
  constraint memorials_version_positiva check (version >= 1)
);

comment on table public.memorials is
  'Registro de respuestas recibidas. Cifrado entero; ni la iglesia ni un mentor pueden leerlo.';
comment on column public.memorials.prayer_id is
  'Petición de origen, opcional. Borrarla no borra el memorial.';

create index memorials_user_fecha_idx
  on public.memorials (user_id, occurred_on desc)
  where deleted_at is null;
create index memorials_user_favoritos_idx
  on public.memorials (user_id, is_favorite)
  where deleted_at is null and is_favorite;
create index memorials_peticion_idx on public.memorials (prayer_id);
create index memorials_user_revision_idx on public.memorials (user_id, sync_revision);

create trigger memorials_updated_at
  before update on public.memorials
  for each row execute function public.fn_actualizar_updated_at();

create trigger memorials_version
  before update on public.memorials
  for each row execute function public.fn_incrementar_version();

create trigger memorials_sync_log
  before insert or update on public.memorials
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.memorials enable row level security;
alter table public.memorials force row level security;

create policy memorials_lectura_propia on public.memorials
  for select using (user_id = (select auth.uid()));
create policy memorials_insercion_propia on public.memorials
  for insert with check (user_id = (select auth.uid()));
create policy memorials_actualizacion_propia on public.memorials
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de borrado: el memorial se retira con `deleted_at` y espera en
-- la papelera 30 días (invariante 6). Es justo el contenido que alguien puede
-- borrar en un mal día y querer de vuelta al siguiente.
grant select, insert, update on public.memorials to authenticated;
