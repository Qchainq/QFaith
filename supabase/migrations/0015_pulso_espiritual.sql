-- Migración 0015 — Pulso Espiritual (Documento 12, tabla 9; Documento 6).
--
-- «¿Cómo está tu corazón hoy?». Una pregunta al día, opcional, con nueve
-- respuestas posibles y un espacio para explicarlo si a la persona le apetece.
--
-- Es la tabla con el equilibrio más delicado del proyecto, y conviene decir
-- por qué. El `mood_code` va **en claro** porque el servidor lo necesita para
-- que la IA prepare una lectura y una oración adecuadas sin descargar toda la
-- vida de alguien. Pero «ansioso» o «alejado de Dios» dicen mucho de una
-- persona, así que el esquema pone tres límites duros:
--
--   1. **Es un código cerrado de nueve valores.** No es texto libre y no
--      admite matices: no se puede guardar «ansioso por el diagnóstico de mi
--      madre» en esta columna aunque alguien quisiera.
--
--   2. **La explicación va cifrada.** Lo que la persona escribe sobre por qué
--      se siente así es contenido privado como cualquier otro.
--
--   3. **Ningún líder, pastor ni administrador lo ve.** No hay política que
--      lo permita. «Cuántos miembros están ansiosos» no es una estadística
--      que este esquema pueda producir, y esa imposibilidad es deliberada
--      (Documento 8).
--
-- **Nunca se usa para publicidad, segmentación ni diagnóstico.** No hay
-- columna que lo permita ni proceso que lo exporte.
--
-- Una decisión más: `intensity` existe en el Documento 12 y se conserva, pero
-- **no hay columna de racha ni de días seguidos**. Un pulso es una pregunta,
-- no un marcador; contar cuántos días lleva alguien «triste» convertiría un
-- acompañamiento en una vigilancia (invariante 12).

create table public.spiritual_pulses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  pulse_date date not null,

  -- Código general, nunca texto de la persona. Ver decisión 1.
  mood_code varchar(40) not null,
  intensity smallint,

  -- El «por qué», si lo escribe. Ver decisión 2.
  --
  -- El Documento 12 lo llama `encrypted_note`; aquí se usa el nombre común
  -- `encrypted_payload` como en todas las demás tablas. El motor de
  -- sincronización lee una sola columna de sobre, y una excepción por su
  -- nombre obligaría a un caso especial en el único sitio que ahora no tiene
  -- ninguno. Es la misma desviación consciente que en `habits` y `memorials`.
  encrypted_payload text,
  encryption_version smallint not null default 1,
  key_id uuid,
  nonce text,
  content_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  last_modified_device_id uuid references public.devices (id) on delete set null,
  sync_revision bigint not null default 0,

  -- Un pulso por día. Sin esto, dos dispositivos sin conexión crearían dos
  -- respuestas para el mismo día y no habría forma de saber cuál vale.
  constraint spiritual_pulses_uno_por_dia unique (user_id, pulse_date),
  constraint spiritual_pulses_version_positiva check (version >= 1),
  constraint spiritual_pulses_intensidad_valida
    check (intensity is null or intensity between 1 and 5),
  -- Los nueve estados del Documento 6, y ninguno más.
  constraint spiritual_pulses_estado_valido check (
    mood_code in (
      'enPaz', 'agradecido', 'ansioso', 'triste', 'cansado',
      'tentado', 'confundido', 'necesitoDireccion', 'alejadoDeDios'
    )
  ),
  -- Si hay nota, hay sobre completo. Una nota sin nonce sería un criptograma
  -- que nadie puede abrir, guardado para siempre.
  constraint spiritual_pulses_nota_completa check (
    encrypted_payload is null or (key_id is not null and nonce is not null and length(nonce) > 0)
  )
);

comment on table public.spiritual_pulses is
  'Respuesta diaria opcional a «¿cómo está tu corazón hoy?». Nunca se usa para publicidad, '
  'segmentación ni diagnóstico, y ningún rol de iglesia puede leerla.';
comment on column public.spiritual_pulses.mood_code is
  'Código general de nueve valores. Nunca texto escrito por la persona.';

create index spiritual_pulses_user_fecha_idx
  on public.spiritual_pulses (user_id, pulse_date desc)
  where deleted_at is null;
create index spiritual_pulses_user_revision_idx
  on public.spiritual_pulses (user_id, sync_revision);

create trigger spiritual_pulses_updated_at
  before update on public.spiritual_pulses
  for each row execute function public.fn_actualizar_updated_at();

create trigger spiritual_pulses_version
  before update on public.spiritual_pulses
  for each row execute function public.fn_incrementar_version();

create trigger spiritual_pulses_sync_log
  before insert or update on public.spiritual_pulses
  for each row execute function public.fn_registrar_cambio_sincronizacion();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.spiritual_pulses enable row level security;
alter table public.spiritual_pulses force row level security;

create policy spiritual_pulses_lectura_propia on public.spiritual_pulses
  for select using (user_id = (select auth.uid()));
create policy spiritual_pulses_insercion_propia on public.spiritual_pulses
  for insert with check (user_id = (select auth.uid()));
create policy spiritual_pulses_actualizacion_propia on public.spiritual_pulses
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política para nadie más, y sin política de borrado: el pulso se retira
-- con `deleted_at` y espera en la papelera como todo lo demás.
grant select, insert, update on public.spiritual_pulses to authenticated;
