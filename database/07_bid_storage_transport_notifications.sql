-- =====================================================================
-- KrishiChain | 07_bid_storage_transport_notifications.sql
-- Feedback-batch migration — minimum bid quantity, storage negotiation,
-- customer-initiated storage requests, transport-vs-storage gating, and
-- an in-app notification center.
--
-- HISTORICAL MIGRATION RECORD, same pattern as 06_storage_workflow.sql:
-- this is exactly what to run, by hand, against the live schema. For a
-- FRESH database, do NOT run this file: 01_create_tables.sql and
-- 02_sequences_triggers.sql already have this shape baked in directly.
-- This file exists so an already-running database from before this
-- change has an exact, reproducible upgrade path.
--
-- Five mechanisms being added, in dependency order:
--
--   1. MINIMUM BID QUANTITY. HARVEST_BATCH.MinimumBidQuantity, farmer-set
--      at batch creation. Same-table comparison against TotalQuantity is
--      a plain CHECK (CK_BATCH_MINBIDQTY); the cross-table comparison
--      against BID.RequestedQuantity needs a trigger (trg_bid_min_qty),
--      since a CHECK constraint cannot reference another table.
--
--   2. STORAGE NEGOTIATION. STORES gains ProposedBy (who created the
--      row — a manager proposing, or a customer requesting), and a
--      single-round counter-offer (CounterRatePerKg/CounteredBy, plus a
--      new COUNTERED status). Only the ORIGINAL proposer may accept or
--      reject a counter — no re-countering.
--
--   3. CUSTOMER-INITIATED REQUESTS. No schema change beyond #2 —
--      ProposedBy='CUSTOMER' on a row a farmer/buyer created themselves
--      (via the new requestAllocation() service function) is what makes
--      this direction possible; the manager becomes the responder.
--
--   4. TRANSPORT GATED ON A STORAGE DECISION. SALE_ORDER.DeliveryPreference:
--      a transport request is not claimable until the buyer has chosen
--      DIRECT (explicit action) or a leg-2 STORES allocation for that
--      order has reached ACTIVE (which sets VIA_STORAGE automatically).
--
--   5. NOTIFICATIONS. A new NOTIFICATION table, generic UserID -> USERS
--      FK (the only table in this schema shaped that way — a
--      notification's recipient can be any of the five roles, and USERS
--      is the total/disjoint superclass every one of them resolves to).
--      Writes from the service layer are best-effort, not
--      transaction-atomic with the business event they describe — see
--      server/src/services/notification.service.js.
--
-- NOT IN THE ORIGINAL ER DIAGRAM. Documented as a physical-schema delta
-- in context.md, same pattern as SALE_ORDER.PaymentTerms (Phase 2) and
-- the storage consent workflow (06_storage_workflow.sql).
-- =====================================================================

-- SQLBLANKLINES: see 06_storage_workflow.sql's note — this script has
-- blank lines inside multi-line statements for readability, which
-- SQL*Plus would otherwise treat as ending the statement early.
SET SQLBLANKLINES ON

-- =====================================================================
-- PART A — HARVEST_BATCH: minimum bid quantity
-- =====================================================================

ALTER TABLE HARVEST_BATCH ADD (
  MinimumBidQuantity NUMBER(12,3)
);

-- Backfill: 10% of TotalQuantity per batch. Comfortably below every
-- already-seeded BID.RequestedQuantity (the lowest ever bid per batch is
-- 1800kg, batch 7) and satisfies CK_BATCH_MINBIDQTY (<= TotalQuantity) by
-- construction.
UPDATE HARVEST_BATCH
   SET MinimumBidQuantity = ROUND(TotalQuantity * 0.10, 3)
 WHERE MinimumBidQuantity IS NULL;
COMMIT;

ALTER TABLE HARVEST_BATCH MODIFY (MinimumBidQuantity NOT NULL);

ALTER TABLE HARVEST_BATCH ADD CONSTRAINT CK_BATCH_MINBIDQTY
  CHECK (MinimumBidQuantity > 0 AND MinimumBidQuantity <= TotalQuantity);

-- =====================================================================
-- PART B — BID: minimum-quantity trigger (cross-table, needs PL/SQL)
-- =====================================================================

CREATE OR REPLACE TRIGGER trg_bid_min_qty
BEFORE INSERT ON BID
FOR EACH ROW
DECLARE
  v_min HARVEST_BATCH.MinimumBidQuantity%TYPE;
BEGIN
  SELECT MinimumBidQuantity INTO v_min FROM HARVEST_BATCH WHERE BatchID = :NEW.BatchID;

  IF :NEW.RequestedQuantity < v_min THEN
    RAISE_APPLICATION_ERROR(-20003,
      'Requested quantity ' || :NEW.RequestedQuantity ||
      ' is below this batch''s minimum bid quantity of ' || v_min || '.');
  END IF;
