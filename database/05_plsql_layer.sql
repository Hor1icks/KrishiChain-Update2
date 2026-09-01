-- =====================================================================
-- KrishiChain | 08_plsql_layer.sql
-- Stored procedures, functions and packages — the PL/SQL layer promised
-- in the project proposal (§4, "SQL and PL/SQL").
--
-- Run as the `krishichain` user, after 04_views.sql.
-- Safe to re-run: every object is CREATE OR REPLACE.
-- In SQL Developer use F5 (Run Script), not Ctrl+Enter — this file is
-- almost entirely PL/SQL blocks terminated with `/`.
--
-- ---------------------------------------------------------------------
-- WHAT IS IN HERE, AND WHAT IS DELIBERATELY NOT
-- ---------------------------------------------------------------------
-- The six PRD §9.10 atomic transactions (Registration, Storage
-- Allocation, Place Bid, Award Winning Bid, Assign Transport, Delivery +
-- Payment) are NOT reimplemented as stored procedures, on purpose.
--
-- They live in the Express service layer because each one needs the
-- authenticated user's identity and role to decide what is allowed —
-- something the database has no concept of — and each has been verified
-- by fault injection in that form (see context.md). Re-expressing them
-- here would create two sources of truth for the same business rules,
-- which context.md's "which layer enforces which rule" table explicitly
-- rules out. A rule enforced in two places is a rule that will diverge.
--
-- So this layer holds the three kinds of logic that genuinely belong in
-- the database and exist nowhere else:
--
--   1. pkg_krishi_metrics  — derived scalar values. Pure reads. Several
--      of these are asked for repeatedly across the app; computing them
--      once, next to the data, beats restating the arithmetic in every
--      caller. Where a view already owns a derivation, the function
--      reads THAT VIEW rather than re-deriving it, so the view stays the
--      single source of truth.
--
--   2. pkg_krishi_reports  — the six report types from the proposal's
--      Reporting Module. Set-returning, read-only, and naturally
--      server-side: each is one large query whose shape belongs with the
--      schema, not in JavaScript. Returned as SYS_REFCURSOR so the API
--      (or SQL Developer, or the viva) can consume them directly.
--
--   3. prc_expire_stale_batches — housekeeping DML that nothing else in
--      the system does. An auction whose window closed without a single
--      bid currently sits at BIDDING_OPEN forever; this retires it.
--
-- Oracle 11g notes: no FETCH FIRST (ROWNUM inside an inline view
-- instead), and SYS_REFCURSOR rather than a strongly-typed cursor so one
-- signature can carry differently-shaped report rows.
-- =====================================================================

SET SERVEROUTPUT ON
SET SQLBLANKLINES ON

PROMPT
PROMPT ============================================================
PROMPT  1. pkg_krishi_metrics — derived value functions
PROMPT ============================================================

CREATE OR REPLACE PACKAGE pkg_krishi_metrics AS
  -- Money still owed on a sale order: its total, less every payment that
  -- counts against the balance. Mirrors BR-19's own definition of "paid"
  -- (PENDING and COMPLETED count; FAILED and REFUNDED do not), so a
  -- refund correctly puts money back on the bill.
  FUNCTION fn_order_outstanding (p_sale_order_id IN SALE_ORDER.SaleOrderID%TYPE)
    RETURN NUMBER;

  -- Free space in one storage unit, read from V_UNIT_UTILIZATION so the
  -- view remains the single definition of "current load".
  FUNCTION fn_unit_free_space (p_warehouse_id IN WAREHOUSE.WarehouseID%TYPE,
                               p_unit_no      IN STORAGE_UNIT.UnitNo%TYPE)
    RETURN NUMBER;

  -- Quantity of a batch that is neither sold nor already committed to a
  -- leg-1 storage allocation — i.e. what a farmer could still store.
  FUNCTION fn_batch_unstored (p_batch_id IN HARVEST_BATCH.BatchID%TYPE)
    RETURN NUMBER;

  -- Whole days an allocation has been (or was) in storage.
  FUNCTION fn_storage_days (p_allocation_id IN STORES.AllocationID%TYPE)
    RETURN NUMBER;

  -- Lifetime revenue actually received by a farmer.
  FUNCTION fn_farmer_revenue (p_farmer_id IN FARMER.FarmerID%TYPE)
    RETURN NUMBER;
