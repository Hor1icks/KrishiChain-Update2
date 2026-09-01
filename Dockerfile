# KrishiChain | Oracle XE 11.2, pre-provisioned
#
# Ships the *recipe* for the database, not the database itself: this builds
# a local image from the same public base image krishichain-oracle already
# runs, with the krishichain app user, schema, PL/SQL layer and seed data
# set up automatically the first time a container starts. Nothing here is a
# multi-gigabyte blob checked into git — `docker build` pulls the base image
# fresh and does the real work locally, the same way `docker pull` always
# has.
#
#   docker compose up -d --build     # see docker-compose.yml
#
# or by hand:
#
#   docker build -t krishichain-oracle .
#   docker run -d --name krishichain-oracle -p 1521:1521 \
#     -e ORACLE_PASSWORD=OracleDemo2026 -e NLS_LANG=.AL32UTF8 \
#     -v krishichain-oradata:/u01/app/oracle/oradata \
#     krishichain-oracle
#
# First boot takes a few minutes (Oracle initializing its data files, then
# docker/bootstrap.sql building the schema); `docker logs -f krishichain-oracle`
# to watch it, or `docker compose ps` for the healthcheck. Subsequent starts
# are fast — the named volume persists the built database, so the schema is
# only built once, not on every restart.
FROM gvenzl/oracle-xe:11.2.0.2-slim-faststart

# The graded course files, copied in verbatim -- untouched, not the target
# of any COPY into the auto-run init directory (see docker/bootstrap.sql's
# comment on why: every .sql file gvenzl's image finds under
# /container-entrypoint-initdb.d/ gets its own fresh SYSDBA session, and
# these files assume they're already connected as krishichain).
COPY database/01_create_tables.sql \
     database/02_business_rules.sql \
     database/03_insert_data.sql \
     database/04_views.sql \
     database/05_plsql_layer.sql \
     /opt/krishichain/database/

# The one new file: creates the krishichain user, connects as it, then
# @-includes the five files above in order. This is what actually runs on
# first boot.
COPY docker/bootstrap.sql /container-entrypoint-initdb.d/01_bootstrap.sql
