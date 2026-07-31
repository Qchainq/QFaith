-- Migración 0005 — Revocar los privilegios heredados de Supabase.
--
-- Supabase concede por defecto TODOS los privilegios sobre las tablas nuevas
-- de `public` a `anon` y `authenticated`. La migración 0004 revoca ese ajuste
-- para las tablas *futuras* (`alter default privileges`), pero eso no toca las
-- que ya existían: las de 0002 y 0003 nacieron con los privilegios heredados
-- y ahí siguen.
--
-- El resultado es que `authenticated` conservaba DELETE sobre `journal_entries`
-- y UPDATE y DELETE sobre `sync_change_log` y `audit_events`, operaciones que
-- 0004 nunca concedió. No hubo pérdida de datos porque no existen políticas de
-- borrado y RLS filtra todas las filas, pero eso deja a RLS como única defensa
-- y hace que un intento de borrado responda «correcto, cero filas» en lugar de
-- «no tienes permiso». Añadir mañana una política de lectura amplia por
-- descuido convertiría ese privilegio inofensivo en pérdida de datos.
--
-- Esta migración parte de cero: revoca todo y vuelve a conceder únicamente lo
-- que cada rol necesita. Es idempotente y se puede reaplicar sin efecto.

-- ── Punto de partida: ningún privilegio ──────────────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Y que las tablas futuras tampoco los reciban, por si 0004 se aplicó en un
-- orden distinto o alguien restauró los ajustes de Supabase.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Lo que el usuario autenticado sí necesita ────────────────────────────
--
-- Lectura, alta y modificación de su propio contenido. El filtrado por
-- usuario lo hacen las políticas de 0004; esto solo abre la operación.

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

-- Borrado real solo donde tiene sentido: un dispositivo se desvincula, un
-- sobre de clave se revoca y un conflicto resuelto desaparece. El contenido
-- espiritual nunca se borra así, siempre con `deleted_at` (invariante 6).
grant delete on
  public.devices,
  public.user_key_envelopes,
  public.sync_conflicts
  to authenticated;

-- Solo lectura: la bitácora la escribe el trigger y la auditoría no la edita
-- el auditado.
grant select on public.sync_change_log, public.audit_events to authenticated;

-- La secuencia de revisiones la consume `fn_registrar_cambio_sincronizacion`,
-- que es SECURITY DEFINER y corre como propietaria. Ningún cliente necesita
-- tocarla: si pudiera, podría agotarla o desordenar los cursores de
-- sincronización de sus propios dispositivos.

-- El rol anónimo no recibe nada. No se le concede ninguna tabla.
