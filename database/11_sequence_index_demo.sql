-- =====================================================================
-- KrishiChain | 11_sequence_index_demo.sql
--
-- Auto-increment, sequences and indexes. Run as krishichain, F5.
--
-- Read-only apart from one throwaway sequence and one throwaway index,
-- both dropped at the end. Nothing in the real schema is touched.
-- =====================================================================

SET DEFINE OFF
SET SERVEROUTPUT ON
SET LINESIZE 200
SET PAGESIZE 200

-- No PROMPT line may end in '-': SQL*Plus reads a trailing hyphen as a
-- line-continuation and swallows the statement on the next line.


PROMPT
PROMPT ================ 1. AUTO-INCREMENT ON ORACLE 11g ================
PROMPT
PROMPT Oracle 11g has no IDENTITY column and no AUTO_INCREMENT keyword.
PROMPT Both arrived in 12c. The 11g equivalent is a SEQUENCE plus a
PROMPT BEFORE INSERT trigger, which is why this schema has 18 of each.
PROMPT

SELECT COUNT(*) AS sequences_in_schema FROM user_sequences;

SELECT trigger_name, table_name
FROM   user_triggers
WHERE  trigger_name LIKE 'TRG%ID'
ORDER  BY table_name;

PROMPT
PROMPT   what the pairing looks like, end to end
SELECT text
FROM   user_source
WHERE  name = 'TRG_PAYMENT_ID' AND type = 'TRIGGER'
ORDER  BY line;

PROMPT
PROMPT   a sequence issuing values
CREATE SEQUENCE seq_demo_only START WITH 1 INCREMENT BY 1 NOCACHE;

SELECT seq_demo_only.NEXTVAL AS first_call  FROM dual;
SELECT seq_demo_only.NEXTVAL AS second_call FROM dual;
SELECT seq_demo_only.NEXTVAL AS third_call  FROM dual;
SELECT seq_demo_only.CURRVAL AS currval_does_not_advance FROM dual;

DROP SEQUENCE seq_demo_only;


PROMPT
PROMPT ==================== 2. WHAT AN INDEX DOES ====================
PROMPT
PROMPT DAILY_MARKET_PRICE holds 1080 rows. PricePerKg has no index on
PROMPT it, so a query filtering on it must read every row.
PROMPT

SELECT COUNT(*) AS rows_in_table FROM DAILY_MARKET_PRICE;

PROMPT
PROMPT   BEFORE: no index on PricePerKg
EXPLAIN PLAN FOR
SELECT CropID, AratID, PriceDate, PricePerKg
FROM   DAILY_MARKET_PRICE
WHERE  PricePerKg BETWEEN 20 AND 22;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, NULL, 'BASIC'));

PROMPT
PROMPT   create the index
CREATE INDEX ix_demo_price ON DAILY_MARKET_PRICE (PricePerKg);

PROMPT
PROMPT   AFTER: same query, same data
EXPLAIN PLAN FOR
SELECT CropID, AratID, PriceDate, PricePerKg
FROM   DAILY_MARKET_PRICE
WHERE  PricePerKg BETWEEN 20 AND 22;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, NULL, 'BASIC'));

PROMPT
PROMPT TABLE ACCESS FULL became INDEX RANGE SCAN. That is the whole
PROMPT point of an index: find the matching rows without reading the
PROMPT rest of the table.

DROP INDEX ix_demo_price;


PROMPT
PROMPT ============ 3. INDEXES ALREADY IN THIS SCHEMA ============
PROMPT
PROMPT Oracle indexes a PRIMARY KEY and a UNIQUE constraint on its own.
PROMPT It does NOT index foreign keys, so those are created by hand in
PROMPT 01_create_tables.sql - an unindexed FK makes every join to the
PROMPT parent, and every ON DELETE CASCADE, scan the child table.
PROMPT

SELECT CASE
         WHEN index_name LIKE 'PK/_%' ESCAPE '/' THEN 'primary key (automatic)'
         WHEN index_name LIKE 'UQ/_%' ESCAPE '/' THEN 'unique constraint (automatic)'
         WHEN index_name LIKE 'IX/_%' ESCAPE '/' THEN 'hand-built (mostly foreign keys)'
         ELSE 'other'
       END AS index_kind,
       COUNT(*) AS how_many
FROM   user_indexes
GROUP  BY CASE
            WHEN index_name LIKE 'PK/_%' ESCAPE '/' THEN 'primary key (automatic)'
            WHEN index_name LIKE 'UQ/_%' ESCAPE '/' THEN 'unique constraint (automatic)'
            WHEN index_name LIKE 'IX/_%' ESCAPE '/' THEN 'hand-built (mostly foreign keys)'
            ELSE 'other'
          END
ORDER  BY how_many DESC;
