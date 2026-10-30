#!/bin/bash
# Arma una base local desde cero con TODAS las migraciones del repositorio (0001 en adelante), cada una en su propia
# ejecución, como se corren en Supabase. Necesita un PostgreSQL 16 local (nunca un servidor real).
#   Uso: tests/backend/db/rebuild.sh <nombre_base> [hasta_numero]
#   Variables: PSQL (ruta de psql), PGPORT (por defecto 54329), PGUSER (por defecto postgres).
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PSQL="${PSQL:-psql}"
PORT="${PGPORT:-54329}"
USER_="${PGUSER:-postgres}"
DB="${1:?Indicá el nombre de la base a crear (se borra si existe)}"
UPTO="${2:-9999}"
"$PSQL" -p "$PORT" -U "$USER_" -q -c "drop database if exists $DB;" -c "create database $DB;" 2>&1 | grep -v NOTICE
"$PSQL" -p "$PORT" -U "$USER_" -d "$DB" -q -f "$HERE/bootstrap.sql" 2>&1 | grep ERROR | grep -v "already exists"
for f in "$REPO"/backend/supabase/migrations/*.sql; do
  b=$(basename "$f")
  n=${b%%_*}
  if [ "$((10#$n))" -gt "$((10#$UPTO))" ]; then continue; fi
  case "$b" in 0006_*|0008_*) continue;; esac
  if [ "$((10#$n))" -le 93 ]; then
    "$PSQL" -p "$PORT" -U "$USER_" -d "$DB" -q -f "$f" > /dev/null 2>&1
  else
    out=$("$PSQL" -p "$PORT" -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 -q -1 -f "$f" 2>&1 | grep -E "ERROR" | head -2)
    if [ -n "$out" ]; then echo "FALLO $b: $out"; fi
  fi
done
echo "REBUILT $DB"
