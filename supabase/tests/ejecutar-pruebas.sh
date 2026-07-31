#!/usr/bin/env bash
# Aplica las migraciones sobre una base limpia y ejecuta las pruebas de
# aislamiento. Sirve tanto en local como en integración continua.
#
# Uso:
#   PGURL=postgres://usuario:clave@host:puerto/base ./supabase/tests/ejecutar-pruebas.sh
#
# La base indicada se recrea por completo: nunca apuntes esto a un entorno
# con datos reales.
set -euo pipefail

PGURL="${PGURL:-postgres://postgres@localhost:5432/qfaith_test}"
DIRECTORIO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▸ Base de destino: ${PGURL%%\?*}"

ejecutar() {
  psql "$PGURL" --set ON_ERROR_STOP=1 --quiet --file "$1"
}

echo "▸ Sustituto local del esquema auth"
ejecutar "$DIRECTORIO/tests/00_sustituto_auth.sql"

echo "▸ Migraciones"
for archivo in "$DIRECTORIO"/migrations/*.sql; do
  echo "  · $(basename "$archivo")"
  ejecutar "$archivo"
done

echo "▸ Pruebas de aislamiento"
for archivo in "$DIRECTORIO"/tests/0[1-9]_*.sql; do
  echo "  · $(basename "$archivo")"
  ejecutar "$archivo"
done

echo "✓ Esquema y aislamiento verificados"
