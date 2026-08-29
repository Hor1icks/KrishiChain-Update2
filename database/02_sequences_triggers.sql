-- =====================================================================
-- KrishiChain | 02_sequences_triggers.sql
-- Phase 2, Day 2 — companion to 01_create_tables.sql.
--
-- PART A: one sequence + BEFORE INSERT trigger pair per surrogate-key
--         table (11g has no IDENTITY columns — PRD 9.9), plus the
--         per-warehouse numbering trigger for the STORAGE_UNIT weak
--         entity's partial key.
-- PART B: business-rule triggers that need a value from another table
--         and so cannot be expressed as a single-table CHECK constraint.
--         Kept intentionally minimal — most cross-table business rules
--         (BR-04, BR-07, BR-09, BR-11..15, BR-18, BR-25) are enforced in
--         the Phase 4 service layer inside the atomic transactions of
--         PRD 9.10, where the acting user's identity and role are known.
--         The two rules below (BR-19, BR-20) are pure data-integrity
--         checks with no "current user" dependency, and BR-20 is the
--         rule this phase changed from a blanket rule to a conditional
--         one — see context.md.
--
-- Subclass tables (FARMER, BUYER, ADMIN_STAFF, STORAGE_MANAGER,
-- TRANSPORT_PERSONNEL) get NO sequence here. Their PK is the same value
-- as the USERS row's UserID, assigned by the registration transaction:
--   INSERT INTO USERS (...) VALUES (...);
--   -- then, in the same transaction:
--   INSERT INTO FARMER (FarmerID, ...) VALUES (seq_user_id.CURRVAL, ...);
-- =====================================================================

-- =====================================================================
-- PART A — ID GENERATION
-- =====================================================================

CREATE SEQUENCE seq_user_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_user_id
BEFORE INSERT ON USERS
FOR EACH ROW
WHEN (NEW.UserID IS NULL)
BEGIN
  SELECT seq_user_id.NEXTVAL INTO :NEW.UserID FROM dual;
END;
/

CREATE SEQUENCE seq_crop_category_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_crop_category_id
BEFORE INSERT ON CROP_CATEGORY
FOR EACH ROW
WHEN (NEW.CategoryID IS NULL)
BEGIN
  SELECT seq_crop_category_id.NEXTVAL INTO :NEW.CategoryID FROM dual;
END;
/

CREATE SEQUENCE seq_crop_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_crop_id
BEFORE INSERT ON CROP
FOR EACH ROW
WHEN (NEW.CropID IS NULL)
BEGIN
  SELECT seq_crop_id.NEXTVAL INTO :NEW.CropID FROM dual;
END;
/

CREATE SEQUENCE seq_farm_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_farm_id
BEFORE INSERT ON FARM
FOR EACH ROW
WHEN (NEW.FarmID IS NULL)
BEGIN
  SELECT seq_farm_id.NEXTVAL INTO :NEW.FarmID FROM dual;
END;
/

CREATE SEQUENCE seq_arat_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_arat_id
BEFORE INSERT ON VIRTUAL_ARAT
FOR EACH ROW
WHEN (NEW.AratID IS NULL)
BEGIN
  SELECT seq_arat_id.NEXTVAL INTO :NEW.AratID FROM dual;
END;
/

CREATE SEQUENCE seq_batch_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_batch_id
BEFORE INSERT ON HARVEST_BATCH
FOR EACH ROW
WHEN (NEW.BatchID IS NULL)
BEGIN
  SELECT seq_batch_id.NEXTVAL INTO :NEW.BatchID FROM dual;
END;
/

CREATE SEQUENCE seq_warehouse_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_warehouse_id
BEFORE INSERT ON WAREHOUSE
FOR EACH ROW
WHEN (NEW.WarehouseID IS NULL)
BEGIN
  SELECT seq_warehouse_id.NEXTVAL INTO :NEW.WarehouseID FROM dual;
END;
/

-- STORAGE_UNIT: weak entity partial key. UnitNo restarts at 1 for every
-- warehouse, so it CANNOT be a global sequence — it is the next integer
-- within this WarehouseID's existing units.
CREATE OR REPLACE TRIGGER trg_storage_unit_no
BEFORE INSERT ON STORAGE_UNIT
FOR EACH ROW
WHEN (NEW.UnitNo IS NULL)
DECLARE
  v_next_unit_no STORAGE_UNIT.UnitNo%TYPE;
BEGIN
  SELECT NVL(MAX(UnitNo), 0) + 1
    INTO v_next_unit_no
    FROM STORAGE_UNIT
   WHERE WarehouseID = :NEW.WarehouseID;

  :NEW.UnitNo := v_next_unit_no;
