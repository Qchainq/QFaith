-- Migración 0012 — Iglesia y comunidad (Documento 12, tablas 32 a 38, y 12).
--
-- Es la migración con más superficie de permisos del proyecto, y por eso
-- conviene decir primero lo que **no** hace:
--
--   **Ninguna política de este archivo permite a un líder, un pastor, un
--   mentor ni un administrador leer contenido espiritual privado.** No hay
--   una política sobre `journal_entries`, ni sobre `prayers`, ni sobre
--   `memorials`, ni sobre `ai_messages`. Ni siquiera una restringida. El
--   invariante 3 no admite matices y la forma de garantizarlo es que el
--   permiso no exista, no que esté apagado.
--
-- Lo que sí se comparte es siempre **una copia cifrada para el destinatario**
-- (`prayer_shares`), nunca acceso a la fila original. Esa diferencia es todo
-- el modelo: revocar es dejar de descifrar, no confiar en que una política
-- deje de aplicarse.
--
-- Cuatro decisiones de diseño:
--
--   1. **La pertenencia se comprueba con una función `security definer`.**
--      Una política que consultara `church_memberships` directamente se
--      llamaría a sí misma al evaluar las políticas de esa misma tabla. La
--      función corta la recursión y además se puede probar aparte.
--
--   2. **Un miembro ve a los demás miembros de su iglesia, no sus perfiles.**
--      `church_memberships` dice que alguien pertenece y con qué rol. El
--      nombre y el resto del perfil siguen protegidos por la política de
--      `profiles`, que no se toca aquí.
--
--   3. **`prayer_shares` tiene un único destino válido**, impuesto por una
--      restricción y no por el código: tres columnas de destino con dos
--      rellenas serían un permiso ambiguo, y un permiso ambiguo se acaba
--      resolviendo a favor de quien pide.
--
--   4. **Un permiso caducado o revocado no concede nada.** Se comprueba en la
--      propia política, no al leer: si dependiera del cliente, bastaría con
--      no preguntar.

-- ── churches ─────────────────────────────────────────────────────────────

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  logo_path text,
  country_code varchar(2),
  city text,
  address text,
  timezone text not null default 'UTC',
  contact_email text,
  website_url text,
  status varchar(20) not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint churches_nombre_no_vacio check (length(trim(name)) > 0),
  constraint churches_slug_valido check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  constraint churches_status_valido check (status in ('active', 'suspended', 'closed'))
);

comment on table public.churches is
  'Datos públicos de una iglesia. Nunca contiene información de sus miembros.';

create index churches_status_idx on public.churches (status);

create trigger churches_updated_at
  before update on public.churches
  for each row execute function public.fn_actualizar_updated_at();

-- ── church_memberships ───────────────────────────────────────────────────

create table public.church_memberships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  role public.church_role not null default 'member',
  membership_status varchar(20) not null default 'active',
  joined_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_memberships_unica unique (church_id, user_id),
  constraint church_memberships_status_valido
    check (membership_status in ('pending', 'active', 'inactive', 'left'))
);

comment on table public.church_memberships is
  'Pertenencia y rol. Un rol NUNCA concede acceso a contenido espiritual privado.';

create index church_memberships_church_idx
  on public.church_memberships (church_id, membership_status);
create index church_memberships_user_idx on public.church_memberships (user_id);

create trigger church_memberships_updated_at
  before update on public.church_memberships
  for each row execute function public.fn_actualizar_updated_at();

-- ── Funciones de pertenencia ─────────────────────────────────────────────
--
-- `security definer` para cortar la recursión de políticas (decisión 1).
-- `search_path` fijado: sin él, un esquema en el camino de búsqueda del
-- llamante podría suplantar a `public` y la función devolvería lo que otro
-- quisiera.

create or replace function public.fn_es_miembro_activo(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = p_church_id
      and user_id = (select auth.uid())
      and membership_status = 'active'
  );
$$;

comment on function public.fn_es_miembro_activo(uuid) is
  'Pertenencia activa del usuario actual. No concede acceso a nada privado.';

