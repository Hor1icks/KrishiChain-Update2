-- =====================================================================
-- KrishiChain | 00_reset.sql
--
-- Drops all 27 tables so 01_create_tables.sql can be run against a
-- genuinely empty schema. Run as krishichain. F5 (Run Script).
--
-- On an already-empty schema every statement reports ORA-00942 (table or
-- view does not exist). That is expected, not a failure.
--
-- CASCADE CONSTRAINTS also drops foreign keys in other tables that point
-- at this one. PURGE skips the recycle bin. The order below is children
-- before parents, so the drops would mostly succeed without CASCADE
-- CONSTRAINTS; it is there so a half-created schema still resets.
--
-- =====================================================================

DROP TABLE NOTIFICATION         CASCADE CONSTRAINTS PURGE;
DROP TABLE COMPLAINT            CASCADE CONSTRAINTS PURGE;
DROP TABLE REVIEW               CASCADE CONSTRAINTS PURGE;
DROP TABLE BAZAR_DAILY_RECORD   CASCADE CONSTRAINTS PURGE;
DROP TABLE PHYSICAL_BAZAR       CASCADE CONSTRAINTS PURGE;
DROP TABLE DAILY_MARKET_PRICE   CASCADE CONSTRAINTS PURGE;
DROP TABLE ASSIGNED_TO          CASCADE CONSTRAINTS PURGE;
DROP TABLE TRANSPORT_REQUEST    CASCADE CONSTRAINTS PURGE;
DROP TABLE VEHICLE              CASCADE CONSTRAINTS PURGE;
DROP TABLE PAYMENT              CASCADE CONSTRAINTS PURGE;
DROP TABLE STORES               CASCADE CONSTRAINTS PURGE;
DROP TABLE SALE_ORDER           CASCADE CONSTRAINTS PURGE;
DROP TABLE BID                  CASCADE CONSTRAINTS PURGE;
DROP TABLE STORAGE_UNIT         CASCADE CONSTRAINTS PURGE;
DROP TABLE WAREHOUSE            CASCADE CONSTRAINTS PURGE;
DROP TABLE HARVEST_BATCH        CASCADE CONSTRAINTS PURGE;
DROP TABLE VIRTUAL_ARAT         CASCADE CONSTRAINTS PURGE;
DROP TABLE FARM                 CASCADE CONSTRAINTS PURGE;
DROP TABLE CROP                 CASCADE CONSTRAINTS PURGE;
DROP TABLE CROP_CATEGORY        CASCADE CONSTRAINTS PURGE;
DROP TABLE TRANSPORT_PERSONNEL  CASCADE CONSTRAINTS PURGE;
DROP TABLE STORAGE_MANAGER      CASCADE CONSTRAINTS PURGE;
DROP TABLE ADMIN_STAFF          CASCADE CONSTRAINTS PURGE;
DROP TABLE BUYER                CASCADE CONSTRAINTS PURGE;
DROP TABLE FARMER               CASCADE CONSTRAINTS PURGE;
DROP TABLE USER_PHONE           CASCADE CONSTRAINTS PURGE;
DROP TABLE USERS                CASCADE CONSTRAINTS PURGE;

-- Types go last: a table with a column of that type must be gone first.
-- FORCE drops the type even if something still claims a dependency.
BEGIN
  FOR t IN (SELECT type_name FROM user_types) LOOP
    EXECUTE IMMEDIATE 'DROP TYPE ' || t.type_name || ' FORCE';
  END LOOP;
END;
/

SELECT COUNT(*) AS tables_remaining    FROM user_tables;
SELECT COUNT(*) AS types_remaining     FROM user_types;
SELECT COUNT(*) AS recycle_bin_objects FROM recyclebin;