END;
/

-- =====================================================================
-- PART C — SALE_ORDER: transport-vs-storage delivery preference
-- =====================================================================

ALTER TABLE SALE_ORDER ADD (
  DeliveryPreference VARCHAR2(15 CHAR) DEFAULT 'PENDING' NOT NULL
);

ALTER TABLE SALE_ORDER ADD CONSTRAINT CK_ORDER_DELIVERY_PREF
  CHECK (DeliveryPreference IN ('PENDING','DIRECT','VIA_STORAGE'));

-- Backfill existing orders so already-moving transport doesn't look
-- broken against a fresh PENDING-gated claim() check: VIA_STORAGE if a
-- non-terminal/completed leg-2 allocation already exists for the order,
-- else DIRECT if its transport request is already past PENDING (i.e. was
-- claimed under the old, ungated rules), else leave the default PENDING.
UPDATE SALE_ORDER so
   SET DeliveryPreference = 'VIA_STORAGE'
 WHERE EXISTS (
         SELECT 1 FROM STORES s
          WHERE s.SaleOrderID = so.SaleOrderID
            AND s.AllocationStatus IN ('PENDING_ACCEPT','ACTIVE','PENDING_RELEASE','COMPLETED','COUNTERED')
       );

UPDATE SALE_ORDER so
   SET DeliveryPreference = 'DIRECT'
 WHERE DeliveryPreference = 'PENDING'
   AND EXISTS (
         SELECT 1 FROM TRANSPORT_REQUEST tr
          WHERE tr.SaleOrderID = so.SaleOrderID
            AND tr.DeliveryStatus <> 'PENDING'
       );
COMMIT;

-- =====================================================================
-- PART D — STORES: single-round negotiation
-- =====================================================================

ALTER TABLE STORES ADD (
  ProposedBy       VARCHAR2(10),
  CounterRatePerKg NUMBER(10,2),
  CounteredBy      VARCHAR2(10)
);

-- Backfill: every existing STORES row predates customer-initiated
-- requests, so all of them were manager-proposed.
UPDATE STORES SET ProposedBy = 'MANAGER' WHERE ProposedBy IS NULL;
COMMIT;

ALTER TABLE STORES MODIFY (ProposedBy NOT NULL);

ALTER TABLE STORES ADD CONSTRAINT CK_STORES_PROPOSEDBY
  CHECK (ProposedBy IN ('MANAGER','CUSTOMER'));
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_COUNTERRATE
  CHECK (CounterRatePerKg IS NULL OR CounterRatePerKg > 0);
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_COUNTEREDBY
  CHECK (CounteredBy IS NULL OR CounteredBy IN ('MANAGER','CUSTOMER'));

-- Widen the status vocabulary to add COUNTERED. Existing rows are all
-- PENDING_ACCEPT/ACTIVE/PENDING_RELEASE/COMPLETED, all still valid, so no
-- data fix needed for this part.
ALTER TABLE STORES DROP CONSTRAINT CK_STORES_STATUS;
ALTER TABLE STORES ADD CONSTRAINT CK_STORES_STATUS CHECK (
  AllocationStatus IN ('PENDING_ACCEPT','ACTIVE','PENDING_RELEASE',
                        'COMPLETED','REJECTED','CANCELLED','COUNTERED')
);

-- =====================================================================
-- PART E — NOTIFICATION
-- =====================================================================

CREATE TABLE NOTIFICATION (
  NotificationID     NUMBER(10)         NOT NULL,
  UserID             NUMBER(10)         NOT NULL,
  Type               VARCHAR2(30 CHAR)  NOT NULL,
  Title              VARCHAR2(150 CHAR) NOT NULL,
  Message            VARCHAR2(500 CHAR) NOT NULL,
  RelatedEntityType  VARCHAR2(30 CHAR),
  RelatedEntityID    NUMBER(10),
  IsRead             CHAR(1)            DEFAULT 'N' NOT NULL,
  CreatedAt          TIMESTAMP          DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_NOTIFICATION PRIMARY KEY (NotificationID),
  CONSTRAINT FK_NOTIFICATION_USER FOREIGN KEY (UserID) REFERENCES USERS (UserID),
  CONSTRAINT CK_NOTIFICATION_READ CHECK (IsRead IN ('Y','N'))
);

CREATE INDEX IX_NOTIFICATION_USER ON NOTIFICATION (UserID, IsRead, CreatedAt);

CREATE SEQUENCE seq_notification_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_notification_id
BEFORE INSERT ON NOTIFICATION
FOR EACH ROW
WHEN (NEW.NotificationID IS NULL)
BEGIN
  SELECT seq_notification_id.NEXTVAL INTO :NEW.NotificationID FROM dual;
END;
/

-- =====================================================================
-- PART F — VIEWS (CREATE OR REPLACE, safe to re-run)
-- =====================================================================