END pkg_krishi_metrics;
/

CREATE OR REPLACE PACKAGE BODY pkg_krishi_metrics AS

  FUNCTION fn_order_outstanding (p_sale_order_id IN SALE_ORDER.SaleOrderID%TYPE)
    RETURN NUMBER
  IS
    v_total NUMBER;
    v_paid  NUMBER;
  BEGIN
    SELECT TotalAmount INTO v_total
      FROM SALE_ORDER
     WHERE SaleOrderID = p_sale_order_id;

    SELECT NVL(SUM(Amount), 0) INTO v_paid
      FROM PAYMENT
     WHERE SaleOrderID = p_sale_order_id
       AND PaymentStatus IN ('PENDING', 'COMPLETED');

    RETURN v_total - v_paid;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20101,
        'fn_order_outstanding: no sale order ' || p_sale_order_id || '.');
  END fn_order_outstanding;

  FUNCTION fn_unit_free_space (p_warehouse_id IN WAREHOUSE.WarehouseID%TYPE,
                               p_unit_no      IN STORAGE_UNIT.UnitNo%TYPE)
    RETURN NUMBER
  IS
    v_free NUMBER;
  BEGIN
    SELECT FreeSpace INTO v_free
      FROM V_UNIT_UTILIZATION
     WHERE WarehouseID = p_warehouse_id
       AND UnitNo      = p_unit_no;
    RETURN v_free;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20102,
        'fn_unit_free_space: no unit ' || p_unit_no ||
        ' in warehouse ' || p_warehouse_id || '.');
  END fn_unit_free_space;

  FUNCTION fn_batch_unstored (p_batch_id IN HARVEST_BATCH.BatchID%TYPE)
    RETURN NUMBER
  IS
    v_total  HARVEST_BATCH.TotalQuantity%TYPE;
    v_sold   HARVEST_BATCH.SoldQuantity%TYPE;
    v_stored NUMBER;
  BEGIN
    SELECT TotalQuantity, SoldQuantity INTO v_total, v_sold
      FROM HARVEST_BATCH
     WHERE BatchID = p_batch_id;

    -- Leg 1 only (SaleOrderID IS NULL): sold produce is leg 2's concern.
    -- COUNTERED counts as committed — the space is reserved while a
    -- negotiation is open, exactly as unitLoad() treats it.
    SELECT NVL(SUM(QuantityStored), 0) INTO v_stored
      FROM STORES
     WHERE BatchID = p_batch_id
       AND SaleOrderID IS NULL
       AND DateOut IS NULL
       AND AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COUNTERED');

    RETURN v_total - v_sold - v_stored;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20103,
        'fn_batch_unstored: no batch ' || p_batch_id || '.');
  END fn_batch_unstored;

  FUNCTION fn_storage_days (p_allocation_id IN STORES.AllocationID%TYPE)
    RETURN NUMBER
  IS
    v_row STORES%ROWTYPE;
  BEGIN
    SELECT * INTO v_row FROM STORES WHERE AllocationID = p_allocation_id;

    -- Never accepted, so it was never in storage at all.
    IF v_row.DateIn IS NULL THEN
      RETURN 0;
    END IF;

    -- Still in: count up to today. Released: count to the day it left.
    RETURN TRUNC(NVL(v_row.DateOut, SYSDATE)) - TRUNC(v_row.DateIn);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20104,
        'fn_storage_days: no allocation ' || p_allocation_id || '.');
  END fn_storage_days;

  FUNCTION fn_farmer_revenue (p_farmer_id IN FARMER.FarmerID%TYPE)
    RETURN NUMBER
  IS
    v_received NUMBER;
  BEGIN
    SELECT NVL(SUM(Amount), 0) INTO v_received
      FROM PAYMENT
     WHERE FarmerID = p_farmer_id
       AND PaymentStatus = 'COMPLETED';
    RETURN v_received;
  END fn_farmer_revenue;

