-- =====================================================================
-- KrishiChain | 04_views.sql
-- Phase 4, Day 4 — the six views from PRD §9.11.
--
-- Run as the `krishichain` user, after 03_insert_data.sql.
-- Safe to re-run: every view is CREATE OR REPLACE.
--
-- WHY THESE EXIST
-- Two jobs. First, they carry the derived attributes the ER diagram
-- shows but the physical schema could not implement as columns:
--
--   USERS./Age/                    -> V_USER_PROFILE
--   HARVEST_BATCH./CurrentHighestBid/ -> V_BATCH_AVAILABILITY, V_BIDDING_SUMMARY
--   STORAGE_UNIT./CurrentLoad/     -> V_UNIT_UTILIZATION
--   WAREHOUSE./AvailableCapacity/  -> V_UNIT_UTILIZATION
--
-- Oracle 11g virtual columns are same-table and deterministic only, so
-- anything needing SYSDATE (Age) or an aggregate over another table
-- (the other three) has to be a view. The two derived attributes that
-- ARE same-table and deterministic -- HARVEST_BATCH.AvailableQuantity
-- and SALE_ORDER.TotalAmount -- stayed real virtual columns in
-- 01_create_tables.sql and are simply passed through below.
--
-- Second, they keep the Express layer thin: the role pages read from
-- these instead of restating five-table joins in JavaScript.
--
-- No CLOB columns are selected anywhere here (CROP.Description,
-- REVIEW.ReviewComment, COMPLAINT.Description) -- PRD §12 requires list
-- queries to stay off CLOBs.
-- =====================================================================

-- =====================================================================
-- V_USER_PROFILE
-- One row per user, with the two things the USERS table cannot store:
--   Age         -- needs SYSDATE, so no virtual column is possible
--   FullAddress -- the composite attribute Address reassembled from its
--                  six component columns, for display
-- =====================================================================
CREATE OR REPLACE VIEW V_USER_PROFILE AS
SELECT u.UserID,
       u.FirstName,
       u.MiddleName,
       u.LastName,
       u.FirstName || ' ' || u.LastName                    AS FullName,
       u.Email,
       u.Gender,
       u.DateOfBirth,
       TRUNC(MONTHS_BETWEEN(SYSDATE, u.DateOfBirth) / 12)  AS Age,
       u.Address.HouseNo                                   AS HouseNo,
       u.Address.Road                                      AS Road,
       u.Address.Village                                   AS Village,
       u.Address.Upazila                                   AS Upazila,
       u.Address.District                                  AS District,
       u.Address.PostalCode                                AS PostalCode,
       u.Address.full_text()                               AS FullAddress,
       u.Address.short_text()                              AS ShortAddress,
       u.RegistrationDate,
       u.Status,
       u.Role,
       (SELECT COUNT(*) FROM USER_PHONE p WHERE p.UserID = u.UserID) AS PhoneCount
FROM   USERS u;

-- =====================================================================
-- V_BATCH_AVAILABILITY
-- The buyer-facing listing row: one line per harvest batch with its
-- farm, farmer, crop, ARAT and current highest bid already resolved.
-- AvailableQuantity is passed straight through -- it is a real virtual
-- column, computed by Oracle.
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
       -- Derived attribute /CurrentHighestBid/. OUTBID rows are ignored
       -- because by definition they are below the standing bid.
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