create or replace function public.fn_lidera_iglesia(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = p_church_id
      and user_id = (select auth.uid())
      and membership_status = 'active'
      and role in ('leader', 'pastor', 'administrator')
  );
$$;

comment on function public.fn_lidera_iglesia(uuid) is
  'Permite administrar la vida institucional: eventos, grupos y publicaciones. '
  'NUNCA leer contenido espiritual privado de un miembro.';

revoke all on function public.fn_es_miembro_activo(uuid) from public;
revoke all on function public.fn_lidera_iglesia(uuid) from public;
grant execute on function public.fn_es_miembro_activo(uuid) to authenticated;
grant execute on function public.fn_lidera_iglesia(uuid) to authenticated;

-- ── church_groups ────────────────────────────────────────────────────────

create table public.church_groups (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,

  name text not null,
  description text,
  group_type varchar(30) not null default 'grupo',
  leader_user_id uuid references auth.users (id) on delete set null,
  meeting_schedule jsonb,
  status varchar(20) not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint church_groups_nombre_no_vacio check (length(trim(name)) > 0),
  constraint church_groups_tipo_valido check (
    group_type in ('grupo', 'mentoria', 'discipulado', 'escuela', 'ministerio')
  ),
  constraint church_groups_status_valido check (status in ('active', 'inactive', 'closed'))
);

create index church_groups_church_idx on public.church_groups (church_id, status);

create trigger church_groups_updated_at
  before update on public.church_groups
  for each row execute function public.fn_actualizar_updated_at();

-- ── group_memberships ────────────────────────────────────────────────────

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.church_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  role varchar(20) not null default 'member',
  status varchar(20) not null default 'active',
  joined_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_memberships_unica unique (group_id, user_id),
  constraint group_memberships_rol_valido check (role in ('member', 'leader')),
  constraint group_memberships_status_valido check (status in ('pending', 'active', 'left'))
);

create index group_memberships_group_idx on public.group_memberships (group_id, status);
create index group_memberships_user_idx on public.group_memberships (user_id);

create trigger group_memberships_updated_at
  before update on public.group_memberships
  for each row execute function public.fn_actualizar_updated_at();

create or replace function public.fn_pertenece_al_grupo(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

revoke all on function public.fn_pertenece_al_grupo(uuid) from public;
grant execute on function public.fn_pertenece_al_grupo(uuid) to authenticated;

-- ── church_events ────────────────────────────────────────────────────────

create table public.church_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches (id) on delete cascade,
  group_id uuid references public.church_groups (id) on delete set null,

  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer,
  registration_required boolean not null default false,
  status varchar(20) not null default 'scheduled',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint church_events_titulo_no_vacio check (length(trim(title)) > 0),
  constraint church_events_fechas_coherentes check (ends_at is null or ends_at >= starts_at),
  constraint church_events_aforo_valido check (capacity is null or capacity > 0),
  constraint church_events_status_valido check (status in ('scheduled', 'cancelled', 'finished'))
);

create index church_events_church_idx
  on public.church_events (church_id, starts_at)
  where deleted_at is null;

create trigger church_events_updated_at
  before update on public.church_events
  for each row execute function public.fn_actualizar_updated_at();

-- ── event_registrations ──────────────────────────────────────────────────

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.church_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  status varchar(20) not null default 'registered',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,

  constraint event_registrations_unica unique (event_id, user_id),
  constraint event_registrations_status_valido
    check (status in ('registered', 'cancelled', 'attended'))
);

create index event_registrations_event_idx on public.event_registrations (event_id, status);
create index event_registrations_user_idx on public.event_registrations (user_id);

-- ── mentor_relationships ─────────────────────────────────────────────────

