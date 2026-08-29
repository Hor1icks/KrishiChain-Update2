-- =====================================================================
-- KrishiChain | 99_inspect_data.sql
-- READ-ONLY. Safe to run any time, as often as you like.
--
-- There is not a single INSERT, UPDATE or DELETE in this file -- it only
-- SELECTs. Use this to look at the seeded data instead of re-running
-- 03_insert_data.sql, which WIPES every table before re-seeding.
--
-- HOW TO RUN IT IN SQL DEVELOPER
--   1. File > Open, pick this file
--   2. Check the connection dropdown (top right) says krishichain
--   3. Press F5  ("Run Script") -- NOT Ctrl+Enter
--        F5         runs the whole file, prints into "Script Output"
--        Ctrl+Enter runs only the statement your cursor is in, and
--                   shows it in a proper grid -- nicer for one query
--
-- HOW TO RUN IT IN SQL*PLUS
--   sqlplus krishichain/Krishi#2026@localhost:1521/XE @99_inspect_data.sql
--
-- The COLUMN ... FORMAT lines below only control text width in
-- SQL*Plus / SQL Developer's Script Output. They do nothing to the data.
-- =====================================================================

SET LINESIZE 200
SET PAGESIZE 60
SET FEEDBACK OFF
SET TRIMSPOOL ON

PROMPT
PROMPT #####################################################################
PROMPT # 1. HOW MANY ROWS ARE IN EACH TABLE?
PROMPT #####################################################################
PROMPT

COLUMN table_name FORMAT A22
COLUMN row_count  FORMAT 999999

SELECT 'USERS'               AS table_name, COUNT(*) AS row_count FROM USERS
UNION ALL SELECT 'USER_PHONE',           COUNT(*) FROM USER_PHONE
UNION ALL SELECT 'FARMER',               COUNT(*) FROM FARMER
UNION ALL SELECT 'BUYER',                COUNT(*) FROM BUYER
UNION ALL SELECT 'ADMIN_STAFF',          COUNT(*) FROM ADMIN_STAFF
UNION ALL SELECT 'STORAGE_MANAGER',      COUNT(*) FROM STORAGE_MANAGER
UNION ALL SELECT 'TRANSPORT_PERSONNEL',  COUNT(*) FROM TRANSPORT_PERSONNEL
UNION ALL SELECT 'CROP_CATEGORY',        COUNT(*) FROM CROP_CATEGORY
UNION ALL SELECT 'CROP',                 COUNT(*) FROM CROP
UNION ALL SELECT 'FARM',                 COUNT(*) FROM FARM
UNION ALL SELECT 'VIRTUAL_ARAT',         COUNT(*) FROM VIRTUAL_ARAT
UNION ALL SELECT 'HARVEST_BATCH',        COUNT(*) FROM HARVEST_BATCH
UNION ALL SELECT 'WAREHOUSE',            COUNT(*) FROM WAREHOUSE
UNION ALL SELECT 'STORAGE_UNIT',         COUNT(*) FROM STORAGE_UNIT
UNION ALL SELECT 'STORES',               COUNT(*) FROM STORES
UNION ALL SELECT 'BID',                  COUNT(*) FROM BID
UNION ALL SELECT 'SALE_ORDER',           COUNT(*) FROM SALE_ORDER
UNION ALL SELECT 'PAYMENT',              COUNT(*) FROM PAYMENT
UNION ALL SELECT 'VEHICLE',              COUNT(*) FROM VEHICLE
UNION ALL SELECT 'TRANSPORT_REQUEST',    COUNT(*) FROM TRANSPORT_REQUEST
UNION ALL SELECT 'ASSIGNED_TO',          COUNT(*) FROM ASSIGNED_TO
UNION ALL SELECT 'DAILY_MARKET_PRICE',   COUNT(*) FROM DAILY_MARKET_PRICE
UNION ALL SELECT 'PHYSICAL_BAZAR',       COUNT(*) FROM PHYSICAL_BAZAR
UNION ALL SELECT 'BAZAR_DAILY_RECORD',   COUNT(*) FROM BAZAR_DAILY_RECORD
UNION ALL SELECT 'REVIEW',               COUNT(*) FROM REVIEW
UNION ALL SELECT 'COMPLAINT',            COUNT(*) FROM COMPLAINT
ORDER BY 1;

PROMPT
PROMPT #####################################################################
PROMPT # 2. THE PEOPLE  (the total, disjoint specialization)
PROMPT # All 25 users, each belonging to exactly one subclass table.
PROMPT #####################################################################
PROMPT