CREATE OR REPLACE VIEW V_BATCH_AVAILABILITY AS
SELECT hb.BatchID,
       hb.Status                                   AS BatchStatus,
       c.CropID,
       c.CropName,
       cc.CategoryName,
       c.Unit,
       c.BasePrice,
       f.FarmID,
       f.FarmName,
       f.District                                  AS FarmDistrict,
       fr.FarmerID,
       fu.FirstName || ' ' || fu.LastName           AS FarmerName,
       va.AratID,
       va.AratName,
       va.District                                 AS AratDistrict,
       hb.HarvestDate,
       hb.TotalQuantity,
       hb.ReservedQuantity,
       hb.SoldQuantity,
       hb.AvailableQuantity,
       hb.QualityGrade,
       hb.MoisturePercentage,
       hb.MinimumPrice,
       hb.BiddingStartTime,
       hb.BiddingEndTime,
       hb.MinimumBidQuantity,
       (SELECT MAX(b.BidPricePerKg)
          FROM BID b
         WHERE b.BatchID = hb.BatchID
           AND b.Status IN ('ACTIVE', 'WON'))       AS CurrentHighestBid
FROM   HARVEST_BATCH hb
JOIN   CROP c          ON c.CropID     = hb.CropID
JOIN   CROP_CATEGORY cc ON cc.CategoryID = c.CategoryID
JOIN   FARM f          ON f.FarmID     = hb.FarmID
JOIN   FARMER fr       ON fr.FarmerID  = f.FarmerID
JOIN   USERS fu        ON fu.UserID    = fr.FarmerID
JOIN   VIRTUAL_ARAT va ON va.AratID    = hb.AratID;

CREATE OR REPLACE VIEW V_UNIT_UTILIZATION AS
SELECT w.WarehouseID,
       w.WarehouseName,
       w.District,
       w.Capacity                                          AS WarehouseCapacity,
       sm.ManagerID,
       mu.FirstName || ' ' || mu.LastName                   AS ManagerName,
       su.UnitNo,
       su.Capacity                                         AS UnitCapacity,
       su.Status                                           AS UnitStatus,
       NVL(ld.CurrentLoad, 0)                              AS CurrentLoad,
       su.Capacity - NVL(ld.CurrentLoad, 0)                AS FreeSpace,
       ROUND(NVL(ld.CurrentLoad, 0) / su.Capacity * 100, 1) AS UtilizationPct,
       CASE
         WHEN NVL(ld.CurrentLoad, 0) / su.Capacity > 0.90 THEN 'CRITICAL'
         WHEN NVL(ld.CurrentLoad, 0) / su.Capacity > 0.75 THEN 'HIGH'
         WHEN NVL(ld.CurrentLoad, 0) = 0                  THEN 'EMPTY'
         ELSE 'OK'
       END                                                 AS AlertLevel,
       NVL(ld.BatchesHeld, 0)                              AS BatchesHeld
FROM   WAREHOUSE w
JOIN   STORAGE_UNIT su    ON su.WarehouseID = w.WarehouseID
JOIN   STORAGE_MANAGER sm ON sm.ManagerID   = w.ManagerID
JOIN   USERS mu           ON mu.UserID      = sm.ManagerID
LEFT   JOIN (
         SELECT WarehouseID,
                UnitNo,
                SUM(QuantityStored)     AS CurrentLoad,
                COUNT(DISTINCT BatchID) AS BatchesHeld
         FROM   STORES
         WHERE  DateOut IS NULL
           AND  AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COUNTERED')
         GROUP  BY WarehouseID, UnitNo
       ) ld ON ld.WarehouseID = su.WarehouseID
           AND ld.UnitNo      = su.UnitNo;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

SET LINESIZE 150 PAGESIZE 40 FEEDBACK OFF

PROMPT
PROMPT === HARVEST_BATCH: every row has a MinimumBidQuantity? (must show 0) ===
SELECT COUNT(*) AS unresolved_rows FROM HARVEST_BATCH WHERE MinimumBidQuantity IS NULL;

PROMPT
PROMPT === STORES: every row has a ProposedBy? (must show 0) ===
SELECT COUNT(*) AS unresolved_rows FROM STORES WHERE ProposedBy IS NULL;

PROMPT
PROMPT === SALE_ORDER: DeliveryPreference distribution ===
SELECT DeliveryPreference, COUNT(*) FROM SALE_ORDER GROUP BY DeliveryPreference;

PROMPT
PROMPT === New objects valid? ===
SELECT object_name, object_type, status FROM user_objects
WHERE object_name IN ('NOTIFICATION','SEQ_NOTIFICATION_ID','TRG_NOTIFICATION_ID',
                       'TRG_BID_MIN_QTY','IX_NOTIFICATION_USER');

-- =====================================================================
-- End of 07_bid_storage_transport_notifications.sql
-- =====================================================================