-- =====================================================================
-- V_UNIT_UTILIZATION
-- Storage capacity vs current load vs free space, per weak-entity unit.
--
-- The load subquery is an inline view rather than a join + GROUP BY on
-- the outer query, so units holding nothing still appear with load 0.
-- Only open allocations count: DateOut IS NULL means the batch has not
-- left the unit yet.
-- =====================================================================
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
-- PENDING_ACCEPT and PENDING_RELEASE count toward load, not just ACTIVE
-- (added post-Phase-5 with the storage consent workflow): a proposal
-- awaiting the customer's answer has to reserve its space, or two
-- managers could propose the same free capacity to two different
-- customers and both get accepted -- BR-07 has to see the reservation,
-- not just confirmed occupancy. COUNTERED (feedback-batch migration,
-- storage negotiation) is the same case: an allocation mid-negotiation
-- still reserves its space until the counter is accepted or rejected.
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
-- V_BIDDING_SUMMARY
-- The auction board: one row per batch with bid count, bidder count,
-- highest bid and how long the window has left.
--
-- BiddingEndTime is a TIMESTAMP. Subtracting SYSDATE from a TIMESTAMP
-- directly yields an INTERVAL, which is awkward to sort and format, so
-- it is CAST to DATE first -- date arithmetic then gives a plain number
-- of days, multiplied out to hours.
-- =====================================================================
CREATE OR REPLACE VIEW V_BIDDING_SUMMARY AS
SELECT hb.BatchID,
       c.CropName,
       f.FarmName,
       fu.FirstName || ' ' || fu.LastName        AS FarmerName,
       va.AratName,
       hb.Status                                 AS BatchStatus,
       hb.TotalQuantity,
       hb.AvailableQuantity,
       hb.MinimumPrice,
       hb.BiddingStartTime,
       hb.BiddingEndTime,
       NVL(bs.BidCount, 0)                       AS BidCount,
       NVL(bs.BidderCount, 0)                    AS BidderCount,
       bs.HighestBid,
       bs.LowestBid,
       bs.AvgBid,
       -- How far the standing bid sits above the farmer's floor price.
       CASE WHEN bs.HighestBid IS NOT NULL
            THEN ROUND((bs.HighestBid - hb.MinimumPrice) / hb.MinimumPrice * 100, 2)
       END                                       AS PctAboveMinimum,
       CASE
         WHEN hb.BiddingEndTime IS NULL THEN NULL
         WHEN CAST(hb.BiddingEndTime AS DATE) <= SYSDATE THEN 0
         ELSE ROUND((CAST(hb.BiddingEndTime AS DATE) - SYSDATE) * 24, 1)
       END                                       AS HoursRemaining,
       CASE
         WHEN hb.Status IN ('SOLD', 'DELIVERED')                    THEN 'CLOSED - SOLD'
         WHEN hb.BiddingStartTime IS NULL                           THEN 'NOT SCHEDULED'
         WHEN CAST(hb.BiddingStartTime AS DATE) > SYSDATE           THEN 'OPENS LATER'
         WHEN CAST(hb.BiddingEndTime   AS DATE) < SYSDATE           THEN 'CLOSED'
         ELSE 'OPEN NOW'
       END                                       AS BiddingState
FROM   HARVEST_BATCH hb
JOIN   CROP c          ON c.CropID   = hb.CropID
JOIN   FARM f          ON f.FarmID   = hb.FarmID
JOIN   USERS fu        ON fu.UserID  = f.FarmerID
JOIN   VIRTUAL_ARAT va ON va.AratID  = hb.AratID
LEFT   JOIN (
         SELECT BatchID,
                COUNT(*)                  AS BidCount,
                COUNT(DISTINCT BuyerID)   AS BidderCount,
                MAX(BidPricePerKg)        AS HighestBid,
                MIN(BidPricePerKg)        AS LowestBid,
                ROUND(AVG(BidPricePerKg), 2) AS AvgBid
         FROM   BID
         WHERE  Status <> 'WITHDRAWN'
         GROUP  BY BatchID
       ) bs ON bs.BatchID = hb.BatchID;

-- =====================================================================
-- V_FARMER_EARNINGS
-- The farmer dashboard row. LEFT JOINs all the way down so a farmer who
-- has listed nothing still appears with zeros rather than vanishing.
--
-- No fan-out: a batch belongs to one farm, has at most one WON bid, and
-- UQ_ORDER_BID makes a bid map to at most one sale order -- so
-- SUM(so.TotalAmount) counts each order exactly once.
--
-- AmountReceived is a scalar subquery, NOT another join. PAYMENT can
-- hold several instalments per order (order 4 in the seed has two), and
-- joining it here would multiply the sale-order rows and inflate
-- TotalRevenue.
-- =====================================================================
CREATE OR REPLACE VIEW V_FARMER_EARNINGS AS
SELECT fr.FarmerID,
       fu.FirstName || ' ' || fu.LastName        AS FarmerName,
       fu.Address.District AS District,
       fr.ExperienceYears,
       COUNT(DISTINCT f.FarmID)                  AS FarmCount,
       COUNT(DISTINCT hb.BatchID)                AS BatchesListed,
       COUNT(DISTINCT so.SaleOrderID)            AS BatchesSold,
       NVL(SUM(so.AcceptedQuantity), 0)          AS QuantitySoldKg,
       NVL(SUM(so.TotalAmount), 0)               AS TotalRevenue,
       ROUND(AVG(so.AcceptedPricePerKg), 2)      AS AvgPricePerKg,
       (SELECT NVL(SUM(p.Amount), 0)
          FROM PAYMENT p
         WHERE p.FarmerID = fr.FarmerID
           AND p.PaymentStatus IN ('PENDING', 'COMPLETED')) AS AmountReceived,
       NVL(SUM(so.TotalAmount), 0)
         - (SELECT NVL(SUM(p.Amount), 0)
              FROM PAYMENT p
             WHERE p.FarmerID = fr.FarmerID
               AND p.PaymentStatus IN ('PENDING', 'COMPLETED')) AS AmountOutstanding
