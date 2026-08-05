-- =====================================================================
-- KrishiChain | 05_advanced_queries.sql
-- Phase 4, Day 4 — the five advanced queries (PRD §10 offers 7, picks 5).
--
-- READ-ONLY. Safe to run any time. Run after 03_insert_data.sql and
-- 04_views.sql:
--   sqlplus krishichain/"Krishi#2026"@localhost:1521/XE @05_advanced_queries.sql
-- In SQL Developer: open, connect as krishichain, press F5 (Run Script).
--
-- WHICH FIVE, AND WHY
-- The Definition of Done (PRD §16) is "5 advanced queries returning
-- non-empty, explainable results". Each query below was run against the
-- seed data and returns rows. The two candidates NOT chosen:
--
--   Q3 (warehouse utilization) -- dropped. It is already the standing
--      view V_UNIT_UTILIZATION, which does the same work plus alert
--      banding; repeating it here adds nothing to defend in the viva.
--   Q7 (delivered but unpaid) -- dropped. It returns ZERO rows against
--      the seed: every DELIVERED order is fully paid, and the one
--      unpaid order is unpaid precisely because BR-20 blocks it while
--      undelivered. An empty result set is the exact demo failure the
--      PRD warns about, so it is out.
--
-- ORACLE 11g NOTE: no FETCH FIRST n ROWS anywhere. Row limiting is done
-- with ROWNUM inside an inline view, and top-n-per-group with RANK()
-- filtered in an outer query -- which is the more defensible form anyway.
-- =====================================================================

SET LINESIZE 200
SET PAGESIZE 60
SET FEEDBACK OFF

PROMPT
PROMPT #####################################################################
PROMPT # Q1 — PRICE TRANSPARENCY: did the farmer beat the market?
PROMPT #
PROMPT # Business question: for every completed sale, how did the price
PROMPT # the farmer actually got compare with that day's published ARAT
PROMPT # price for the same crop, and with the crop's base price?
PROMPT # This is the project's whole reason for existing -- the ARAT
PROMPT # middleman is meant to stop being able to hide the market rate.
PROMPT #
PROMPT # SQL features: 6-table join, a 3-column join to the price table
PROMPT # (crop + arat + date), derived percentage columns.
PROMPT #####################################################################
PROMPT

COLUMN crop        FORMAT A14
COLUMN arat        FORMAT A28
COLUMN farmer      FORMAT A17
COLUMN order_date  FORMAT A12
COLUMN got         FORMAT 9999.99
COLUMN market      FORMAT 9999.99
COLUMN base        FORMAT 9999.99
COLUMN pct_vs_mkt  FORMAT 999.99
COLUMN pct_vs_base FORMAT 999.99
COLUMN verdict     FORMAT A16

SELECT c.CropName                          AS crop,
       va.AratName                         AS arat,
       fu.FirstName || ' ' || fu.LastName   AS farmer,
       TO_CHAR(so.OrderDate, 'DD-MON-YYYY') AS order_date,
       so.AcceptedPricePerKg               AS got,
       dmp.PricePerKg                      AS market,
       c.BasePrice                         AS base,
       ROUND((so.AcceptedPricePerKg - dmp.PricePerKg) / dmp.PricePerKg * 100, 2) AS pct_vs_mkt,
       ROUND((so.AcceptedPricePerKg - c.BasePrice)    / c.BasePrice    * 100, 2) AS pct_vs_base,
       CASE WHEN so.AcceptedPricePerKg > dmp.PricePerKg THEN 'BEAT MARKET'
            WHEN so.AcceptedPricePerKg = dmp.PricePerKg THEN 'MATCHED MARKET'
            ELSE 'BELOW MARKET'
       END                                 AS verdict
FROM   SALE_ORDER so
JOIN   BID b            ON b.BidID    = so.BidID
JOIN   HARVEST_BATCH hb ON hb.BatchID = b.BatchID
JOIN   CROP c           ON c.CropID   = hb.CropID
JOIN   VIRTUAL_ARAT va  ON va.AratID  = hb.AratID
JOIN   FARM f           ON f.FarmID   = hb.FarmID
JOIN   USERS fu         ON fu.UserID  = f.FarmerID
-- The batch's own ARAT on the day the order was placed. 03_insert_data.sql
-- seeds a price series for every (crop, arat) pair a batch actually uses,
-- so no sale silently drops out of this join.
JOIN   DAILY_MARKET_PRICE dmp
       ON  dmp.CropID    = c.CropID
       AND dmp.AratID    = va.AratID
       AND dmp.PriceDate = TRUNC(so.OrderDate)
