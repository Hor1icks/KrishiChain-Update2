-- =====================================================================
-- KrishiChain | 09_feedback_fixes.sql
--
-- Corrections raised at the Project Update-1 assessment.
-- Run as krishichain, after 08_plsql_layer.sql. F5 (Run Script).
--
-- A1  STORAGE_MANAGER gains real attributes of its own.
-- A4  STORAGE_PAYMENT is merged into PAYMENT behind a PaymentType
--     discriminator, with the subtype columns nullable.
-- A5  ON DELETE rules added to the foreign keys that need them.
--
-- Re-runnable: every step checks for its own prior application first.
-- =====================================================================

SET DEFINE OFF
SET SERVEROUTPUT ON


-- =====================================================================
-- A1 - STORAGE_MANAGER attributes
--
-- The subclass held only EmployeeID. A specialization needs enough of
-- its own attributes to justify a separate table; compare FARMER (4)
-- and BUYER (3).
-- =====================================================================

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns
   WHERE table_name = 'STORAGE_MANAGER' AND column_name = 'DESIGNATION';
  IF n = 0 THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE STORAGE_MANAGER ADD (
        Designation      VARCHAR2(50 CHAR),
        HireDate         DATE,
        ShiftSchedule    VARCHAR2(20 CHAR),
        CertificationNo  VARCHAR2(30 CHAR)
      )';
    DBMS_OUTPUT.PUT_LINE('A1: 4 columns added to STORAGE_MANAGER.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('A1: columns already present, skipped.');
  END IF;
END;
/

UPDATE STORAGE_MANAGER SET
  Designation     = CASE ManagerID
                      WHEN 16 THEN 'Chief Storage Officer'
                      WHEN 17 THEN 'Cold Chain Supervisor'
                      WHEN 18 THEN 'Warehouse Manager'
                      WHEN 19 THEN 'Warehouse Manager'
                      ELSE         'Assistant Storage Manager' END,
  HireDate        = TRUNC(SYSDATE) - (400 + (ManagerID - 16) * 190),
  ShiftSchedule   = CASE MOD(ManagerID, 3)
                      WHEN 0 THEN 'DAY'
                      WHEN 1 THEN 'NIGHT'
                      ELSE        'ROTATING' END,
  CertificationNo = 'BSTI-CS-' || (2400 + ManagerID)
WHERE Designation IS NULL;

COMMIT;

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_constraints
   WHERE constraint_name = 'CK_MANAGER_SHIFT';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE STORAGE_MANAGER MODIFY (Designation NOT NULL, HireDate NOT NULL)';
    EXECUTE IMMEDIATE 'ALTER TABLE STORAGE_MANAGER ADD CONSTRAINT CK_MANAGER_SHIFT
                       CHECK (ShiftSchedule IN (''DAY'',''NIGHT'',''ROTATING''))';
    EXECUTE IMMEDIATE 'ALTER TABLE STORAGE_MANAGER ADD CONSTRAINT UQ_MANAGER_CERT
                       UNIQUE (CertificationNo)';
    DBMS_OUTPUT.PUT_LINE('A1: constraints added.');
  END IF;
END;
/


-- =====================================================================
-- A4 - merge STORAGE_PAYMENT into PAYMENT
--
-- One PAYMENT table with a PaymentType discriminator. The subtype
-- columns are nullable and CK_PAYMENT_TYPE_SHAPE enforces that exactly
-- the right ones are populated for each type:
--
--   SALE     SaleOrderID + BuyerID + FarmerID set, AllocationID null
--   STORAGE  AllocationID set, the other three null
--
-- PAYMENT.AllocationID still references the STORES allocation as a
-- whole, so the aggregation construct is unchanged.
-- =====================================================================

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tab_columns
   WHERE table_name = 'PAYMENT' AND column_name = 'PAYMENTTYPE';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE PAYMENT ADD (
                         PaymentType   VARCHAR2(10 CHAR) DEFAULT ''SALE'' NOT NULL,
                         AllocationID  NUMBER(10)
                       )';
    EXECUTE IMMEDIATE 'ALTER TABLE PAYMENT MODIFY (SaleOrderID NULL, BuyerID NULL, FarmerID NULL)';
    DBMS_OUTPUT.PUT_LINE('A4: PaymentType + AllocationID added, subtype columns now nullable.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('A4: PAYMENT already migrated, skipped.');
  END IF;
END;
/


-- ---------------------------------------------------------------------
-- The business-rule trigger must skip STORAGE rows BEFORE any are
-- inserted. BR-19 and BR-20 are both about a SALE_ORDER, and a storage
-- payment has no SaleOrderID: left unchanged, the BEFORE EACH ROW
-- lookup would raise NO_DATA_FOUND on the first migrated row.
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- Migrate the STORAGE_PAYMENT rows, then retire the table.
-- PaymentID is left to trg_payment_id / seq_payment_id.
-- ---------------------------------------------------------------------

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_tables WHERE table_name = 'STORAGE_PAYMENT';
  IF n = 1 THEN
    -- EXECUTE IMMEDIATE, not a static INSERT: PL/SQL is compiled before it
    -- is run, so a static reference to STORAGE_PAYMENT would fail to
    -- compile on a re-run after the table has been dropped, even though
    -- the IF above would have skipped it.
    EXECUTE IMMEDIATE '
      INSERT INTO PAYMENT (PaymentType, AllocationID, Amount, PaymentMethod,
                           PaymentDate, TransactionReference, PaymentStatus)
      SELECT ''STORAGE'', AllocationID, Amount, PaymentMethod,
             PaymentDate, TransactionReference, PaymentStatus
        FROM STORAGE_PAYMENT';
    DBMS_OUTPUT.PUT_LINE('A4: ' || SQL%ROWCOUNT || ' storage payments migrated.');
    COMMIT;

    EXECUTE IMMEDIATE 'DROP TABLE STORAGE_PAYMENT CASCADE CONSTRAINTS PURGE';
    DBMS_OUTPUT.PUT_LINE('A4: STORAGE_PAYMENT dropped.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('A4: STORAGE_PAYMENT already merged, skipped.');
  END IF;
END;
/

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_sequences WHERE sequence_name = 'SEQ_STORAGE_PAYMENT_ID';
  IF n = 1 THEN
    EXECUTE IMMEDIATE 'DROP SEQUENCE seq_storage_payment_id';
  END IF;
END;
/

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name = 'CK_PAYMENT_TYPE_SHAPE';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE PAYMENT ADD CONSTRAINT CK_PAYMENT_TYPE
                       CHECK (PaymentType IN (''SALE'',''STORAGE''))';
    EXECUTE IMMEDIATE 'ALTER TABLE PAYMENT ADD CONSTRAINT FK_PAYMENT_ALLOCATION
                       FOREIGN KEY (AllocationID) REFERENCES STORES (AllocationID)
                       ON DELETE CASCADE';
    EXECUTE IMMEDIATE 'ALTER TABLE PAYMENT ADD CONSTRAINT CK_PAYMENT_TYPE_SHAPE CHECK (
                         (PaymentType = ''SALE''
                            AND SaleOrderID  IS NOT NULL
                            AND BuyerID      IS NOT NULL
                            AND FarmerID     IS NOT NULL
                            AND AllocationID IS NULL)
                         OR
                         (PaymentType = ''STORAGE''
                            AND AllocationID IS NOT NULL
                            AND SaleOrderID  IS NULL
                            AND BuyerID      IS NULL
                            AND FarmerID     IS NULL))';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_PAYMENT_ALLOCATION ON PAYMENT (AllocationID)';
    EXECUTE IMMEDIATE 'CREATE INDEX IX_PAYMENT_TYPE ON PAYMENT (PaymentType)';
    DBMS_OUTPUT.PUT_LINE('A4: type, shape and FK constraints added.');
  END IF;
END;
/


-- =====================================================================
-- A5 - ON DELETE rules
--
-- Only 3 of 41 foreign keys carried one. The choice is per relationship,
-- not blanket:
--
--   CASCADE   the child is meaningless without its parent, so it goes
--             with it (a bid without its batch, a subclass row without
--             its USERS row, a payment without its sale order).
--   SET NULL  the child outlives the parent and simply loses the link.
--             Used for the two self-references.
--   no rule   reference data and accountability links. Deleting a crop
--             that has sales history, or a farmer who has been paid,
--             SHOULD fail rather than silently erase the record.
--
-- Oracle cannot alter a constraint's delete rule in place, so each one
-- is dropped and recreated.
-- =====================================================================

DECLARE
  v_done PLS_INTEGER := 0;

  -- Drops and recreates one foreign key with the wanted delete rule.
  -- Oracle cannot alter a delete rule in place. Skips the work when the
  -- rule is already correct, so the script is re-runnable.
  PROCEDURE set_rule (p_cname  VARCHAR2, p_table VARCHAR2, p_col   VARCHAR2,
                      p_rtable VARCHAR2, p_rcol  VARCHAR2, p_rule  VARCHAR2) IS
    v_rule user_constraints.delete_rule%TYPE;
  BEGIN
    BEGIN
      SELECT delete_rule INTO v_rule
        FROM user_constraints WHERE constraint_name = p_cname;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN v_rule := NULL;
    END;

    IF v_rule IS NOT NULL AND v_rule = p_rule THEN
      RETURN;
    END IF;

    IF v_rule IS NOT NULL THEN
      EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' DROP CONSTRAINT ' || p_cname;
    END IF;

    EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table ||
                      ' ADD CONSTRAINT ' || p_cname ||
                      ' FOREIGN KEY (' || p_col || ')' ||
                      ' REFERENCES ' || p_rtable || ' (' || p_rcol || ')' ||
                      ' ON DELETE ' || p_rule;
    v_done := v_done + 1;
  END set_rule;

BEGIN
  -- The total specialization: a subclass row cannot outlive its user.
  set_rule('FK_FARMER_USERS',     'FARMER',              'FarmerID',     'USERS', 'UserID', 'CASCADE');
  set_rule('FK_BUYER_USERS',      'BUYER',               'BuyerID',      'USERS', 'UserID', 'CASCADE');
  set_rule('FK_ADMIN_USERS',      'ADMIN_STAFF',         'AdminID',      'USERS', 'UserID', 'CASCADE');
  set_rule('FK_MANAGER_USERS',    'STORAGE_MANAGER',     'ManagerID',    'USERS', 'UserID', 'CASCADE');
  set_rule('FK_PERSONNEL_USERS',  'TRANSPORT_PERSONNEL', 'PersonnelID',  'USERS', 'UserID', 'CASCADE');

  -- Ownership chains: farm -> batch -> bid -> order -> payment/transport.
  set_rule('FK_FARM_FARMER',        'FARM',              'FarmerID',    'FARMER',            'FarmerID',    'CASCADE');
  set_rule('FK_BATCH_FARM',         'HARVEST_BATCH',     'FarmID',      'FARM',              'FarmID',      'CASCADE');
  set_rule('FK_BID_BATCH',          'BID',               'BatchID',     'HARVEST_BATCH',     'BatchID',     'CASCADE');
  set_rule('FK_STORES_BATCH',       'STORES',            'BatchID',     'HARVEST_BATCH',     'BatchID',     'CASCADE');
  set_rule('FK_ORDER_BID',          'SALE_ORDER',        'BidID',       'BID',               'BidID',       'CASCADE');
  set_rule('FK_PAYMENT_ORDER',      'PAYMENT',           'SaleOrderID', 'SALE_ORDER',        'SaleOrderID', 'CASCADE');
  set_rule('FK_TRANSPORT_ORDER',    'TRANSPORT_REQUEST', 'SaleOrderID', 'SALE_ORDER',        'SaleOrderID', 'CASCADE');
  set_rule('FK_ASSIGNED_TRANSPORT', 'ASSIGNED_TO',       'TransportID', 'TRANSPORT_REQUEST', 'TransportID', 'CASCADE');
  set_rule('FK_REVIEW_ORDER',       'REVIEW',            'SaleOrderID', 'SALE_ORDER',        'SaleOrderID', 'CASCADE');
  set_rule('FK_COMPLAINT_ORDER',    'COMPLAINT',         'SaleOrderID', 'SALE_ORDER',        'SaleOrderID', 'CASCADE');
  set_rule('FK_NOTIFICATION_USER',  'NOTIFICATION',      'UserID',      'USERS',             'UserID',      'CASCADE');

  -- The two recursive relationships: the row survives, the link clears.
  set_rule('FK_ARAT_PARENT',  'VIRTUAL_ARAT', 'ParentAratID',  'VIRTUAL_ARAT', 'AratID', 'SET NULL');
  set_rule('FK_BID_PREVIOUS', 'BID',          'PreviousBidID', 'BID',          'BidID',  'SET NULL');

  -- A complaint outlives the admin who handled it.
  set_rule('FK_COMPLAINT_ADMIN', 'COMPLAINT', 'HandledByAdminID', 'ADMIN_STAFF', 'AdminID', 'SET NULL');

  DBMS_OUTPUT.PUT_LINE('A5: ' || v_done || ' foreign keys given an ON DELETE rule.');
END;
/


-- =====================================================================
-- VERIFICATION
-- =====================================================================

PROMPT
PROMPT ============ A1: STORAGE_MANAGER now has real attributes ============
SELECT ManagerID, EmployeeID, Designation, ShiftSchedule, CertificationNo
FROM   STORAGE_MANAGER ORDER BY ManagerID;

PROMPT
PROMPT ============ A4: one PAYMENT table, two subtypes ============
SELECT PaymentType, COUNT(*) AS rows_held,
       SUM(CASE WHEN SaleOrderID  IS NOT NULL THEN 1 ELSE 0 END) AS with_order,
       SUM(CASE WHEN AllocationID IS NOT NULL THEN 1 ELSE 0 END) AS with_allocation
FROM   PAYMENT GROUP BY PaymentType ORDER BY PaymentType;

PROMPT
PROMPT ============ A5: delete rules now in force ============
SELECT delete_rule, COUNT(*) AS foreign_keys
FROM   user_constraints WHERE constraint_type = 'R'
GROUP  BY delete_rule ORDER BY delete_rule;

PROMPT
PROMPT ============ STORAGE_PAYMENT is gone ============
SELECT COUNT(*) AS storage_payment_tables
FROM   user_tables WHERE table_name = 'STORAGE_PAYMENT';