COLUMN id        FORMAT 999
COLUMN full_name FORMAT A20
COLUMN role      FORMAT A20
COLUMN district  FORMAT A12
COLUMN phones    FORMAT 999

SELECT u.UserID AS id,
       u.FirstName || ' ' || u.LastName AS full_name,
       u.Role AS role,
       u.Address.District AS district,
       (SELECT COUNT(*) FROM USER_PHONE p WHERE p.UserID = u.UserID) AS phones
FROM   USERS u
ORDER  BY u.UserID;

PROMPT
PROMPT === Both numbers below must match: that is what makes the
PROMPT === specialization TOTAL (nobody is left out of a subclass).
PROMPT

COLUMN users_total    FORMAT 9999
COLUMN subclass_total FORMAT 9999

SELECT (SELECT COUNT(*) FROM USERS) AS users_total,
       (SELECT COUNT(*) FROM FARMER) + (SELECT COUNT(*) FROM BUYER)
       + (SELECT COUNT(*) FROM ADMIN_STAFF) + (SELECT COUNT(*) FROM STORAGE_MANAGER)
       + (SELECT COUNT(*) FROM TRANSPORT_PERSONNEL) AS subclass_total
FROM dual;

PROMPT
PROMPT #####################################################################
PROMPT # 3. THE ARAT HIERARCHY  (recursive relationship #1)
PROMPT # Indentation shows depth. This is CONNECT BY walking the tree.
PROMPT #####################################################################
PROMPT

COLUMN depth           FORMAT 999
COLUMN arat_hierarchy  FORMAT A40
COLUMN district        FORMAT A14

SELECT LEVEL AS depth,
       LPAD(' ', (LEVEL - 1) * 4) || AratName AS arat_hierarchy,
       District AS district
FROM   VIRTUAL_ARAT
START WITH ParentAratID IS NULL
CONNECT BY NOCYCLE PRIOR AratID = ParentAratID
ORDER SIBLINGS BY AratID;

PROMPT
PROMPT #####################################################################
PROMPT # 4. THE HARVEST BATCHES
PROMPT # available_kg is a VIRTUAL column -- Oracle computes it from
PROMPT # total - reserved - sold. It is never stored or inserted.
PROMPT #####################################################################
PROMPT

COLUMN batch     FORMAT 999
COLUMN crop      FORMAT A14
COLUMN farm      FORMAT A22
COLUMN arat      FORMAT A28
COLUMN total_kg  FORMAT 99999
COLUMN sold_kg   FORMAT 99999
COLUMN avail_kg  FORMAT 99999
COLUMN min_price FORMAT 9999.99
COLUMN status    FORMAT A14

SELECT b.BatchID           AS batch,
       c.CropName          AS crop,
       f.FarmName          AS farm,
       a.AratName          AS arat,
       b.TotalQuantity     AS total_kg,
       b.SoldQuantity      AS sold_kg,
       b.AvailableQuantity AS avail_kg,
       b.MinimumPrice      AS min_price,
       b.Status            AS status
FROM   HARVEST_BATCH b
JOIN   CROP c         ON c.CropID = b.CropID
JOIN   FARM f         ON f.FarmID = b.FarmID
JOIN   VIRTUAL_ARAT a ON a.AratID = b.AratID
ORDER  BY b.BatchID;

PROMPT
PROMPT #####################################################################
PROMPT # 5. THE BIDDING  (recursive relationship #2: the outbid chain)
PROMPT # "beat_bid" is PreviousBidID -- the bid this one outbid.
PROMPT # Batch 1 has a 3-deep chain: 34.50 -> 35.25 -> 36.00 (WON).
PROMPT #####################################################################
PROMPT

COLUMN batch    FORMAT 999
COLUMN crop     FORMAT A14
COLUMN bid      FORMAT 9999
COLUMN beat_bid FORMAT 9999
COLUMN bidder   FORMAT A20
COLUMN price    FORMAT 9999.99
COLUMN status   FORMAT A10

SELECT bd.BatchID       AS batch,
       c.CropName       AS crop,
       bd.BidID         AS bid,
       bd.PreviousBidID AS beat_bid,
       u.FirstName || ' ' || u.LastName AS bidder,
       bd.BidPricePerKg AS price,
       bd.Status        AS status
FROM   BID bd
JOIN   HARVEST_BATCH b ON b.BatchID = bd.BatchID
JOIN   CROP c          ON c.CropID  = b.CropID
JOIN   USERS u         ON u.UserID  = bd.BuyerID
ORDER  BY bd.BatchID, bd.BidID;