ORDER  BY pct_vs_mkt DESC;

PROMPT
PROMPT #####################################################################
PROMPT # Q2 — TOP-EARNING FARMERS PER ARAT (analytic ranking)
PROMPT #
PROMPT # Business question: within each ARAT's catchment, who are the
PROMPT # highest-earning farmers? An ARAT operator would use this to see
PROMPT # who their volume actually comes from.
PROMPT #
PROMPT # SQL features: RANK() OVER (PARTITION BY ... ORDER BY SUM(...)),
PROMPT # aggregate inside the window, top-n-per-group filtered in an
PROMPT # outer query -- 11g has no FETCH FIRST / QUALIFY.
PROMPT #
PROMPT # DEVIATION FROM PRD §10: the PRD partitions by DISTRICT. Our five
PROMPT # farmers each live in a different district, so every row would
PROMPT # come back Rnk = 1 and the ranking would demonstrate nothing.
PROMPT # Partitioning by ARAT is equally meaningful and produces a real
PROMPT # contest -- Central Regional Arat serves two farmers.
PROMPT #####################################################################
PROMPT

COLUMN arat     FORMAT A28
COLUMN farmer   FORMAT A18
COLUMN district FORMAT A13
COLUMN orders   FORMAT 999
COLUMN earnings FORMAT 9999999.99
COLUMN rnk      FORMAT 999

SELECT arat, farmer, district, orders, earnings, rnk
FROM (
  SELECT va.AratName                        AS arat,
         u.FirstName || ' ' || u.LastName    AS farmer,
         u.District                         AS district,
         COUNT(so.SaleOrderID)              AS orders,
         SUM(so.TotalAmount)                AS earnings,
         RANK() OVER (PARTITION BY va.AratName
                      ORDER BY SUM(so.TotalAmount) DESC) AS rnk
  FROM   SALE_ORDER so
  JOIN   BID b            ON b.BidID    = so.BidID
  JOIN   HARVEST_BATCH hb ON hb.BatchID = b.BatchID
  JOIN   VIRTUAL_ARAT va  ON va.AratID  = hb.AratID
  JOIN   FARM f           ON f.FarmID   = hb.FarmID
  JOIN   USERS u          ON u.UserID   = f.FarmerID
  WHERE  so.Status <> 'CANCELLED'
  GROUP  BY va.AratName, u.FirstName, u.LastName, u.District
)
WHERE  rnk <= 3
ORDER  BY arat, rnk;

PROMPT
PROMPT #####################################################################
PROMPT # Q4 — BIDDING COMPETITIVENESS BY CROP, PLUS THE BATCHES NOBODY
PROMPT #      BID ON (anti-join)
PROMPT #
PROMPT # Business question: which crops attract above-average bidding
PROMPT # interest -- and, separately, how much produce is sitting listed
PROMPT # with no bids at all? The second half is the one an ARAT operator
PROMPT # actually acts on.
PROMPT #
PROMPT # SQL features: LEFT JOIN so unbid batches survive, HAVING against
PROMPT # a scalar subquery over a derived table, UNION ALL, and a
PROMPT # NOT EXISTS anti-join.
PROMPT #####################################################################
PROMPT

COLUMN crop           FORMAT A20
COLUMN batches_listed FORMAT 99999
COLUMN total_bids     FORMAT 99999
COLUMN avg_bid        FORMAT 9999.99
COLUMN highest_bid    FORMAT 9999.99

SELECT c.CropName                       AS crop,
       COUNT(DISTINCT hb.BatchID)       AS batches_listed,
       COUNT(b.BidID)                   AS total_bids,
       ROUND(AVG(b.BidPricePerKg), 2)   AS avg_bid,
       MAX(b.BidPricePerKg)             AS highest_bid
FROM   HARVEST_BATCH hb
JOIN   CROP c   ON c.CropID  = hb.CropID
LEFT   JOIN BID b ON b.BatchID = hb.BatchID
GROUP  BY c.CropName
-- "Above average" = more bids than the mean number of bids a bid-on
-- batch receives. The inner GROUP BY only sees batches that HAVE bids,
-- so unbid batches do not drag the average toward zero.
HAVING COUNT(b.BidID) > (
         SELECT AVG(cnt)
         FROM  (SELECT COUNT(*) AS cnt FROM BID GROUP BY BatchID)
       )
UNION ALL
SELECT '>> NO BIDS RECEIVED',
       COUNT(*),
       0, 0, 0
FROM   HARVEST_BATCH hb
WHERE  NOT EXISTS (SELECT 1 FROM BID b WHERE b.BatchID = hb.BatchID);

