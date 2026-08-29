--  Accepted price per sale vs the arat's published price for the same
SELECT c.CropName             AS crop,
       so.OrderDate           AS sold_on,
       so.AcceptedPricePerKg  AS farmer_got,
       dmp.PricePerKg         AS market_price,
       c.BasePrice            AS floor_price,
       CASE WHEN so.AcceptedPricePerKg > dmp.PricePerKg
            THEN 'BEAT MARKET'
            ELSE 'BELOW MARKET'
       END                    AS verdict
FROM   SALE_ORDER so
JOIN   BID b            ON b.BidID    = so.BidID
JOIN   HARVEST_BATCH hb ON hb.BatchID = b.BatchID
JOIN   CROP c           ON c.CropID   = hb.CropID
JOIN   DAILY_MARKET_PRICE dmp ON  dmp.CropID    = hb.CropID
                             AND  dmp.AratID    = hb.AratID
                             AND  dmp.PriceDate = TRUNC(so.OrderDate)
ORDER  BY so.SaleOrderID;


--  Total earnings per farmer, ranked with RANK().
SELECT u.FirstName || ' ' || u.LastName  AS farmer,
       u.District                        AS district,
       COUNT(so.SaleOrderID)             AS orders,
       SUM(so.TotalAmount)               AS total_earned,
       RANK() OVER (ORDER BY SUM(so.TotalAmount) DESC) AS rank_by_earnings
FROM   SALE_ORDER so
JOIN   BID b            ON b.BidID    = so.BidID
JOIN   HARVEST_BATCH hb ON hb.BatchID = b.BatchID
JOIN   FARM f           ON f.FarmID   = hb.FarmID
JOIN   USERS u          ON u.UserID   = f.FarmerID
GROUP  BY u.FirstName, u.LastName, u.District
ORDER  BY rank_by_earnings;


--  Bidding activity per crop, only crops with 3+ bids (HAVING).
SELECT c.CropName                      AS crop,
       COUNT(b.BidID)                  AS total_bids,
       ROUND(AVG(b.BidPricePerKg), 2)  AS average_bid,
       MAX(b.BidPricePerKg)            AS highest_bid
FROM   BID b
JOIN   HARVEST_BATCH hb ON hb.BatchID = b.BatchID
JOIN   CROP c           ON c.CropID   = hb.CropID
GROUP  BY c.CropName
HAVING COUNT(b.BidID) >= 3
ORDER  BY total_bids DESC;



--  Arat hierarchy, one level, read by joining VIRTUAL_ARAT to itself.
SELECT child.AratName                  AS arat,
       child.District                  AS district,
       parent.AratName                 AS reports_to,
       COUNT(hb.BatchID)               AS batches_listed,
       NVL(SUM(hb.TotalQuantity), 0)   AS volume_kg
FROM   VIRTUAL_ARAT child
LEFT   JOIN VIRTUAL_ARAT parent ON parent.AratID = child.ParentAratID
LEFT   JOIN HARVEST_BATCH hb    ON hb.AratID     = child.AratID
GROUP  BY child.AratName, child.District, parent.AratName
ORDER  BY parent.AratName NULLS FIRST, child.AratName;



-- Delivered trips with vehicle and driver.
SELECT tr.TransportID        AS trip,
       v.VehicleNo           AS vehicle,
       v.VehicleType         AS vehicle_type,
       v.Capacity            AS vehicle_capacity,
       so.AcceptedQuantity   AS load_kg,
       u.FirstName || ' ' || u.LastName AS driver,
       tp.LicenseNo          AS licence,
       tr.DeliveryStatus     AS status
FROM   ASSIGNED_TO a
JOIN   TRANSPORT_REQUEST tr   ON tr.TransportID = a.TransportID
JOIN   VEHICLE v              ON v.VehicleID    = a.VehicleID
JOIN   TRANSPORT_PERSONNEL tp ON tp.PersonnelID = a.PersonnelID
JOIN   USERS u                ON u.UserID       = tp.PersonnelID
JOIN   SALE_ORDER so          ON so.SaleOrderID = tr.SaleOrderID
ORDER  BY tr.TransportID;
