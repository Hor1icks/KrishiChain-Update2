#!/usr/bin/env bash
#
# Run SQL against the Dockerised Oracle XE without installing a client.
#
#   ./db.sh                                  interactive SQL*Plus prompt
#   ./db.sh database/05_advanced_queries.sql  run a script file
#   ./db.sh -q "SELECT COUNT(*) FROM USERS"   run one statement
#   ./db.sh -o out.txt database/04_views.sql  also save the output
#
# sqlplus lives inside the container, so nothing needs installing on the
# host. The script file stays on the host and is piped in on stdin —
# SQL*Plus's own @ command cannot see host paths.
set -uo pipefail

# Git Bash on Windows (MSYS) rewrites anything that looks like a Unix path
# -- including $SQLPLUS below -- into a Windows path before docker ever
# sees it, so `docker exec ... /u01/.../sqlplus` fails with a "no such
# file" pointing at a mangled C:/Program Files/... path. Harmless no-op on
# macOS/Linux.
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER=krishichain-oracle
SQLPLUS=/u01/app/oracle/product/11.2.0/xe/bin/sqlplus
ENV_FILE="$ROOT/server/.env"

[ -f "$ENV_FILE" ] || {
  echo "No server/.env found. Run: cp server/.env.example server/.env, then edit it." >&2
  exit 1
}
# Same read-and-strip-quotes pattern start.sh uses for ORACLE_CLIENT_DIR —
# credentials live in server/.env, never hardcoded here.
env_val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '\r'; }
DB_USER=$(env_val DB_USER)
DB_PASSWORD=$(env_val DB_PASSWORD)
DB_CONNECT_STRING=$(env_val DB_CONNECT_STRING)
[ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] && [ -n "$DB_CONNECT_STRING" ] ||
  { echo "DB_USER, DB_PASSWORD or DB_CONNECT_STRING is missing from server/.env." >&2; exit 1; }
CONN="$DB_USER/$DB_PASSWORD@$DB_CONNECT_STRING"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "The database container '$CONTAINER' is not running." >&2
  echo "Start it with:  docker start $CONTAINER   (then wait ~30s)" >&2
  exit 1
fi

OUT=""
if [ "${1:-}" = "-o" ]; then OUT="$2"; shift 2; fi

# SQLBLANKLINES ON  — 02_sequences_triggers.sql and the migrations contain
#                     PL/SQL blocks with blank lines, which would otherwise
#                     terminate the statement early when piped in.
# DEFINE OFF        — stops '&' inside seed data being read as a
#                     substitution variable prompt.
PREAMBLE='SET SQLBLANKLINES ON
SET DEFINE OFF
SET PAGESIZE 200 LINESIZE 200 FEEDBACK ON SERVEROUTPUT ON'

run() { docker exec -i "$CONTAINER" "$SQLPLUS" -S "$CONN"; }

if [ $# -eq 0 ]; then
  exec docker exec -it "$CONTAINER" "$SQLPLUS" "$CONN"       # interactive
elif [ "${1:-}" = "-q" ]; then
  printf '%s\n%s\n/\nEXIT\n' "$PREAMBLE" "$2" | run
else
  for f in "$@"; do
    [ -f "$f" ] || { echo "No such file: $f" >&2; exit 1; }
    echo "───── $f"
    { printf '%s\n' "$PREAMBLE"; cat "$f"; printf '\nEXIT\n'; } | run
  done
fi | if [ -n "$OUT" ]; then tee "$OUT"; else cat; fi