PROMPT
PROMPT #####################################################################
PROMPT # Q5 — MONTH-OVER-MONTH PRICE TREND PER CROP (window function)
PROMPT #
PROMPT # Business question: is each crop's market price rising or falling,
PROMPT # and by how much? A farmer deciding whether to sell now or hold
PROMPT # stock in storage needs exactly this.
PROMPT #
PROMPT # SQL features: LAG() OVER (PARTITION BY ... ORDER BY ...) reading
PROMPT # the previous row's value, over an aggregate, inside an inline
PROMPT # view. NULLIF guards the first month of each crop, where there is
PROMPT # no previous row and PrevPrice is NULL.
PROMPT #
PROMPT # This query is the reason 03_insert_data.sql generates 1,080 rows
PROMPT # of price history instead of five hand-written ones -- five
PROMPT # isolated points have no trend to lag against.
PROMPT #####################################################################
PROMPT

COLUMN crop       FORMAT A16
COLUMN price_month FORMAT A10
COLUMN avg_price  FORMAT 9999.99
COLUMN prev_price FORMAT 9999.99
COLUMN pct_change FORMAT 999.99
COLUMN direction  FORMAT A10

SELECT crop, price_month, avg_price, prev_price,
       ROUND((avg_price - prev_price) / NULLIF(prev_price, 0) * 100, 2) AS pct_change,
       CASE WHEN prev_price IS NULL          THEN '-'
            WHEN avg_price > prev_price      THEN 'UP'
            WHEN avg_price < prev_price      THEN 'DOWN'
            ELSE 'FLAT'
       END AS direction
FROM (
  SELECT c.CropName                              AS crop,
         TO_CHAR(dmp.PriceDate, 'YYYY-MM')       AS price_month,
         ROUND(AVG(dmp.PricePerKg), 2)           AS avg_price,
         LAG(ROUND(AVG(dmp.PricePerKg), 2)) OVER (
             PARTITION BY c.CropName
             ORDER BY TO_CHAR(dmp.PriceDate, 'YYYY-MM')) AS prev_price
  FROM   DAILY_MARKET_PRICE dmp
  JOIN   CROP c ON c.CropID = dmp.CropID
  GROUP  BY c.CropName, TO_CHAR(dmp.PriceDate, 'YYYY-MM')
)
ORDER  BY crop, price_month;

PROMPT
PROMPT #####################################################################
PROMPT # Q6 — ARAT HIERARCHY ROLLUP (recursive relationship)
PROMPT #
PROMPT # Business question: what does the ARAT network look like, and how
PROMPT # much produce flows through each tier of it?
PROMPT #
PROMPT # SQL features: CONNECT BY NOCYCLE walking VIRTUAL_ARAT's
PROMPT # self-referencing FK (ParentAratID -> AratID), LEVEL for depth,
PROMPT # ORDER SIBLINGS BY to keep the tree readable, and correlated
PROMPT # scalar subqueries for the per-node rollup.
PROMPT #
PROMPT # NOCYCLE is what stops a bad data cycle (A parents B parents A)
PROMPT # from making this query loop forever -- worth saying out loud in
PROMPT # the viva, because it is the usual follow-up question.
PROMPT #####################################################################
PROMPT

COLUMN arat_hierarchy FORMAT A40
COLUMN tier           FORMAT 999
COLUMN district       FORMAT A14
COLUMN batches        FORMAT 99999
COLUMN volume_kg      FORMAT 9999999
COLUMN sold_value     FORMAT 9999999.99

SELECT LPAD(' ', 3 * (LEVEL - 1)) || va.AratName AS arat_hierarchy,
       LEVEL        AS tier,
       va.District  AS district,
       (SELECT COUNT(*)
          FROM HARVEST_BATCH hb
         WHERE hb.AratID = va.AratID)            AS batches,
       (SELECT NVL(SUM(hb.TotalQuantity), 0)
          FROM HARVEST_BATCH hb
         WHERE hb.AratID = va.AratID)            AS volume_kg,
       (SELECT NVL(SUM(so.TotalAmount), 0)
          FROM SALE_ORDER so
          JOIN BID b            ON b.BidID    = so.BidID
          JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
         WHERE hb.AratID = va.AratID)            AS sold_value
FROM   VIRTUAL_ARAT va
START WITH va.ParentAratID IS NULL
CONNECT BY NOCYCLE PRIOR va.AratID = va.ParentAratID
ORDER SIBLINGS BY va.AratName;

CLEAR COLUMNS

PROMPT
PROMPT #####################################################################
PROMPT # Done. Five queries, all returning rows. Nothing was modified.
PROMPT #####################################################################
PROMPT