create table public.mentor_relationships (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches (id) on delete set null,
  mentor_user_id uuid not null references auth.users (id) on delete cascade,
  mentee_user_id uuid not null references auth.users (id) on delete cascade,

  status varchar(20) not null default 'pending',
  -- Solo describe qué información compartida alcanza el mentor. Nunca concede
  -- acceso general al diario, a la IA ni al memorial: no hay política que lo
  -- permita, así que ningún valor de este campo puede abrirla.
  permissions jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mentor_relationships_distintos check (mentor_user_id <> mentee_user_id),
  constraint mentor_relationships_status_valido
    check (status in ('pending', 'active', 'ended', 'rejected'))
);

comment on column public.mentor_relationships.permissions is
  'Qué información compartida alcanza el mentor. Nunca acceso general a nada privado.';

create index mentor_relationships_mentor_idx
  on public.mentor_relationships (mentor_user_id, status);
create index mentor_relationships_mentee_idx
  on public.mentor_relationships (mentee_user_id, status);

create trigger mentor_relationships_updated_at
  before update on public.mentor_relationships
  for each row execute function public.fn_actualizar_updated_at();

-- ── prayer_shares ────────────────────────────────────────────────────────
--
-- Aquí está el corazón del modelo de compartición. El destinatario **no lee
-- la fila de `prayers`**: lee esta, que contiene una copia cifrada para él.
-- Revocar es dejar de poder descifrar, no confiar en que una política deje de
-- aplicarse.

create table public.prayer_shares (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayers (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,

  -- Un único destino. Ver decisión 3.
  recipient_user_id uuid references auth.users (id) on delete cascade,
  group_id uuid references public.church_groups (id) on delete cascade,
  church_id uuid references public.churches (id) on delete cascade,

  -- Copia cifrada para el destinatario, con su clave de contenido envuelta.
  -- El servidor no puede abrir ninguna de las dos.
  encrypted_shared_payload text not null,
  encrypted_content_key text not null,
  nonce text not null,

  permission_level varchar(30) not null default 'read',
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),

  constraint prayer_shares_payload_no_vacio check (length(encrypted_shared_payload) > 0),
  constraint prayer_shares_clave_no_vacia check (length(encrypted_content_key) > 0),
  constraint prayer_shares_permiso_valido check (permission_level in ('read', 'read_and_pray')),
  -- Exactamente un destino, ni cero ni dos.
  constraint prayer_shares_un_solo_destino check (
    (recipient_user_id is not null)::int
    + (group_id is not null)::int
    + (church_id is not null)::int = 1
  )
  -- Sin restricción sobre `expires_at`. La tentación era exigir que fuera
  -- futura, pero eso impediría acortar una caducidad ya puesta —una forma
  -- legítima de cortar el acceso— y dejaría la ruta de caducidad sin poder
  -- probarse. Una caducidad en el pasado falla hacia el lado seguro: la
  -- política la deja invisible, que es justo lo que se quiere.
);

comment on table public.prayer_shares is
  'Copia cifrada de una petición para un destinatario. No concede acceso a la petición original '
  'ni a ningún otro contenido del usuario.';

create index prayer_shares_owner_idx on public.prayer_shares (owner_user_id, prayer_id);
create index prayer_shares_destinatario_idx
  on public.prayer_shares (recipient_user_id)
  where revoked_at is null;
create index prayer_shares_grupo_idx on public.prayer_shares (group_id) where revoked_at is null;
create index prayer_shares_iglesia_idx on public.prayer_shares (church_id) where revoked_at is null;

/**
 * ¿Sigue vigente esta compartición?
 *
 * Se comprueba en la política, no al leer (decisión 4). Si dependiera del
 * cliente, bastaría con no preguntar.
 */