END pkg_krishi_metrics;
/

PROMPT
PROMPT ============================================================
PROMPT  2. pkg_krishi_reports — the proposal's Reporting Module
PROMPT ============================================================

CREATE OR REPLACE PACKAGE pkg_krishi_reports AS
  -- Every report hands back a SYS_REFCURSOR. A weak ref cursor is the
  -- right choice here precisely because the six row shapes differ — one
  -- signature, six result sets, and the caller (Express, SQL Developer,
  -- or the viva) just fetches.
  --
  -- NULL for an optional filter means "no filter", so every report can
  -- be run wide-open with no arguments to fill in.

  PROCEDURE harvest_report      (p_from    IN DATE     DEFAULT NULL,
                                 p_to      IN DATE     DEFAULT NULL,
                                 p_cursor  OUT SYS_REFCURSOR);

  PROCEDURE storage_report      (p_warehouse_id IN WAREHOUSE.WarehouseID%TYPE DEFAULT NULL,
                                 p_cursor  OUT SYS_REFCURSOR);

  PROCEDURE sales_report        (p_from    IN DATE     DEFAULT NULL,
                                 p_to      IN DATE     DEFAULT NULL,
                                 p_cursor  OUT SYS_REFCURSOR);

  PROCEDURE payment_report      (p_from    IN DATE     DEFAULT NULL,
                                 p_to      IN DATE     DEFAULT NULL,
                                 p_cursor  OUT SYS_REFCURSOR);

  PROCEDURE market_price_report (p_crop_id IN CROP.CropID%TYPE DEFAULT NULL,
                                 p_days    IN NUMBER   DEFAULT 30,
                                 p_cursor  OUT SYS_REFCURSOR);

  PROCEDURE user_activity_report(p_user_id IN USERS.UserID%TYPE DEFAULT NULL,
                                 p_limit   IN NUMBER   DEFAULT 100,
                                 p_cursor  OUT SYS_REFCURSOR);
END pkg_krishi_reports;
/