END;
/

CREATE SEQUENCE seq_allocation_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_allocation_id
BEFORE INSERT ON STORES
FOR EACH ROW
WHEN (NEW.AllocationID IS NULL)
BEGIN
  SELECT seq_allocation_id.NEXTVAL INTO :NEW.AllocationID FROM dual;
END;
/

CREATE SEQUENCE seq_bid_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_bid_id
BEFORE INSERT ON BID
FOR EACH ROW
WHEN (NEW.BidID IS NULL)
BEGIN
  SELECT seq_bid_id.NEXTVAL INTO :NEW.BidID FROM dual;
END;
/

CREATE SEQUENCE seq_sale_order_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_sale_order_id
BEFORE INSERT ON SALE_ORDER
FOR EACH ROW
WHEN (NEW.SaleOrderID IS NULL)
BEGIN
  SELECT seq_sale_order_id.NEXTVAL INTO :NEW.SaleOrderID FROM dual;
END;
/

CREATE SEQUENCE seq_payment_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_payment_id
BEFORE INSERT ON PAYMENT
FOR EACH ROW
WHEN (NEW.PaymentID IS NULL)
BEGIN
  SELECT seq_payment_id.NEXTVAL INTO :NEW.PaymentID FROM dual;
END;
/

CREATE SEQUENCE seq_vehicle_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_vehicle_id
BEFORE INSERT ON VEHICLE
FOR EACH ROW
WHEN (NEW.VehicleID IS NULL)
BEGIN
  SELECT seq_vehicle_id.NEXTVAL INTO :NEW.VehicleID FROM dual;
END;
/

CREATE SEQUENCE seq_transport_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_transport_id
BEFORE INSERT ON TRANSPORT_REQUEST
FOR EACH ROW
WHEN (NEW.TransportID IS NULL)
BEGIN
  SELECT seq_transport_id.NEXTVAL INTO :NEW.TransportID FROM dual;
END;
/

CREATE SEQUENCE seq_assignment_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_assignment_id
BEFORE INSERT ON ASSIGNED_TO
FOR EACH ROW
WHEN (NEW.AssignmentID IS NULL)
BEGIN
  SELECT seq_assignment_id.NEXTVAL INTO :NEW.AssignmentID FROM dual;
END;
/

CREATE SEQUENCE seq_bazar_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_bazar_id
BEFORE INSERT ON PHYSICAL_BAZAR
FOR EACH ROW
WHEN (NEW.BazarID IS NULL)
BEGIN
  SELECT seq_bazar_id.NEXTVAL INTO :NEW.BazarID FROM dual;
END;
/

CREATE SEQUENCE seq_review_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_review_id
BEFORE INSERT ON REVIEW
FOR EACH ROW
WHEN (NEW.ReviewID IS NULL)
BEGIN
  SELECT seq_review_id.NEXTVAL INTO :NEW.ReviewID FROM dual;
END;
/

CREATE SEQUENCE seq_complaint_id START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE OR REPLACE TRIGGER trg_complaint_id
BEFORE INSERT ON COMPLAINT
FOR EACH ROW
WHEN (NEW.ComplaintID IS NULL)
BEGIN
  SELECT seq_complaint_id.NEXTVAL INTO :NEW.ComplaintID FROM dual;
END;
/

-- Added with the feedback-batch migration, alongside NOTIFICATION in
-- 01_create_tables.sql Section 8.
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
-- PART B — BUSINESS-RULE TRIGGERS (BR-19, BR-20 revised; minimum bid qty)
-- =====================================================================

-- Added with the feedback-batch migration. RequestedQuantity vs the
-- batch's MinimumBidQuantity is a cross-table comparison (BID vs
-- HARVEST_BATCH), so unlike CK_BATCH_MINBIDQTY (same-table, a plain
-- CHECK) this needs a trigger. Plain BEFORE INSERT, not compound: unlike
-- trg_payment_biz_rules (which must be compound because it sums its OWN
-- table, PAYMENT, and a row-level trigger cannot query the table it is
-- firing on -- ORA-04091), this trigger only reads HARVEST_BATCH, a
-- different table, so there is no mutating-table problem.
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