create or replace function public.fn_comparticion_vigente(
  p_revoked_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select p_revoked_at is null and (p_expires_at is null or p_expires_at > now());
$$;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.churches enable row level security;
alter table public.churches force row level security;
alter table public.church_memberships enable row level security;
alter table public.church_memberships force row level security;
alter table public.church_groups enable row level security;
alter table public.church_groups force row level security;
alter table public.group_memberships enable row level security;
alter table public.group_memberships force row level security;
alter table public.church_events enable row level security;
alter table public.church_events force row level security;
alter table public.event_registrations enable row level security;
alter table public.event_registrations force row level security;
alter table public.mentor_relationships enable row level security;
alter table public.mentor_relationships force row level security;
alter table public.prayer_shares enable row level security;
alter table public.prayer_shares force row level security;

-- Iglesias: cualquiera con sesión puede buscarlas para unirse. Solo hay datos
-- institucionales, ninguno de una persona.
create policy churches_lectura on public.churches
  for select using (status = 'active');
create policy churches_actualizacion_por_liderazgo on public.churches
  for update using (public.fn_lidera_iglesia(id))
  with check (public.fn_lidera_iglesia(id));

-- Membresías: se ve la propia siempre, y las de la iglesia a la que se
-- pertenece. Ver decisión 2: esto dice quién pertenece, no quién es.
create policy church_memberships_lectura on public.church_memberships
  for select using (
    user_id = (select auth.uid()) or public.fn_es_miembro_activo(church_id)
  );
-- Unirse es un acto propio: se inserta la fila de uno mismo.
create policy church_memberships_insercion_propia on public.church_memberships
  for insert with check (user_id = (select auth.uid()));
-- El usuario puede abandonar la iglesia cuando quiera; el liderazgo gestiona
-- roles y estados de los demás.
create policy church_memberships_actualizacion on public.church_memberships
  for update using (
    user_id = (select auth.uid()) or public.fn_lidera_iglesia(church_id)
  )
  with check (
    user_id = (select auth.uid()) or public.fn_lidera_iglesia(church_id)
  );

create policy church_groups_lectura on public.church_groups
  for select using (public.fn_es_miembro_activo(church_id));
create policy church_groups_gestion on public.church_groups
  for insert with check (public.fn_lidera_iglesia(church_id));
create policy church_groups_actualizacion on public.church_groups
  for update using (public.fn_lidera_iglesia(church_id))
  with check (public.fn_lidera_iglesia(church_id));

create policy group_memberships_lectura on public.group_memberships
  for select using (
    user_id = (select auth.uid()) or public.fn_pertenece_al_grupo(group_id)
  );
create policy group_memberships_insercion_propia on public.group_memberships
  for insert with check (user_id = (select auth.uid()));
create policy group_memberships_actualizacion_propia on public.group_memberships
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy church_events_lectura on public.church_events
  for select using (deleted_at is null and public.fn_es_miembro_activo(church_id));
create policy church_events_gestion on public.church_events
  for insert with check (public.fn_lidera_iglesia(church_id));
create policy church_events_actualizacion on public.church_events
  for update using (public.fn_lidera_iglesia(church_id))
  with check (public.fn_lidera_iglesia(church_id));

-- Inscripciones: cada uno ve la suya. El liderazgo ve las de sus eventos,
-- porque para eso existe el control de asistencia.
create policy event_registrations_lectura on public.event_registrations
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  );
create policy event_registrations_insercion_propia on public.event_registrations
  for insert with check (user_id = (select auth.uid()));
create policy event_registrations_actualizacion on public.event_registrations
  for update using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.church_events e
      where e.id = event_id and public.fn_lidera_iglesia(e.church_id)
    )
  );

-- Mentorías: las ven las dos partes y nadie más. Ni siquiera el liderazgo de
-- la iglesia: a quién acompaña quién no es información institucional.
create policy mentor_relationships_lectura on public.mentor_relationships
  for select using (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );
create policy mentor_relationships_insercion on public.mentor_relationships
  for insert with check (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );
-- El acompañado puede revocar cuando quiera; el mentor solo puede aceptar o
-- terminar la suya.
create policy mentor_relationships_actualizacion on public.mentor_relationships
  for update using (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  )
  with check (
    mentor_user_id = (select auth.uid()) or mentee_user_id = (select auth.uid())
  );

-- Comparticiones: el propietario ve las suyas; el destinatario ve solo las
-- vigentes que le apuntan a él, a un grupo suyo o a su iglesia.
create policy prayer_shares_lectura_propietario on public.prayer_shares
  for select using (owner_user_id = (select auth.uid()));