CREATE OR REPLACE PACKAGE BODY pkg_krishi_reports AS

  -- -------------------------------------------------------------------
  -- HARVEST REPORT — what was grown, by whom, and how much of it moved.
  -- -------------------------------------------------------------------
  PROCEDURE harvest_report (p_from   IN DATE DEFAULT NULL,
                            p_to     IN DATE DEFAULT NULL,
                            p_cursor OUT SYS_REFCURSOR)
  IS
  BEGIN
    OPEN p_cursor FOR
      SELECT hb.BatchID,
             c.CropName,
             cc.CategoryName,
             u.FirstName || ' ' || u.LastName AS FarmerName,
             f.FarmName,
             f.District,
             va.AratName,
             hb.HarvestDate,
             hb.QualityGrade,
             hb.TotalQuantity,
             hb.SoldQuantity,
             hb.AvailableQuantity,
             hb.MinimumPrice,
             hb.Status,
             -- Same derivation the storage module uses, borrowed rather
             -- than restated.
             pkg_krishi_metrics.fn_batch_unstored(hb.BatchID) AS UnstoredQuantity,
             ROUND(hb.SoldQuantity / hb.TotalQuantity * 100, 1) AS PctSold
        FROM HARVEST_BATCH hb
        JOIN CROP c           ON c.CropID     = hb.CropID
        JOIN CROP_CATEGORY cc ON cc.CategoryID = c.CategoryID
        JOIN FARM f           ON f.FarmID     = hb.FarmID
        JOIN USERS u          ON u.UserID     = f.FarmerID
        JOIN VIRTUAL_ARAT va  ON va.AratID    = hb.AratID
       WHERE (p_from IS NULL OR hb.HarvestDate >= p_from)
         AND (p_to   IS NULL OR hb.HarvestDate <= p_to)
       ORDER BY hb.HarvestDate DESC, hb.BatchID;
  END harvest_report;

  -- -------------------------------------------------------------------
  -- STORAGE REPORT — who is holding what, on what terms, and paid up?
  -- -------------------------------------------------------------------
  PROCEDURE storage_report (p_warehouse_id IN WAREHOUSE.WarehouseID%TYPE DEFAULT NULL,
                            p_cursor       OUT SYS_REFCURSOR)
  IS
  BEGIN
    OPEN p_cursor FOR
      SELECT s.AllocationID,
             w.WarehouseID,
             w.WarehouseName,
             w.District,
             mu.FirstName || ' ' || mu.LastName AS ManagerName,
             s.UnitNo,
             s.BatchID,
             c.CropName,
             cu.FirstName || ' ' || cu.LastName AS CustomerName,
             CASE WHEN s.RequestedByFarmerID IS NOT NULL THEN 'FARMER' ELSE 'BUYER' END AS CustomerType,
             s.ProposedBy,
             s.QuantityStored,
             s.DateIn,
             s.DateOut,
             s.MinimumStorageDays,
             s.MinimumReleaseDate,
             s.AllocationStatus,
             s.StorageFeePerKgSnapshot AS RatePerKg,
             s.StorageFee,
             NVL(sp.Paid, 0)                    AS FeePaid,
             s.StorageFee - NVL(sp.Paid, 0)     AS FeeOutstanding,
             pkg_krishi_metrics.fn_storage_days(s.AllocationID) AS DaysHeld
        FROM STORES s
        JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
        JOIN USERS mu         ON mu.UserID     = w.ManagerID
        JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
        JOIN CROP c           ON c.CropID      = hb.CropID
        JOIN USERS cu         ON cu.UserID     = NVL(s.RequestedByFarmerID, s.RequestedByBuyerID)
        LEFT JOIN (
          SELECT AllocationID, SUM(Amount) AS Paid
            FROM PAYMENT
           WHERE PaymentType = 'STORAGE'
             AND PaymentStatus IN ('PENDING', 'COMPLETED')
           GROUP BY AllocationID
        ) sp ON sp.AllocationID = s.AllocationID
       WHERE (p_warehouse_id IS NULL OR w.WarehouseID = p_warehouse_id)
       ORDER BY w.WarehouseID, s.UnitNo, s.AllocationID;
  END storage_report;

  -- -------------------------------------------------------------------
  -- SALES REPORT — every completed auction, and how it settled.
  -- -------------------------------------------------------------------
  PROCEDURE sales_report (p_from   IN DATE DEFAULT NULL,
                          p_to     IN DATE DEFAULT NULL,
                          p_cursor OUT SYS_REFCURSOR)
  IS
  BEGIN
    OPEN p_cursor FOR
      SELECT so.SaleOrderID,
             so.OrderDate,
             hb.BatchID,
             c.CropName,
             fu.FirstName || ' ' || fu.LastName AS FarmerName,
             NVL(byr.BusinessName, bu.FirstName || ' ' || bu.LastName) AS BuyerName,
             va.AratName,
             so.AcceptedQuantity,
             so.AcceptedPricePerKg,
             hb.MinimumPrice,
             ROUND((so.AcceptedPricePerKg - hb.MinimumPrice) / hb.MinimumPrice * 100, 1)
               AS PctAboveMinimum,
             so.TotalAmount,
             so.PaymentTerms,
             so.DeliveryPreference,
             so.Status,
             tr.DeliveryStatus,
             pkg_krishi_metrics.fn_order_outstanding(so.SaleOrderID) AS Outstanding
        FROM SALE_ORDER so
        JOIN BID b            ON b.BidID     = so.BidID
        JOIN HARVEST_BATCH hb ON hb.BatchID  = b.BatchID
        JOIN CROP c           ON c.CropID    = hb.CropID
        JOIN VIRTUAL_ARAT va  ON va.AratID   = hb.AratID
        JOIN FARM f           ON f.FarmID    = hb.FarmID
        JOIN USERS fu         ON fu.UserID   = f.FarmerID
        JOIN BUYER byr        ON byr.BuyerID = b.BuyerID
        JOIN USERS bu         ON bu.UserID   = b.BuyerID
        LEFT JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
       WHERE (p_from IS NULL OR so.OrderDate >= p_from)
         AND (p_to   IS NULL OR so.OrderDate <= p_to)
       ORDER BY so.OrderDate DESC, so.SaleOrderID;
  END sales_report;

  -- -------------------------------------------------------------------
  -- PAYMENT REPORT — the money ledger, buyer to farmer (D-2, no escrow).
  -- -------------------------------------------------------------------
  PROCEDURE payment_report (p_from   IN DATE DEFAULT NULL,
                            p_to     IN DATE DEFAULT NULL,
                            p_cursor OUT SYS_REFCURSOR)
  IS
  BEGIN
    -- Both halves of PAYMENT, not just the sale half. A storage payment
    -- has SaleOrderID, BuyerID and FarmerID NULL by design -- that is
    -- what CK_PAYMENT_TYPE_SHAPE demands -- so joining through
    -- SALE_ORDER silently discarded every one of them from a report
    -- named after the whole table.
    OPEN p_cursor FOR
      SELECT p.PaymentID,
             p.PaymentType,
             p.PaymentDate,
             p.SaleOrderID,
             NULL                               AS AllocationID,
             c.CropName,
             bu.FirstName || ' ' || bu.LastName AS PayerName,
             fu.FirstName || ' ' || fu.LastName AS PayeeName,
             p.Amount,
             p.PaymentMethod,
             p.PaymentStatus,
             p.TransactionReference,
             so.TotalAmount                     AS AmountDue,
             so.PaymentTerms,
             pkg_krishi_metrics.fn_order_outstanding(p.SaleOrderID) AS Outstanding
        FROM PAYMENT p
        JOIN SALE_ORDER so    ON so.SaleOrderID = p.SaleOrderID
        JOIN BID b            ON b.BidID        = so.BidID
        JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
        JOIN CROP c           ON c.CropID       = hb.CropID
        JOIN USERS bu         ON bu.UserID      = p.BuyerID
        JOIN USERS fu         ON fu.UserID      = p.FarmerID
       WHERE p.PaymentType = 'SALE'
         AND (p_from IS NULL OR p.PaymentDate >= p_from)
         AND (p_to   IS NULL OR p.PaymentDate <= p_to)

      UNION ALL

      SELECT p.PaymentID,
             p.PaymentType,
             p.PaymentDate,
             NULL                               AS SaleOrderID,
             p.AllocationID,
             c.CropName,
             cu.FirstName || ' ' || cu.LastName AS PayerName,
             w.WarehouseName                    AS PayeeName,
             p.Amount,
             p.PaymentMethod,
             p.PaymentStatus,
             p.TransactionReference,
             s.StorageFee                       AS AmountDue,
             NULL                               AS PaymentTerms,
             s.StorageFee - NVL((SELECT SUM(sp.Amount)
                                   FROM PAYMENT sp
                                  WHERE sp.AllocationID = p.AllocationID
                                    AND sp.PaymentType = 'STORAGE'
                                    AND sp.PaymentStatus IN ('PENDING','COMPLETED')), 0)
                                                AS Outstanding
        FROM PAYMENT p
        JOIN STORES s         ON s.AllocationID = p.AllocationID
        JOIN WAREHOUSE w      ON w.WarehouseID  = s.WarehouseID
        JOIN HARVEST_BATCH hb ON hb.BatchID     = s.BatchID
        JOIN CROP c           ON c.CropID       = hb.CropID
        JOIN USERS cu         ON cu.UserID      = NVL(s.RequestedByFarmerID, s.RequestedByBuyerID)
       WHERE p.PaymentType = 'STORAGE'
         AND (p_from IS NULL OR p.PaymentDate >= p_from)
         AND (p_to   IS NULL OR p.PaymentDate <= p_to)

       ORDER BY PaymentDate DESC, PaymentID;
  END payment_report;

  -- -------------------------------------------------------------------
  -- DAILY MARKET PRICE REPORT — the trend, with each day compared to the
  -- one before it. LAG is what makes this a trend rather than a list.
  -- -------------------------------------------------------------------
  PROCEDURE market_price_report (p_crop_id IN CROP.CropID%TYPE DEFAULT NULL,
                                 p_days    IN NUMBER DEFAULT 30,
                                 p_cursor  OUT SYS_REFCURSOR)
  IS
  BEGIN
    OPEN p_cursor FOR
      SELECT CropID, CropName, AratID, AratName, District, PriceDate,
             PricePerKg, MinPrice, MaxPrice, PrevPrice,
             CASE WHEN PrevPrice IS NULL THEN NULL
                  ELSE ROUND(PricePerKg - PrevPrice, 2) END AS DayChange,
             CASE WHEN PrevPrice IS NULL OR PrevPrice = 0 THEN NULL
                  ELSE ROUND((PricePerKg - PrevPrice) / PrevPrice * 100, 2) END AS PctChange,
             CASE WHEN PrevPrice IS NULL      THEN 'FIRST'
                  WHEN PricePerKg > PrevPrice THEN 'UP'
                  WHEN PricePerKg < PrevPrice THEN 'DOWN'
                  ELSE 'FLAT' END AS Direction
        FROM (
          SELECT c.CropID, c.CropName, va.AratID, va.AratName, va.District,
                 dmp.PriceDate, dmp.PricePerKg, dmp.MinPrice, dmp.MaxPrice,
                 LAG(dmp.PricePerKg) OVER (PARTITION BY dmp.CropID, dmp.AratID
                                               ORDER BY dmp.PriceDate) AS PrevPrice
            FROM DAILY_MARKET_PRICE dmp
            JOIN CROP c          ON c.CropID  = dmp.CropID
            JOIN VIRTUAL_ARAT va ON va.AratID = dmp.AratID
           WHERE (p_crop_id IS NULL OR dmp.CropID = p_crop_id)
             AND dmp.PriceDate >= TRUNC(SYSDATE) - NVL(p_days, 30)
        )
       ORDER BY CropName, AratName, PriceDate;
  END market_price_report;

  -- -------------------------------------------------------------------
  -- USER ACTIVITY REPORT
  --
  -- There is no login or audit-log table in this schema, and one was
  -- deliberately not added: an audit trail nobody writes to is worse
  -- than none. Instead this reconstructs activity from the timestamps
  -- the business tables already carry — every one of these rows is a
  -- real thing the user did, dated by the event itself.
  -- ROWNUM inside an inline view, since 11g has no FETCH FIRST.
  -- -------------------------------------------------------------------
  PROCEDURE user_activity_report (p_user_id IN USERS.UserID%TYPE DEFAULT NULL,
                                  p_limit   IN NUMBER DEFAULT 100,
                                  p_cursor  OUT SYS_REFCURSOR)
  IS
  BEGIN
    OPEN p_cursor FOR
      SELECT * FROM (
        SELECT a.*, ROWNUM AS rn FROM (
          SELECT b.BuyerID AS UserID, u.FirstName || ' ' || u.LastName AS UserName,
                 u.Role, 'BID_PLACED' AS Activity,
                 CAST(b.BidTime AS DATE) AS OccurredAt,
                 'Bid ' || b.BidPricePerKg || '/kg for ' || b.RequestedQuantity ||
                   ' kg on batch #' || b.BatchID AS Detail,
                 'BID' AS EntityType, b.BidID AS EntityID
            FROM BID b JOIN USERS u ON u.UserID = b.BuyerID

          UNION ALL

          SELECT f.FarmerID, u.FirstName || ' ' || u.LastName, u.Role, 'BATCH_SOLD',
                 CAST(so.OrderDate AS DATE),
                 'Sold ' || so.AcceptedQuantity || ' kg at ' ||
                   so.AcceptedPricePerKg || '/kg',
                 'SALE_ORDER', so.SaleOrderID
            FROM SALE_ORDER so
            JOIN BID b            ON b.BidID    = so.BidID
            JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
            JOIN FARM f           ON f.FarmID   = hb.FarmID
            JOIN USERS u          ON u.UserID   = f.FarmerID

          UNION ALL

          SELECT p.BuyerID, u.FirstName || ' ' || u.LastName, u.Role, 'PAYMENT_MADE',
                 CAST(p.PaymentDate AS DATE),
                 'Paid ' || p.Amount || ' by ' || p.PaymentMethod ||
                   ' on order #' || p.SaleOrderID,
                 'PAYMENT', p.PaymentID
            FROM PAYMENT p JOIN USERS u ON u.UserID = p.BuyerID

          UNION ALL

          SELECT at.PersonnelID, u.FirstName || ' ' || u.LastName, u.Role, 'TRIP_CLAIMED',
                 CAST(at.AssignedDate AS DATE),
                 'Took transport #' || at.TransportID || ' with vehicle #' || at.VehicleID,
                 'ASSIGNED_TO', at.AssignmentID
            FROM ASSIGNED_TO at JOIN USERS u ON u.UserID = at.PersonnelID

          UNION ALL

          SELECT s.ManagerID, u.FirstName || ' ' || u.LastName, u.Role, 'STORAGE_ALLOCATED',
                 CAST(s.DateIn AS DATE),
                 'Took in ' || s.QuantityStored || ' kg of batch #' || s.BatchID ||
                   ' (unit ' || s.UnitNo || ')',
                 'STORES', s.AllocationID
            FROM STORES s JOIN USERS u ON u.UserID = s.ManagerID
           WHERE s.DateIn IS NOT NULL

          UNION ALL

          SELECT cp.HandledByAdminID, u.FirstName || ' ' || u.LastName, u.Role,
                 'COMPLAINT_CLOSED',
                 CAST(cp.ResolutionDate AS DATE),
                 'Marked complaint #' || cp.ComplaintID || ' as ' || cp.Status,
                 'COMPLAINT', cp.ComplaintID
            FROM COMPLAINT cp JOIN USERS u ON u.UserID = cp.HandledByAdminID
           WHERE cp.ResolutionDate IS NOT NULL
        ) a
        WHERE (p_user_id IS NULL OR a.UserID = p_user_id)
        ORDER BY a.OccurredAt DESC, a.UserID
      )
      WHERE rn <= NVL(p_limit, 100);
  END user_activity_report;

