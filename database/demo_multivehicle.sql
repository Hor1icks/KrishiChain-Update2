-- Puts transport request 4 back to PENDING with no vehicles, and leaves
-- only two small vehicles available, so no single one covers the load.
-- Undo with: ./db.sh database/03_insert_data.sql

DELETE FROM ASSIGNED_TO WHERE TransportID = 4;
UPDATE TRANSPORT_REQUEST SET DeliveryStatus = 'PENDING' WHERE TransportID = 4;
UPDATE VEHICLE SET Status = 'MAINTENANCE' WHERE VehicleID IN (1, 2, 5);
UPDATE VEHICLE SET Status = 'AVAILABLE'   WHERE VehicleID IN (3, 4);
COMMIT;

SELECT tr.TransportID, so.AcceptedQuantity AS load_kg, tr.DeliveryStatus
FROM   TRANSPORT_REQUEST tr
JOIN   SALE_ORDER so ON so.SaleOrderID = tr.SaleOrderID
WHERE  tr.TransportID = 4;

SELECT VehicleID, VehicleNo, Capacity, Status FROM VEHICLE ORDER BY VehicleID;
