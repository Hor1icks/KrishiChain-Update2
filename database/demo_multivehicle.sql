
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
