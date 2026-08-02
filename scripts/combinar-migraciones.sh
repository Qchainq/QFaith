#!/usr/bin/env bash
# Regenera supabase/esquema-completo.sql a partir de las migraciones.
#
# Ese archivo existe solo por comodidad, para pegarlo de una vez en el editor
# SQL del panel de Supabase. La fuente de verdad son siempre los archivos de
# supabase/migrations/.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DESTINO=supabase/esquema-completo.sql

{
  cat <<'CABECERA'
-- ═══════════════════════════════════════════════════════════════════════
-- QFaith · Esquema completo
--
-- ARCHIVO GENERADO. No lo edites: es la concatenación de los archivos de
-- supabase/migrations/ en orden. Para regenerarlo:  npm run sql:combinar
--
-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para
-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema
-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.
-- ═══════════════════════════════════════════════════════════════════════
CABECERA

  for archivo in supabase/migrations/*.sql; do
    printf '\n-- ───────────────────────────────────────────────────────────\n'
    printf -- '-- %s\n' "$(basename "$archivo")"
    printf -- '-- ───────────────────────────────────────────────────────────\n\n'
    cat "$archivo"
  done
} > "$DESTINO"

echo "✓ $DESTINO regenerado ($(wc -l < "$DESTINO") líneas)"
