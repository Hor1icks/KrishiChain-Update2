-- =====================================================================
-- KrishiChain | 06_storage_workflow.sql
-- Post-Phase-5 addition — storage consent workflow + storage fees.
--
-- HISTORICAL MIGRATION RECORD. This is exactly what was run, by hand, in
-- two passes, against the live schema on 2026-08-06 (the first pass hit
-- two real Oracle gotchas — see the SQLBLANKLINES note and the split
-- ALTER TABLE below — both fixed here so this file matches what actually
-- worked). For a FRESH database, do NOT run this file: 01_create_tables.sql
-- and 02_sequences_triggers.sql already have this shape baked in directly
-- (WAREHOUSE.StorageFeePerKgRate, STORES's new columns, STORAGE_PAYMENT).
-- This file exists so the two gotchas below are on record, and so an
-- already-running database from before 2026-08-06 has an exact,
-- reproducible upgrade path.
--
-- NOT IN THE ORIGINAL ER DIAGRAM. Documented as a physical-schema delta
-- in context.md, same pattern as SALE_ORDER.PaymentTerms in Phase 2.
-- Two real-world mechanisms being added:
--
--   1. STORAGE FEES. Bangladesh cold storage is a flat per-kg, per-season
--      fee charged at intake (BDT ~7-8/kg for potato in 2024-25), not a
--      daily/monthly rent. WAREHOUSE carries the rate; STORES snapshots
--      it at allocation time so a later rate change never reaches back
--      into an allocation that already happened.
--
--   2. TWO-LEG STORAGE WITH CONSENT. A batch can sit in storage twice:
--        LEG 1 (pre-sale)  — the farmer's local storage. Customer = FARMER.
--        LEG 2 (post-sale) — the buyer's local storage, once they've
--                             bought it and it needs to move toward them.
--                             Customer = BUYER (the winning bidder).
--      Same STORES table, same ternary, just a second row per batch when
--      it applies. Whichever party is "the customer" for a given
--      allocation must consent before the manager's proposal becomes
--      real, and must consent again before it is released — except
--      release has two different mechanisms depending on whether the
--      manager's own MinimumStorageDays commitment has been honored yet:
--        - term fulfilled     -> either party releases directly, one step
--        - term NOT fulfilled -> the other party must explicitly approve
--      This is the rule that gives early termination real friction and
--      leaves on-time turnover simple, matching how an actual storage
--      contract works.
--
-- Existing STORES rows (all pre-sale, all farmer allocations, created
-- before this workflow existed) are backfilled below so the new NOT-NULL
-- CHECK constraints validate against them without a NOVALIDATE escape
-- hatch -- they get real values, not grandfathered exceptions.
-- =====================================================================

-- SQLBLANKLINES: by default SQL*Plus treats a blank line INSIDE a
-- multi-line statement as ending it early -- this script has blank
-- lines between grouped columns in ALTER TABLE ... ADD (...) blocks for
-- readability, so this must be ON or those statements silently truncate
-- (learned the hard way: the first run of this file did exactly that).
SET SQLBLANKLINES ON

-- =====================================================================
-- PART A — WAREHOUSE: the fee rate the owner charges
-- =====================================================================

ALTER TABLE WAREHOUSE ADD (
  StorageFeePerKgRate NUMBER(10,2)
);

ALTER TABLE WAREHOUSE ADD CONSTRAINT CK_WAREHOUSE_FEE_RATE
  CHECK (StorageFeePerKgRate IS NULL OR StorageFeePerKgRate > 0);

-- Seed a rate for every existing warehouse, in line with the 2024-25
-- BDT 7-8/kg potato-season reference rate. Real value would be set by
-- each storage manager; this just keeps existing warehouses usable.
UPDATE WAREHOUSE SET StorageFeePerKgRate = 7.50 WHERE StorageFeePerKgRate IS NULL;
COMMIT;

-- =====================================================================
-- PART B — STORES: consent workflow, two-leg customer, fee snapshot
-- =====================================================================

-- Split into two ALTERs: Oracle will not let a virtual column's
-- GENERATED ALWAYS AS expression reference a sibling column that is
-- being added in the SAME ALTER TABLE ADD statement (ORA-00904) --
-- the referenced column has to already exist first.
ALTER TABLE STORES ADD (
  -- Exactly one of these two is set. Whichever one tells you which leg
  -- this allocation is and who must consent to it.
  RequestedByFarmerID     NUMBER(10),
  RequestedByBuyerID      NUMBER(10),

  -- Set only for leg 2 (post-sale, buyer's local storage). NULL for
  -- leg 1 -- that produce has not been sold yet, there is no sale order.
  SaleOrderID             NUMBER(10),

  -- The manager's commitment, set when the allocation is proposed.
  MinimumStorageDays      NUMBER(5),

  -- Fee snapshot, same pattern as HARVEST_BATCH.AvailableQuantity: the
  -- derived amount below is same-table and deterministic, so it can be
  -- a real virtual column, not a view.
  StorageFeePerKgSnapshot NUMBER(10,2),

  -- Who is waiting on whom during a PENDING_RELEASE. Needed because
  -- release can be initiated by either the manager or the customer, and
  -- the OTHER one has to be the one who approves it.
  ReleaseRequestedBy      VARCHAR2(10)
);

ALTER TABLE STORES ADD (
  MinimumReleaseDate DATE GENERATED ALWAYS AS (DateIn + MinimumStorageDays) VIRTUAL,
  StorageFee         NUMBER(12,2) GENERATED ALWAYS AS (QuantityStored * StorageFeePerKgSnapshot) VIRTUAL
);

-- DateIn was NOT NULL. A PENDING_ACCEPT row is a proposal only -- the
-- batch is not physically in storage, and the clock has not started,
-- until the customer accepts -- so DateIn has to be settable to NULL
-- until that happens.
ALTER TABLE STORES MODIFY (DateIn NULL);

-- New allocations should default to a proposal awaiting consent, not
-- straight to ACTIVE.
ALTER TABLE STORES MODIFY (AllocationStatus DEFAULT 'PENDING_ACCEPT');

-- --- Backfill existing rows before the CHECKs below would reject them ---
-- All 10 pre-existing rows were created before this workflow existed,
-- directly against HARVEST_BATCH -- every one is a leg-1, farmer-owned
-- allocation.
UPDATE STORES s
   SET RequestedByFarmerID = (
         SELECT f.FarmerID FROM HARVEST_BATCH hb JOIN FARM f ON f.FarmID = hb.FarmID
          WHERE hb.BatchID = s.BatchID
       ),
       MinimumStorageDays = 30,
       StorageFeePerKgSnapshot = (
         SELECT w.StorageFeePerKgRate FROM WAREHOUSE w WHERE w.WarehouseID = s.WarehouseID
       )
 WHERE RequestedByFarmerID IS NULL AND RequestedByBuyerID IS NULL;
COMMIT;

ALTER TABLE STORES ADD CONSTRAINT CK_STORES_CUSTOMER CHECK (
  (RequestedByFarmerID IS NOT NULL AND RequestedByBuyerID IS NULL) OR
  (RequestedByFarmerID IS NULL AND RequestedByBuyerID IS NOT NULL)
);
ALTER TABLE STORES ADD CONSTRAINT FK_STORES_REQ_FARMER
  FOREIGN KEY (RequestedByFarmerID) REFERENCES FARMER (FarmerID);
ALTER TABLE STORES ADD CONSTRAINT FK_STORES_REQ_BUYER
  FOREIGN KEY (RequestedByBuyerID) REFERENCES BUYER (BuyerID);
ALTER TABLE STORES ADD CONSTRAINT FK_STORES_SALE_ORDER
  FOREIGN KEY (SaleOrderID) REFERENCES SALE_ORDER (SaleOrderID);
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_MINDAYS
  CHECK (MinimumStorageDays IS NULL OR MinimumStorageDays > 0);
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_RELEASE_BY
  CHECK (ReleaseRequestedBy IS NULL OR ReleaseRequestedBy IN ('FARMER', 'BUYER', 'MANAGER'));

CREATE INDEX IX_STORES_REQ_FARMER ON STORES (RequestedByFarmerID);
CREATE INDEX IX_STORES_REQ_BUYER  ON STORES (RequestedByBuyerID);
CREATE INDEX IX_STORES_SALE_ORDER ON STORES (SaleOrderID);

-- --- Widen the status vocabulary --------------------------------------
-- Was ('ACTIVE','COMPLETED','CANCELLED'). Existing rows are only ACTIVE
-- or COMPLETED, both still valid, so no data fix needed for this part.
ALTER TABLE STORES DROP CONSTRAINT CK_STORES_STATUS;
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_STATUS CHECK (
  AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE',
                        'COMPLETED', 'REJECTED', 'CANCELLED')
);

-- =====================================================================
-- PART C — STORAGE_PAYMENT
-- Deliberately a SEPARATE table from PAYMENT, not a shared one with a
-- type flag. PAYMENT already has trg_payment_biz_rules enforcing BR-19
-- and BR-20 for buyer-to-farmer sale money; tangling farmer/buyer-to-
-- storage-owner fees into that risks the trigger logic already verified
-- by fault injection. The payer is derivable from STORES via
-- AllocationID, so no separate FarmerID/BuyerID column is needed here.
-- =====================================================================

CREATE TABLE STORAGE_PAYMENT (
  StoragePaymentID      NUMBER(10)        NOT NULL,
  AllocationID          NUMBER(10)        NOT NULL,
  Amount                NUMBER(12,2)      NOT NULL,
  PaymentMethod         VARCHAR2(20 CHAR) NOT NULL,
  PaymentDate           DATE              DEFAULT SYSDATE NOT NULL,
  TransactionReference  VARCHAR2(50 CHAR) NOT NULL,
  PaymentStatus         VARCHAR2(15 CHAR) DEFAULT 'PENDING' NOT NULL,
  CONSTRAINT PK_STORAGE_PAYMENT PRIMARY KEY (StoragePaymentID),
  CONSTRAINT FK_STORAGE_PAYMENT_ALLOC FOREIGN KEY (AllocationID) REFERENCES STORES (AllocationID),
  CONSTRAINT UQ_STORAGE_PAYMENT_REF UNIQUE (TransactionReference),
  CONSTRAINT CK_STORAGE_PAYMENT_AMOUNT CHECK (Amount > 0),
  CONSTRAINT CK_STORAGE_PAYMENT_STATUS CHECK (PaymentStatus IN ('PENDING','COMPLETED','FAILED','REFUNDED'))
);

CREATE INDEX IX_STORAGE_PAYMENT_ALLOC ON STORAGE_PAYMENT (AllocationID);

CREATE SEQUENCE seq_storage_payment_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_storage_payment_id
BEFORE INSERT ON STORAGE_PAYMENT
FOR EACH ROW
WHEN (NEW.StoragePaymentID IS NULL)
BEGIN
  SELECT seq_storage_payment_id.NEXTVAL INTO :NEW.StoragePaymentID FROM dual;
END;
/

-- =====================================================================
-- VERIFICATION
-- =====================================================================

SET LINESIZE 150 PAGESIZE 40 FEEDBACK OFF

PROMPT
PROMPT === Existing STORES rows backfilled cleanly? (must show 0 unresolved) ===
SELECT COUNT(*) AS unresolved_rows FROM STORES
WHERE RequestedByFarmerID IS NULL AND RequestedByBuyerID IS NULL;

PROMPT
PROMPT === Sample of backfilled rows ===
SELECT AllocationID, BatchID, RequestedByFarmerID, MinimumStorageDays,
       StorageFeePerKgSnapshot, StorageFee, AllocationStatus
FROM STORES ORDER BY AllocationID;

PROMPT
PROMPT === New objects valid? ===
SELECT object_name, object_type, status FROM user_objects
WHERE object_name IN ('STORAGE_PAYMENT','SEQ_STORAGE_PAYMENT_ID','TRG_STORAGE_PAYMENT_ID');

-- =====================================================================
-- End of 06_storage_workflow.sql
-- =====================================================================