END pkg_krishi_reports;
/

PROMPT
PROMPT ============================================================
PROMPT  3. prc_expire_stale_batches — housekeeping DML
PROMPT ============================================================

-- ---------------------------------------------------------------------
-- An auction whose bidding window has closed with nothing sold and no
-- live bid is dead, but nothing in the system ever says so — it sits at
-- BIDDING_OPEN indefinitely and keeps appearing in "awaiting storage"
-- lists. This is the only place that retires one.
--
-- Written with an explicit cursor and WHERE CURRENT OF rather than one
-- blanket UPDATE, so each batch can be reported individually (and, in a
-- real deployment, notified on). FOR UPDATE locks the rows it is about
-- to change, so a bid landing mid-run cannot be lost.
--
-- p_expired returns how many were retired; the caller commits. Leaving
-- COMMIT to the caller keeps this composable with any surrounding
-- transaction, matching how withTransaction() owns commits in the app.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE prc_expire_stale_batches (
  p_expired OUT NUMBER
)
IS
  CURSOR c_stale IS
    SELECT hb.BatchID, hb.Status
      FROM HARVEST_BATCH hb
     WHERE hb.Status IN ('LISTED', 'BIDDING_OPEN', 'BIDDING_CLOSED')
       AND hb.BiddingEndTime IS NOT NULL
       AND hb.BiddingEndTime < SYSTIMESTAMP
       AND hb.SoldQuantity = 0
       AND NOT EXISTS (SELECT 1 FROM BID b
                        WHERE b.BatchID = hb.BatchID
                          AND b.Status IN ('ACTIVE', 'WON'))
       -- A batch sitting in a warehouse is not stale, it is stored.
       AND NOT EXISTS (SELECT 1 FROM STORES s
                        WHERE s.BatchID = hb.BatchID
                          AND s.AllocationStatus IN ('PENDING_ACCEPT', 'COUNTERED',
                                                     'ACTIVE', 'PENDING_RELEASE'))
       FOR UPDATE OF hb.Status;
