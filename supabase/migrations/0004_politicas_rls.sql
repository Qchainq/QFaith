-- Migración 0004 — Row Level Security.
--
-- Regla base: un usuario solo alcanza las filas cuyo user_id coincide con
-- auth.uid(). No existe ninguna política que permita a líderes, pastores,
-- mentores ni administradores leer contenido privado, y no debe añadirse
-- ninguna (Documento 12).
--
-- RLS se activa en todas las tablas y además con `force`, de modo que ni
-- siquiera el propietario de las tablas las lea sin política. El acceso
-- administrativo legítimo pasa por la clave de servicio, que salta RLS de
-- forma explícita y auditada.

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
alter table public.devices enable row level security;
alter table public.devices force row level security;
alter table public.user_key_envelopes enable row level security;
alter table public.user_key_envelopes force row level security;
alter table public.recovery_configurations enable row level security;
alter table public.recovery_configurations force row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;
alter table public.sync_change_log enable row level security;
alter table public.sync_change_log force row level security;
alter table public.sync_conflicts enable row level security;
alter table public.sync_conflicts force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

-- ── profiles ─────────────────────────────────────────────────────────────

create policy profiles_lectura_propia on public.profiles
  for select using (id = (select auth.uid()));

create policy profiles_insercion_propia on public.profiles
  for insert with check (id = (select auth.uid()));

create policy profiles_actualizacion_propia on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Sin política de DELETE: los perfiles no se borran directamente, se marcan
-- y los retira el proceso de eliminación de cuenta.

-- ── user_settings ────────────────────────────────────────────────────────

create policy user_settings_lectura_propia on public.user_settings
  for select using (user_id = (select auth.uid()));

create policy user_settings_insercion_propia on public.user_settings
  for insert with check (user_id = (select auth.uid()));

create policy user_settings_actualizacion_propia on public.user_settings
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── devices ──────────────────────────────────────────────────────────────

create policy devices_lectura_propia on public.devices
  for select using (user_id = (select auth.uid()));

create policy devices_insercion_propia on public.devices
  for insert with check (user_id = (select auth.uid()));

create policy devices_actualizacion_propia on public.devices
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_borrado_propio on public.devices
  for delete using (user_id = (select auth.uid()));

-- ── user_key_envelopes ───────────────────────────────────────────────────

create policy user_key_envelopes_lectura_propia on public.user_key_envelopes
  for select using (user_id = (select auth.uid()));

create policy user_key_envelopes_insercion_propia on public.user_key_envelopes
  for insert with check (user_id = (select auth.uid()));

-- Un sobre no se edita: se revoca creando otro. Solo se permite marcar la
-- revocación.
create policy user_key_envelopes_revocacion_propia on public.user_key_envelopes
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy user_key_envelopes_borrado_propio on public.user_key_envelopes
  for delete using (user_id = (select auth.uid()));

-- ── recovery_configurations ──────────────────────────────────────────────

create policy recovery_configurations_lectura_propia on public.recovery_configurations
  for select using (user_id = (select auth.uid()));

create policy recovery_configurations_insercion_propia on public.recovery_configurations
  for insert with check (user_id = (select auth.uid()));

create policy recovery_configurations_actualizacion_propia on public.recovery_configurations
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── journal_entries ──────────────────────────────────────────────────────
--
-- Patrón que seguirán todas las tablas de contenido privado de la Fase 2.

create policy journal_entries_lectura_propia on public.journal_entries
  for select using (user_id = (select auth.uid()));

create policy journal_entries_insercion_propia on public.journal_entries
  for insert with check (user_id = (select auth.uid()));

create policy journal_entries_actualizacion_propia on public.journal_entries
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sin política de DELETE: el borrado es lógico mediante deleted_at y el
-- purgado definitivo lo hace un proceso con clave de servicio tras la
-- papelera de 30 días (Documento 12).

-- ── sync_change_log ──────────────────────────────────────────────────────
--
-- Solo lectura para el cliente. La bitácora la escribe el trigger, no el
-- usuario: si pudiera insertar filas podría falsear revisiones y provocar
-- que otro de sus dispositivos se saltara cambios.

create policy sync_change_log_lectura_propia on public.sync_change_log
  for select using (user_id = (select auth.uid()));

-- ── sync_conflicts ───────────────────────────────────────────────────────

create policy sync_conflicts_lectura_propia on public.sync_conflicts
  for select using (user_id = (select auth.uid()));

create policy sync_conflicts_insercion_propia on public.sync_conflicts
  for insert with check (user_id = (select auth.uid()));

create policy sync_conflicts_actualizacion_propia on public.sync_conflicts
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy sync_conflicts_borrado_propio on public.sync_conflicts
  for delete using (user_id = (select auth.uid()));

-- ── audit_events ─────────────────────────────────────────────────────────
--
-- El usuario puede consultar su propia actividad (dispositivos, accesos),
-- que es un derecho de acceso a sus datos. No puede escribirla ni borrarla:
-- una auditoría que el auditado puede editar no sirve de nada.

create policy audit_events_lectura_propia on public.audit_events
  for select using (user_id = (select auth.uid()));

-- ── account_deletion_requests ────────────────────────────────────────────

create policy account_deletion_requests_lectura_propia on public.account_deletion_requests
  for select using (user_id = (select auth.uid()));

create policy account_deletion_requests_insercion_propia on public.account_deletion_requests
  for insert with check (user_id = (select auth.uid()));

-- Cancelar una solicitud es un derecho del usuario durante el periodo de
-- gracia.
create policy account_deletion_requests_cancelacion_propia on public.account_deletion_requests
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Permisos de esquema ──────────────────────────────────────────────────
--
-- Los roles anónimo y autenticado no reciben permisos por defecto sobre
-- objetos futuros: cada tabla nueva debe conceder los suyos de forma
-- explícita, para que olvidarse de RLS no exponga datos por descuido.

alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon;

grant select, insert, update on
  public.profiles,
  public.user_settings,
  public.devices,
  public.user_key_envelopes,
  public.recovery_configurations,
  public.journal_entries,
  public.sync_conflicts,
  public.account_deletion_requests
  to authenticated;

grant delete on
  public.devices,
  public.user_key_envelopes,
  public.sync_conflicts
  to authenticated;

grant select on public.sync_change_log, public.audit_events to authenticated;