FROM   FARMER fr
JOIN   USERS fu ON fu.UserID = fr.FarmerID
LEFT   JOIN FARM f          ON f.FarmerID = fr.FarmerID
LEFT   JOIN HARVEST_BATCH hb ON hb.FarmID = f.FarmID
LEFT   JOIN BID b           ON b.BatchID  = hb.BatchID
                           AND b.Status   = 'WON'
LEFT   JOIN SALE_ORDER so   ON so.BidID   = b.BidID
GROUP  BY fr.FarmerID, fu.FirstName, fu.LastName, fu.Address.District, fr.ExperienceYears;

-- =====================================================================
-- V_PENDING_DELIVERY
-- Everything still in flight: sale orders whose transport has not
-- reached DELIVERED, with the driver and vehicle if one is assigned.
--
-- ASSIGNED_TO is LEFT JOINed and filtered to ACTIVE, because a request
-- can legitimately sit in PENDING with no crew yet (seed order 5 did,
-- before it was assigned). Filtering inside the join condition rather
-- than in WHERE keeps those unassigned rows visible.
-- =====================================================================
CREATE OR REPLACE VIEW V_PENDING_DELIVERY AS
SELECT so.SaleOrderID,
       so.OrderDate,
       so.Status                                 AS OrderStatus,
       so.PaymentTerms,
       so.AcceptedQuantity,
       so.AcceptedPricePerKg,
       so.TotalAmount,
       c.CropName,
       fu.FirstName || ' ' || fu.LastName        AS FarmerName,
       bu.FirstName || ' ' || bu.LastName        AS BuyerName,
       byr.BusinessName,
       tr.TransportID,
       tr.PickupLocation,
       tr.DeliveryLocation,
       tr.RequestDate,
       tr.DeliveryStatus,
       v.VehicleNo,
       v.VehicleType,
       v.Capacity                                AS VehicleCapacity,
       pu.FirstName || ' ' || pu.LastName        AS DriverName,
       TRUNC(SYSDATE - tr.RequestDate)           AS DaysSinceRequest,
       -- BR-20: an ON_DELIVERY order cannot be paid until this row
       -- reaches DELIVERED. Surfacing it here explains at a glance why
       -- an order shows zero paid.
       CASE WHEN so.PaymentTerms = 'ON_DELIVERY' THEN 'BLOCKED UNTIL DELIVERED'
            ELSE 'PAYABLE NOW'
       END                                       AS PaymentEligibility
FROM   SALE_ORDER so
JOIN   TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
JOIN   BID b                ON b.BidID        = so.BidID
JOIN   HARVEST_BATCH hb     ON hb.BatchID     = b.BatchID
JOIN   CROP c               ON c.CropID       = hb.CropID
JOIN   FARM f               ON f.FarmID       = hb.FarmID
JOIN   USERS fu             ON fu.UserID      = f.FarmerID
JOIN   BUYER byr            ON byr.BuyerID    = b.BuyerID
JOIN   USERS bu             ON bu.UserID      = b.BuyerID
LEFT   JOIN ASSIGNED_TO at  ON at.TransportID = tr.TransportID
                           AND at.AssignmentStatus = 'ACTIVE'
LEFT   JOIN VEHICLE v       ON v.VehicleID    = at.VehicleID
LEFT   JOIN USERS pu        ON pu.UserID      = at.PersonnelID
WHERE  tr.DeliveryStatus <> 'DELIVERED';

-- =====================================================================
-- VERIFICATION
-- =====================================================================

SET LINESIZE 150
SET PAGESIZE 60
SET FEEDBACK OFF

PROMPT
PROMPT === All six views must be VALID ===
COLUMN view_name FORMAT A24
COLUMN status    FORMAT A10
SELECT object_name AS view_name, status
FROM   user_objects
WHERE  object_type = 'VIEW'
ORDER  BY object_name;

PROMPT
PROMPT === Each must return rows ===
SELECT 'V_USER_PROFILE'       AS view_name, COUNT(*) AS rows_returned FROM V_USER_PROFILE
UNION ALL SELECT 'V_BATCH_AVAILABILITY', COUNT(*) FROM V_BATCH_AVAILABILITY
UNION ALL SELECT 'V_UNIT_UTILIZATION',   COUNT(*) FROM V_UNIT_UTILIZATION
UNION ALL SELECT 'V_BIDDING_SUMMARY',    COUNT(*) FROM V_BIDDING_SUMMARY
UNION ALL SELECT 'V_FARMER_EARNINGS',    COUNT(*) FROM V_FARMER_EARNINGS
UNION ALL SELECT 'V_PENDING_DELIVERY',   COUNT(*) FROM V_PENDING_DELIVERY
ORDER BY 1;

-- =====================================================================
-- End of 04_views.sql — proceed to 05_advanced_queries.sql
-- =====================================================================