-- Implemented as a COMPOUND trigger, not a plain BEFORE EACH ROW one.
-- BR-19 has to sum the PAYMENT rows already recorded against this sale
-- order, and a row-level trigger on PAYMENT cannot query PAYMENT --
-- Oracle raises ORA-04091 (table is mutating). So the work is split:
--   BEFORE EACH ROW   -> BR-20, which only reads SALE_ORDER and
--                        TRANSPORT_REQUEST (no mutating table), and
--                        records the SaleOrderIDs this statement touched
--   AFTER STATEMENT   -> BR-19, once PAYMENT is settled and readable
-- Compound triggers are 11gR1+, so this is safe on XE 11.2.
CREATE OR REPLACE TRIGGER trg_payment_biz_rules
FOR INSERT ON PAYMENT
COMPOUND TRIGGER

  TYPE t_order_ids IS TABLE OF PAYMENT.SaleOrderID%TYPE INDEX BY PLS_INTEGER;
  g_orders t_order_ids;

  -- BR-20: SALE_ORDER.PaymentTerms decides when payment is allowed.
  --   'ADVANCE'     -> allowed as soon as the order exists
  --   'ON_DELIVERY' -> allowed only once transport is DELIVERED
  -- Storage payments are settled against an allocation, not an order,
  -- so neither rule applies to them.
  BEFORE EACH ROW IS
    v_terms            SALE_ORDER.PaymentTerms%TYPE;
    v_delivery_status  TRANSPORT_REQUEST.DeliveryStatus%TYPE;
  BEGIN
    -- A bare RETURN is illegal inside a compound trigger (PLS-00678),
    -- so the SALE-only logic is guarded by an IF instead.
    IF :NEW.PaymentType = 'SALE' THEN

      SELECT PaymentTerms
        INTO v_terms
        FROM SALE_ORDER
       WHERE SaleOrderID = :NEW.SaleOrderID;

      IF v_terms = 'ON_DELIVERY' THEN
        BEGIN
          SELECT DeliveryStatus
            INTO v_delivery_status
            FROM TRANSPORT_REQUEST
           WHERE SaleOrderID = :NEW.SaleOrderID;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20002,
              'BR-20 violation: payment terms are ON_DELIVERY but no transport request exists yet.');
        END;

        IF v_delivery_status <> 'DELIVERED' THEN
          RAISE_APPLICATION_ERROR(-20002,
            'BR-20 violation: payment terms are ON_DELIVERY and delivery is not yet complete.');
        END IF;
      END IF;

      g_orders(g_orders.COUNT + 1) := :NEW.SaleOrderID;
    END IF;
  END BEFORE EACH ROW;

  -- BR-19: payments recorded against a sale order may never exceed its
  -- TotalAmount. PENDING and COMPLETED count; FAILED and REFUNDED do
  -- not consume the balance. Only SALE rows reach g_orders.
  AFTER STATEMENT IS
    v_total_amount  NUMBER;
    v_paid_so_far   NUMBER;
  BEGIN
    FOR i IN 1 .. g_orders.COUNT LOOP
      SELECT AcceptedQuantity * AcceptedPricePerKg
        INTO v_total_amount
        FROM SALE_ORDER
       WHERE SaleOrderID = g_orders(i);

      SELECT NVL(SUM(Amount), 0)
        INTO v_paid_so_far
        FROM PAYMENT
       WHERE SaleOrderID = g_orders(i)
         AND PaymentType = 'SALE'
         AND PaymentStatus IN ('PENDING', 'COMPLETED');

      IF v_paid_so_far > v_total_amount THEN
        RAISE_APPLICATION_ERROR(-20001,
          'BR-19 violation: payments against sale order ' || g_orders(i) ||
          ' total ' || v_paid_so_far || ' which exceeds the order total ' || v_total_amount || '.');
      END IF;
    END LOOP;

    g_orders.DELETE;
  END AFTER STATEMENT;

END trg_payment_biz_rules;
/

-- =====================================================================
-- End of 02_sequences_triggers.sql
-- Next: 03_insert_data.sql (Phase 3) — 5 narratively consistent rows
-- per table, in the FK-safe order given in PRD 14, with root ARATs and
-- earliest bids inserted NULL-parent then UPDATEd (self-referencing FKs).
-- =====================================================================


CREATE OR REPLACE TRIGGER trg_assigned_one_personnel
BEFORE INSERT OR UPDATE ON ASSIGNED_TO
FOR EACH ROW
DECLARE
  v_holder ASSIGNED_TO.PersonnelID%TYPE;
BEGIN
  SELECT MIN(PersonnelID) INTO v_holder
    FROM ASSIGNED_TO
   WHERE TransportID = :NEW.TransportID
     AND (:NEW.AssignmentID IS NULL OR AssignmentID <> :NEW.AssignmentID);

  IF v_holder IS NOT NULL AND v_holder <> :NEW.PersonnelID THEN
    RAISE_APPLICATION_ERROR(-20004,
      'Transport request ' || :NEW.TransportID ||
      ' already belongs to another transport person. One request, one person.');
  END IF;
END;
/