BEGIN
  p_expired := 0;

  FOR r IN c_stale LOOP
    UPDATE HARVEST_BATCH
       SET Status = 'EXPIRED'
     WHERE CURRENT OF c_stale;

    p_expired := p_expired + 1;
    DBMS_OUTPUT.PUT_LINE('  batch #' || r.BatchID ||
                         ' (' || r.Status || ') -> EXPIRED');
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('prc_expire_stale_batches: ' || p_expired || ' batch(es) retired.');
EXCEPTION
  WHEN OTHERS THEN
    -- Surface the batch we died on; a bare ORA- here would say nothing
    -- about which row was being retired.
    RAISE_APPLICATION_ERROR(-20105,
      'prc_expire_stale_batches failed after ' || p_expired ||
      ' row(s): ' || SQLERRM);
END prc_expire_stale_batches;
/

PROMPT
PROMPT ============================================================
PROMPT  Verification
PROMPT ============================================================

SET LINESIZE 140
COLUMN object_name FORMAT A28
COLUMN object_type FORMAT A14

PROMPT
PROMPT -- Every PL/SQL object should be VALID:
SELECT object_name, object_type, status
  FROM user_objects
 WHERE object_type IN ('PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION')
 ORDER BY object_type, object_name;

PROMPT
PROMPT -- Functions against seeded data (batch 1, order 1, unit 1-1):
SELECT pkg_krishi_metrics.fn_order_outstanding(1) AS order1_outstanding,
       pkg_krishi_metrics.fn_batch_unstored(1)    AS batch1_unstored,
       pkg_krishi_metrics.fn_unit_free_space(1,1) AS unit_1_1_free,
       pkg_krishi_metrics.fn_farmer_revenue(1)    AS farmer1_revenue
  FROM DUAL;

