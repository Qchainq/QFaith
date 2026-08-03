#!/usr/bin/env bash
# Regenera supabase/esquema-completo.sql a partir de las migraciones, y
# opcionalmente un archivo con solo las que faltan por aplicar.
#
# Estos archivos existen solo por comodidad, para pegarlos de una vez en el
# editor SQL del panel de Supabase. La fuente de verdad son siempre los
# archivos de supabase/migrations/.
#
# Uso:
#   npm run sql:combinar              → esquema completo, desde cero
#   npm run sql:pendientes 0006       → solo de la 0006 en adelante
#
# El editor de Supabase ejecuta todo lo pegado en una única transacción: si
# una sola sentencia falla, no se aplica nada. Por eso volver a pegar el
# esquema completo sobre una base que ya tiene parte aplicada no rompe nada,
# pero tampoco avanza: falla en el primer `create type` que ya existe.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DESDE="${1:-}"

if [[ -z "$DESDE" ]]; then
  DESTINO=supabase/esquema-completo.sql
  TITULO='QFaith · Esquema completo'
  DETALLE='Concatenación de todos los archivos de supabase/migrations/ en orden.'
else
  DESTINO=supabase/migraciones-pendientes.sql
  TITULO="QFaith · Migraciones desde la $DESDE"
  DETALLE="Solo las migraciones $DESDE en adelante. Para una base que ya tiene
-- aplicadas las anteriores. Comprueba en cuál estás con:
--
--   select version from public.schema_migrations order by version;"
fi

ARCHIVOS=()
for archivo in supabase/migrations/*.sql; do
  nombre="$(basename "$archivo")"
  if [[ -n "$DESDE" && "${nombre%%_*}" < "$DESDE" ]]; then
    continue
  fi
  ARCHIVOS+=("$archivo")
done

if [[ ${#ARCHIVOS[@]} -eq 0 ]]; then
  echo "✗ No hay migraciones desde la $DESDE" >&2
  exit 1
fi

{
  printf -- '-- ═══════════════════════════════════════════════════════════════════════\n'
  printf -- '-- %s\n' "$TITULO"
  printf -- '--\n'
  printf -- '-- ARCHIVO GENERADO. No lo edites: se regenera desde supabase/migrations/.\n'
  printf -- '-- %s\n' "$DETALLE"
  printf -- '--\n'
  printf -- '-- No incluye supabase/tests/00_sustituto_auth.sql, que solo sirve para\n'
  printf -- '-- ejecutar las migraciones en un PostgreSQL local: en Supabase, el esquema\n'
  printf -- '-- `auth` y la función `auth.uid()` los proporciona la propia plataforma.\n'
  printf -- '-- ═══════════════════════════════════════════════════════════════════════\n'

  for archivo in "${ARCHIVOS[@]}"; do
    printf '\n-- ───────────────────────────────────────────────────────────\n'
    printf -- '-- %s\n' "$(basename "$archivo")"
    printf -- '-- ───────────────────────────────────────────────────────────\n\n'
    cat "$archivo"
  done

  # Registro de lo aplicado. Va al final para que, si algo falla antes, la
  # transacción se deshaga entera y el registro no mienta.
  printf '\n-- ───────────────────────────────────────────────────────────\n'
  printf -- '-- Registro de migraciones aplicadas\n'
  printf -- '-- ───────────────────────────────────────────────────────────\n\n'
  printf -- 'create table if not exists public.schema_migrations (\n'
  printf -- '  version text primary key,\n'
  printf -- '  applied_at timestamptz not null default now()\n'
  printf -- ');\n\n'
  printf -- 'alter table public.schema_migrations enable row level security;\n'
  printf -- '-- Sin políticas y sin privilegios: es información de operación, no del\n'
  printf -- '-- usuario. Solo la ve quien entra por el panel o con la clave de servicio.\n'
  printf -- 'revoke all on public.schema_migrations from anon, authenticated;\n\n'
  printf -- 'insert into public.schema_migrations (version) values\n'
  for indice in "${!ARCHIVOS[@]}"; do
    nombre="$(basename "${ARCHIVOS[$indice]}" .sql)"
    if [[ $indice -eq $(( ${#ARCHIVOS[@]} - 1 )) ]]; then
      printf -- "  ('%s')\n" "$nombre"
    else
      printf -- "  ('%s'),\n" "$nombre"
    fi
  done
  printf -- 'on conflict (version) do nothing;\n'
} > "$DESTINO"

echo "✓ $DESTINO regenerado ($(wc -l < "$DESTINO") líneas, ${#ARCHIVOS[@]} migraciones)"