PROMPT
PROMPT === Batches still open for bidding RIGHT NOW (the live demo) ===
PROMPT

COLUMN batch      FORMAT 999
COLUMN crop       FORMAT A14
COLUMN min_price  FORMAT 9999.99
COLUMN highest    FORMAT 9999.99
COLUMN closes     FORMAT A20

SELECT b.BatchID              AS batch,
       c.CropName             AS crop,
       b.MinimumPrice         AS min_price,
       MAX(bd.BidPricePerKg)  AS highest,
       TO_CHAR(b.BiddingEndTime, 'DD-MON-YYYY HH24:MI') AS closes
FROM   HARVEST_BATCH b
JOIN   CROP c      ON c.CropID = b.CropID
LEFT   JOIN BID bd ON bd.BatchID = b.BatchID
WHERE  b.Status = 'BIDDING_OPEN'
GROUP  BY b.BatchID, c.CropName, b.MinimumPrice, b.BiddingEndTime
ORDER  BY b.BatchID;

PROMPT
PROMPT #####################################################################
PROMPT # 6. THE FULL STORY, END TO END
PROMPT # One row per sale order: who grew it, who bought it, was it
PROMPT # delivered, was it paid. This is the demo centrepiece.
PROMPT #####################################################################
PROMPT

COLUMN ord      FORMAT 999
COLUMN crop     FORMAT A13
COLUMN farmer   FORMAT A17
COLUMN buyer    FORMAT A17
COLUMN qty_kg   FORMAT 99999
COLUMN price    FORMAT 9999.99
COLUMN total    FORMAT 999999.99
COLUMN terms    FORMAT A12
COLUMN delivery FORMAT A11
COLUMN paid     FORMAT 999999.99

