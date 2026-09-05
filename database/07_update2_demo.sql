
SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 160 PAGESIZE 100
COLUMN farmer      FORMAT A26
COLUMN short_form  FORMAT A34
COLUMN full_form   FORMAT A54
COLUMN district    FORMAT A16
COLUMN cropname    FORMAT A16
COLUMN object_name FORMAT A28
COLUMN object_type FORMAT A14
COLUMN drivername  FORMAT A20
COLUMN paymenteligibility FORMAT A26

PROMPT
PROMPT ================ 1. FUNCTION ================
PROMPT pkg_krishi_metrics has five. Each one answers a question the
PROMPT application asks on nearly every page.

SELECT u.FirstName || ' ' || u.LastName          AS farmer,
       pkg_krishi_metrics.fn_farmer_revenue(f.FarmerID) AS revenue_taka
FROM   FARMER f
JOIN   USERS  u ON u.UserID = f.FarmerID
ORDER  BY revenue_taka DESC;

PROMPT
PROMPT ================ 2. SUBQUERY ================
PROMPT A correlated subquery: each batch carries its own highest bid,
PROMPT which is a different row of a different table per batch.

SELECT hb.BatchID,
       c.CropName,
       hb.MinimumPrice,
       (SELECT MAX(b.BidPricePerKg)
          FROM BID b
         WHERE b.BatchID = hb.BatchID)  AS highest_bid,
       (SELECT COUNT(*)
          FROM BID b
         WHERE b.BatchID = hb.BatchID)  AS bids_received
FROM   HARVEST_BATCH hb
JOIN   CROP c ON c.CropID = hb.CropID
ORDER  BY hb.BatchID;

PROMPT
PROMPT A scalar subquery is also how every new row gets its key, since
PROMPT 11g has no IDENTITY column. This is the shape used by all 15
PROMPT inserts in the service layer:
PROMPT
PROMPT   INSERT INTO BID (BidID, ...)
PROMPT   VALUES ((SELECT NVL(MAX(BidID), 0) + 1 FROM BID), ...)

SELECT (SELECT NVL(MAX(BidID), 0) + 1 FROM BID) AS next_bid_id FROM dual;

PROMPT
PROMPT ================ 3. VIEW ================
PROMPT Six views. V_PENDING_DELIVERY joins seven tables so the admin
PROMPT dashboard can ask one simple question of it.

SELECT SaleOrderID, CropName, DeliveryStatus, DriverName,
       DaysSinceRequest, PaymentEligibility
FROM   V_PENDING_DELIVERY
ORDER  BY DaysSinceRequest DESC;

PROMPT
PROMPT ================ 4. ABSTRACT DATATYPE ================
PROMPT USERS.Address is a t_address object, not six flat columns. It
PROMPT carries its own formatting behaviour.

SELECT u.UserID,
       u.Address.District        AS district,
       u.Address.short_text()    AS short_form,
       u.Address.full_text()     AS full_form
FROM   USERS u
WHERE  u.UserID <= 3
ORDER  BY u.UserID;

PROMPT
PROMPT ================ 5. PL/SQL ================
PROMPT Three packages. pkg_krishi_rules holds the rules that compare two
PROMPT tables, which no CHECK constraint can express.

SELECT object_name, object_type, status
FROM   user_objects
WHERE  object_type IN ('PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'TYPE', 'TYPE BODY')
ORDER  BY object_name, object_type;

PROMPT
PROMPT ================ 6. CURSOR ================
PROMPT An explicit cursor walked row by row.

DECLARE
  CURSOR c_open_batches IS
    SELECT hb.BatchID, c.CropName, hb.TotalQuantity
      FROM HARVEST_BATCH hb
      JOIN CROP c ON c.CropID = hb.CropID
     WHERE hb.Status = 'BIDDING_OPEN'
     ORDER BY hb.BatchID;
  v_count  PLS_INTEGER := 0;
  v_volume NUMBER := 0;
BEGIN
  FOR r IN c_open_batches LOOP
    v_count  := v_count + 1;
    v_volume := v_volume + r.TotalQuantity;
    DBMS_OUTPUT.PUT_LINE('  batch ' || RPAD(r.BatchID, 4) ||
                         RPAD(r.CropName, 18) || r.TotalQuantity || ' kg');
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('  ' || v_count || ' open, ' || v_volume || ' kg on offer');
END;
/

PROMPT
PROMPT The six report procedures hand a SYS_REFCURSOR back to the API,
PROMPT which streams it to the Reports page rather than materialising it.

DECLARE
  v_cursor SYS_REFCURSOR;
  v_handle NUMBER;
  v_rows   PLS_INTEGER := 0;
BEGIN
  pkg_krishi_reports.harvest_report(p_cursor => v_cursor);

  v_handle := DBMS_SQL.TO_CURSOR_NUMBER(v_cursor);
  WHILE DBMS_SQL.FETCH_ROWS(v_handle) > 0 LOOP
    v_rows := v_rows + 1;
  END LOOP;
  DBMS_SQL.CLOSE_CURSOR(v_handle);

  DBMS_OUTPUT.PUT_LINE('  harvest_report returned ' || v_rows || ' rows');
END;
/

PROMPT
PROMPT ================ 7. EXCEPTION HANDLING ================
PROMPT Rules raise numbered application errors. The API maps them to a
PROMPT status code and shows the message, so the user reads the rule
PROMPT rather than "something went wrong".

DECLARE
  v_batch NUMBER;
  v_order NUMBER;
BEGIN
  SELECT MIN(BatchID) INTO v_batch FROM HARVEST_BATCH;
  SELECT MIN(SaleOrderID) INTO v_order FROM SALE_ORDER;

  BEGIN
    pkg_krishi_rules.check_bid_min_qty(v_batch, 1);
    DBMS_OUTPUT.PUT_LINE('  BR: a 1 kg bid was allowed, which it should not be');
  EXCEPTION
    WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('  caught -> ' || SQLERRM);
  END;

  BEGIN
    pkg_krishi_rules.check_payment_allowed(v_order, 99999999);
    DBMS_OUTPUT.PUT_LINE('  BR-19: an overpayment was allowed, which it should not be');
  EXCEPTION
    WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('  caught -> ' || SQLERRM);
  END;

  BEGIN
    pkg_krishi_rules.check_bid_min_qty(-1, 500);
    DBMS_OUTPUT.PUT_LINE('  a bid on a missing batch was allowed');
  EXCEPTION
    WHEN OTHERS THEN DBMS_OUTPUT.PUT_LINE('  caught -> ' || SQLERRM);
  END;
END;
/

PROMPT
PROMPT ================ END ================
