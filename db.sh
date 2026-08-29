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

CONTAINER=krishichain-oracle
SQLPLUS=/u01/app/oracle/product/11.2.0/xe/bin/sqlplus
CONN='krishichain/Krishi#2026@localhost:1521/XE'

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
