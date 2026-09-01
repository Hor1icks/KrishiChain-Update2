-- =====================================================================
-- KrishiChain | 00_environment_check.sql
-- Day 0 environment proof for Oracle Database 11g Express Edition
-- Run this AS SYSTEM in SQL Developer or SQL*Plus, ONCE per machine.
-- Nothing else in the project starts until every check below passes.
-- =====================================================================

SET SERVEROUTPUT ON
SET LINESIZE 200
SET PAGESIZE 100

PROMPT =====================================================
PROMPT CHECK 1of5 : Database version and edition
PROMPT Expect: Oracle Database 11g Express Edition 11.2.0.2.0
PROMPT =====================================================
SELECT * FROM v$version;

PROMPT
PROMPT =====================================================
PROMPT CHECK 2of5 : Character set
PROMPT AL32UTF8  -> Bengali text OK, use VARCHAR2(n CHAR)
PROMPT WE8MSWIN1252 -> Bengali NOT storable, seed in English
PROMPT =====================================================
SELECT parameter, value
FROM   nls_database_parameters
WHERE  parameter IN ('NLS_CHARACTERSET','NLS_NCHAR_CHARACTERSET');

PROMPT
PROMPT =====================================================
PROMPT CHECK 3of5 : Instance name and service
PROMPT Expect instance_name = xe  (connect string localhost:1521/XE)
PROMPT =====================================================
SELECT instance_name, host_name, status FROM v$instance;

PROMPT
PROMPT =====================================================
PROMPT CHECK 4of5 : Create the application user
PROMPT Never develop as SYS or SYSTEM.
PROMPT CHANGE THE PASSWORD BELOW before running.
PROMPT =====================================================

-- Drop first if re-running (ignore ORA-01918 on a clean machine)
-- DROP USER krishichain CASCADE;

CREATE USER krishichain IDENTIFIED BY Krishi#2026
  DEFAULT TABLESPACE users
  TEMPORARY TABLESPACE temp;

GRANT CONNECT, RESOURCE TO krishichain;
GRANT CREATE VIEW      TO krishichain;
GRANT CREATE SEQUENCE  TO krishichain;
GRANT CREATE TRIGGER   TO krishichain;
GRANT CREATE PROCEDURE TO krishichain;
ALTER USER krishichain QUOTA UNLIMITED ON USERS;

-- On some XE installs DATABASE_PROPERTIES.DEFAULT_PERMANENT_TABLESPACE is
-- SYSTEM instead of USERS. Without the explicit DEFAULT TABLESPACE clause
-- above, every table this user creates silently lands in SYSTEM. Verify:
--   SELECT username, default_tablespace FROM dba_users WHERE username='KRISHICHAIN';
-- must show USERS, not SYSTEM.

PROMPT User krishichain created.
PROMPT
PROMPT >>> NOW RECONNECT AS krishichain BEFORE RUNNING CHECK 5 <<<
PROMPT     Connection: krishichain / Krishi#2026 @ localhost:1521/XE
PROMPT

-- =====================================================================
-- CHECK 5of5 : Feature probe -- RUN THIS BLOCK CONNECTED AS krishichain
-- Proves the three things the PRD depends on:
--   (a) sequence + BEFORE INSERT trigger identity pattern works
--   (b) virtual columns work on this XE build   [PRD sec 9.9]
--   (c) VARCHAR2(n CHAR) semantics accept multi-byte text
-- =====================================================================

CREATE TABLE kc_probe (
  probe_id   NUMBER(10)        NOT NULL,
  label      VARCHAR2(50 CHAR) NOT NULL,
  qty        NUMBER(10,3)      NOT NULL,
  unit_price NUMBER(12,2)      NOT NULL,
  total      NUMBER(14,2) GENERATED ALWAYS AS (qty * unit_price) VIRTUAL,
  CONSTRAINT pk_kc_probe PRIMARY KEY (probe_id)
);

CREATE SEQUENCE seq_kc_probe START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE OR REPLACE TRIGGER trg_kc_probe
BEFORE INSERT ON kc_probe
FOR EACH ROW
WHEN (NEW.probe_id IS NULL)
BEGIN
  SELECT seq_kc_probe.NEXTVAL INTO :NEW.probe_id FROM dual;
END;
/

-- (a)+(b): id auto-fills, total auto-computes
INSERT INTO kc_probe (label, qty, unit_price) VALUES ('Aman Rice', 1200.500, 32.75);
INSERT INTO kc_probe (label, qty, unit_price) VALUES ('Potato',     850.000, 18.40);

-- (c): multi-byte text. If this errors with ORA-12899 or shows '???',
--      your character set is NOT AL32UTF8 -> seed all data in English.
INSERT INTO kc_probe (label, qty, unit_price) VALUES ('আমন ধান', 500.000, 30.00);

COMMIT;

SELECT probe_id, label, qty, unit_price, total FROM kc_probe;

-- Expected output:
--   1  Aman Rice   1200.5   32.75   39316.38
--   2  Potato       850     18.4    15640.00
--   3  আমন ধান      500      30      15000.00

-- Cleanup
DROP TRIGGER  trg_kc_probe;
DROP SEQUENCE seq_kc_probe;
DROP TABLE    kc_probe PURGE;

PROMPT
PROMPT =====================================================
PROMPT If all five checks passed, record the results in the
PROMPT team log and proceed to test_connection.js
PROMPT =====================================================