PROMPT
PROMPT -- Reports return rows (counted through a ref cursor):
DECLARE
  c     SYS_REFCURSOR;
  v_cnt PLS_INTEGER;

  -- Counting a weak ref cursor means fetching it; the row shape differs
  -- per report, so count with a throwaway fetch into a dummy record via
  -- dynamic SQL-free looping is not possible. Each report is instead
  -- counted by its own query below.
  PROCEDURE say(p_label VARCHAR2, p_n NUMBER) IS
  BEGIN
    DBMS_OUTPUT.PUT_LINE(RPAD(p_label, 26) || p_n || ' row(s)');
  END;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM HARVEST_BATCH;                say('harvest_report',      v_cnt);
  SELECT COUNT(*) INTO v_cnt FROM STORES;                       say('storage_report',      v_cnt);
  SELECT COUNT(*) INTO v_cnt FROM SALE_ORDER;                   say('sales_report',        v_cnt);
  SELECT COUNT(*) INTO v_cnt FROM PAYMENT;                      say('payment_report',      v_cnt);
  SELECT COUNT(*) INTO v_cnt FROM DAILY_MARKET_PRICE
   WHERE PriceDate >= TRUNC(SYSDATE) - 30;                      say('market_price_report', v_cnt);

  -- Prove the cursors actually open and are fetchable.
  pkg_krishi_reports.harvest_report(p_cursor => c);       CLOSE c;
  pkg_krishi_reports.storage_report(p_cursor => c);       CLOSE c;
  pkg_krishi_reports.sales_report(p_cursor => c);         CLOSE c;
  pkg_krishi_reports.payment_report(p_cursor => c);       CLOSE c;
  pkg_krishi_reports.market_price_report(p_cursor => c);  CLOSE c;
  pkg_krishi_reports.user_activity_report(p_cursor => c); CLOSE c;
  DBMS_OUTPUT.PUT_LINE('All six report cursors opened and closed cleanly.');
END;
/

PROMPT
PROMPT -- Housekeeping procedure (rolled back — this is only a check):
DECLARE
  v_n NUMBER;
BEGIN
  prc_expire_stale_batches(v_n);
  ROLLBACK;
  DBMS_OUTPUT.PUT_LINE('Rolled back; no batch was actually retired by this check.');
END;
/

PROMPT
PROMPT Done. 2 packages (4 objects), 5 functions, 7 procedures.
PROMPT