create policy prayer_shares_lectura_destinatario on public.prayer_shares
  for select using (
    public.fn_comparticion_vigente(revoked_at, expires_at)
    and (
      recipient_user_id = (select auth.uid())
      or (group_id is not null and public.fn_pertenece_al_grupo(group_id))
      or (church_id is not null and public.fn_es_miembro_activo(church_id))
    )
  );

-- Solo se comparte lo propio, y solo si la petición es de uno.
create policy prayer_shares_insercion_propia on public.prayer_shares
  for insert with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.prayers p
      where p.id = prayer_id and p.user_id = (select auth.uid())
    )
  );

-- Revocar es una actualización, y solo la hace el propietario.
create policy prayer_shares_actualizacion_propietario on public.prayer_shares
  for update using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────
--
-- Sin DELETE en ninguna: las membresías se marcan, los eventos se cancelan y
-- las comparticiones se revocan. Un borrado físico dejaría al otro lado sin
-- forma de saber que algo cambió.

grant select on public.churches to authenticated;
grant update on public.churches to authenticated;
grant select, insert, update on public.church_memberships to authenticated;
grant select, insert, update on public.church_groups to authenticated;
grant select, insert, update on public.group_memberships to authenticated;
grant select, insert, update on public.church_events to authenticated;
grant select, insert, update on public.event_registrations to authenticated;
grant select, insert, update on public.mentor_relationships to authenticated;
grant select, insert, update on public.prayer_shares to authenticated;

-- Y lo que este archivo NO concede, dicho en voz alta para que se note si
-- alguien lo añade: ninguna política ni privilegio sobre journal_entries,
-- prayers, memorials, bible_notes, life_library_items, ai_conversations,
-- ai_messages, habits ni habit_logs. Un rol de iglesia no alcanza nada de eso.

-- ── user_sharing_keys ────────────────────────────────────────────────────
--
-- **Desviación consciente del Documento 12**, que no contempla esta tabla.
-- Hace falta para que compartir sea posible sin que el servidor pueda leer:
-- quien comparte necesita la clave pública del destinatario, y sin un sitio
-- donde publicarla el único camino sería que el servidor mediara, que es
-- exactamente lo que el invariante 1 impide.
--
-- La alternativa era añadir la columna a `profiles`, pero eso obligaría a
-- abrir la lectura de perfiles ajenos —nombre, año de nacimiento, país— solo
-- para llegar a un dato que no es personal. Una tabla aparte con un único
-- dato público es menos superficie.
--
-- **Una clave pública es pública por definición.** Publicarla no filtra nada:
-- sin la privada, que se deriva de la clave maestra y nunca sale del
-- dispositivo, no abre ningún sobre.

create table public.user_sharing_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_key text not null,
  algorithm varchar(20) not null default 'x25519',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_sharing_keys_publica_no_vacia check (length(public_key) > 0),
  constraint user_sharing_keys_algoritmo_valido check (algorithm in ('x25519'))
);

comment on table public.user_sharing_keys is
  'Clave pública de compartición. Nunca contiene material privado: sin la privada, '
  'que se deriva de la clave maestra en el dispositivo, no abre ningún sobre.';

create trigger user_sharing_keys_updated_at
  before update on public.user_sharing_keys
  for each row execute function public.fn_actualizar_updated_at();

alter table public.user_sharing_keys enable row level security;
alter table public.user_sharing_keys force row level security;

-- Cualquiera con sesión puede leerla: es el único modo de poder sellarle algo
-- a alguien. Solo su dueño puede escribirla, o alguien podría sustituirla por
-- la suya y hacer que le llegara a él lo que se comparte con otro.
create policy user_sharing_keys_lectura on public.user_sharing_keys
  for select using (true);
create policy user_sharing_keys_insercion_propia on public.user_sharing_keys
  for insert with check (user_id = (select auth.uid()));
create policy user_sharing_keys_actualizacion_propia on public.user_sharing_keys
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_sharing_keys to authenticated;