SELECT so.SaleOrderID                     AS ord,
       c.CropName                         AS crop,
       fu.FirstName || ' ' || fu.LastName AS farmer,
       bu.FirstName || ' ' || bu.LastName AS buyer,
       so.AcceptedQuantity                AS qty_kg,
       so.AcceptedPricePerKg              AS price,
       so.TotalAmount                     AS total,
       so.PaymentTerms                    AS terms,
       tr.DeliveryStatus                  AS delivery,
       NVL((SELECT SUM(p.Amount) FROM PAYMENT p
            WHERE p.SaleOrderID = so.SaleOrderID
              AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS paid
FROM   SALE_ORDER so
JOIN   BID bd          ON bd.BidID  = so.BidID
JOIN   HARVEST_BATCH b ON b.BatchID = bd.BatchID
JOIN   CROP c          ON c.CropID  = b.CropID
JOIN   FARM f          ON f.FarmID  = b.FarmID
JOIN   USERS fu        ON fu.UserID = f.FarmerID
JOIN   USERS bu        ON bu.UserID = bd.BuyerID
LEFT   JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
ORDER  BY so.SaleOrderID;

PROMPT
PROMPT #####################################################################
PROMPT # 7. STORAGE  (weak entity + ternary relationship #1)
PROMPT # UnitNo restarts at 1 inside every warehouse -- that is what
PROMPT # makes it a PARTIAL key rather than a normal primary key.
PROMPT #####################################################################
PROMPT

COLUMN wh_id     FORMAT 999
COLUMN warehouse FORMAT A30
COLUMN unit      FORMAT 9999
COLUMN capacity  FORMAT 999999
COLUMN status    FORMAT A13

SELECT w.WarehouseID   AS wh_id,
       w.WarehouseName AS warehouse,
       su.UnitNo       AS unit,
       su.Capacity     AS capacity,
       su.Status       AS status
FROM   WAREHOUSE w
JOIN   STORAGE_UNIT su ON su.WarehouseID = w.WarehouseID
ORDER  BY w.WarehouseID, su.UnitNo;

PROMPT
PROMPT === The ternary: which MANAGER authorized each allocation. That
PROMPT === accountability link is why this stays one table.
PROMPT

COLUMN alloc         FORMAT 9999
COLUMN batch         FORMAT 999
COLUMN crop          FORMAT A14
COLUMN warehouse     FORMAT A30
COLUMN unit          FORMAT 9999
COLUMN authorized_by FORMAT A18
COLUMN qty_kg        FORMAT 99999
COLUMN status        FORMAT A11

SELECT s.AllocationID   AS alloc,
       s.BatchID        AS batch,
       c.CropName       AS crop,
       w.WarehouseName  AS warehouse,
       s.UnitNo         AS unit,
       mu.FirstName || ' ' || mu.LastName AS authorized_by,
       s.QuantityStored AS qty_kg,
       s.AllocationStatus AS status
FROM   STORES s
JOIN   HARVEST_BATCH b ON b.BatchID     = s.BatchID
JOIN   CROP c          ON c.CropID      = b.CropID
JOIN   WAREHOUSE w     ON w.WarehouseID = s.WarehouseID
JOIN   USERS mu        ON mu.UserID     = s.ManagerID
ORDER  BY s.AllocationID;

PROMPT
PROMPT #####################################################################
PROMPT # 8. TRANSPORT  (ternary relationship #2)
PROMPT # Request x Vehicle x Personnel in a single row. Note vehicle_kg
PROMPT # is always >= load_kg -- that is BR-18 holding.
PROMPT #####################################################################
PROMPT

COLUMN asg        FORMAT 999
COLUMN ord        FORMAT 999
COLUMN vehicle_no FORMAT A22
COLUMN vehicle_kg FORMAT 99999
COLUMN load_kg    FORMAT 99999
COLUMN driver     FORMAT A18
COLUMN delivery   FORMAT A12

SELECT at.AssignmentID AS asg,
       tr.SaleOrderID  AS ord,
       v.VehicleNo     AS vehicle_no,
       v.Capacity      AS vehicle_kg,
       so.AcceptedQuantity AS load_kg,
       pu.FirstName || ' ' || pu.LastName AS driver,
       tr.DeliveryStatus AS delivery
FROM   ASSIGNED_TO at
JOIN   TRANSPORT_REQUEST tr ON tr.TransportID = at.TransportID
JOIN   SALE_ORDER so        ON so.SaleOrderID = tr.SaleOrderID
JOIN   VEHICLE v            ON v.VehicleID    = at.VehicleID
JOIN   USERS pu             ON pu.UserID      = at.PersonnelID
ORDER  BY at.AssignmentID;

PROMPT
PROMPT #####################################################################
PROMPT # 9. PAYMENTS  (BR-19 and the flexible BR-20)
PROMPT # Order 5 shows 0 paid ON PURPOSE: its terms are ON_DELIVERY and
PROMPT # it has not been delivered, so trg_payment_biz_rules would
PROMPT # reject a payment. Order 4 shows two instalments.
PROMPT #####################################################################
PROMPT

COLUMN ord         FORMAT 999
COLUMN terms       FORMAT A12
COLUMN total       FORMAT 999999.99
COLUMN paid_so_far FORMAT 999999.99
COLUMN outstanding FORMAT 999999.99
COLUMN instalments FORMAT 999

SELECT so.SaleOrderID  AS ord,
       so.PaymentTerms AS terms,
       so.TotalAmount  AS total,
       NVL(SUM(p.Amount), 0)                  AS paid_so_far,
       so.TotalAmount - NVL(SUM(p.Amount), 0) AS outstanding,
       COUNT(p.PaymentID)                     AS instalments
FROM   SALE_ORDER so
LEFT   JOIN PAYMENT p ON p.SaleOrderID = so.SaleOrderID
                     AND p.PaymentStatus IN ('PENDING','COMPLETED')
GROUP  BY so.SaleOrderID, so.PaymentTerms, so.TotalAmount
ORDER  BY so.SaleOrderID;

PROMPT
PROMPT #####################################################################
PROMPT # 10. MARKET PRICE TREND (raw material for Q5's LAG query)
PROMPT # Last 14 days of Aman Rice at the central arat. 1,080 rows of
PROMPT # price history exist in total, across 12 (crop, arat) series.
PROMPT #####################################################################
PROMPT

COLUMN price_date FORMAT A12
COLUMN price      FORMAT 9999.99
COLUMN low        FORMAT 9999.99
COLUMN high       FORMAT 9999.99
COLUMN vs_yday    FORMAT 9999.99

SELECT TO_CHAR(PriceDate, 'DD-MON-YYYY') AS price_date,
       PricePerKg AS price,
       MinPrice   AS low,
       MaxPrice   AS high,
       PricePerKg - LAG(PricePerKg) OVER (ORDER BY PriceDate) AS vs_yday
FROM   (SELECT PriceDate, PricePerKg, MinPrice, MaxPrice
        FROM   DAILY_MARKET_PRICE
        WHERE  CropID = 1 AND AratID = 1
        ORDER  BY PriceDate DESC)
WHERE  ROWNUM <= 14
ORDER  BY PriceDate;

CLEAR COLUMNS

PROMPT
PROMPT #####################################################################
PROMPT # Done. Nothing above changed any data.
PROMPT #####################################################################
PROMPT
