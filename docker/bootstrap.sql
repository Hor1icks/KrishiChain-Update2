-- =====================================================================
-- KrishiChain | docker/bootstrap.sql
--
-- Not one of the graded course files under database/ — this is orchestration
-- glue, auto-run exactly once by the base image (gvenzl/oracle-xe) the first
-- time a container starts with an empty database. It does two things the
-- graded files assume already happened: creates the krishichain application
-- user (normally Phase1/00_environment_check.sql, run by hand, once per
-- machine), then runs the real schema build chain against it.
--
-- The base image always runs custom init scripts connected AS SYSDBA
-- (see container-entrypoint.sh's run_custom_scripts_recursive), which is
-- exactly why the CONNECT below is necessary — without it, every table in
-- 01_create_tables.sql would be created under SYS instead of krishichain.
--
-- Fail loudly instead of silently leaving a half-built schema behind.
WHENEVER SQLERROR EXIT SQL.SQLCODE

PROMPT === bootstrap: creating the krishichain application user ===

-- Same grants as Phase1/00_environment_check.sql Check 4of5, same
-- DEFAULT TABLESPACE fix (some XE installs default new users to the
-- SYSTEM tablespace instead of USERS without this being explicit).
-- KrishiDemo2026 is a disposable password for a disposable local
-- container — never reuse it, and never put a real password here.
CREATE USER krishichain IDENTIFIED BY KrishiDemo2026
  DEFAULT TABLESPACE users
  TEMPORARY TABLESPACE temp;

GRANT CONNECT, RESOURCE TO krishichain;
GRANT CREATE VIEW      TO krishichain;
GRANT CREATE SEQUENCE  TO krishichain;
GRANT CREATE TRIGGER   TO krishichain;
GRANT CREATE PROCEDURE TO krishichain;
ALTER USER krishichain QUOTA UNLIMITED ON USERS;

PROMPT === bootstrap: connecting as krishichain and building the schema ===

CONNECT krishichain/KrishiDemo2026@//localhost:1521/XE

-- Same session settings db.sh uses: SQLBLANKLINES ON because 05_plsql_layer.sql
-- has PL/SQL blocks with blank lines that would otherwise end a statement
-- early; DEFINE OFF so '&' inside seeded text isn't read as a substitution
-- prompt.
SET SQLBLANKLINES ON
SET DEFINE OFF
SET SERVEROUTPUT ON

-- The graded files themselves are untouched and copied in verbatim — see
-- the Dockerfile. This is the exact 01->05 build chain from the README,
-- run against a database with nothing in it yet, so 00_reset.sql (whose
-- entire job is dropping objects that might already exist) is skipped.
@/opt/krishichain/database/01_create_tables.sql
@/opt/krishichain/database/02_business_rules.sql
@/opt/krishichain/database/03_insert_data.sql
@/opt/krishichain/database/04_views.sql
@/opt/krishichain/database/05_plsql_layer.sql

PROMPT === bootstrap: done, krishichain schema is ready ===
