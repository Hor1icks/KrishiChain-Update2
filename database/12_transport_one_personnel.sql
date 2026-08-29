-- =====================================================================
-- KrishiChain | 12_transport_one_personnel.sql
--
-- One sale order raises one transport request, and that request belongs
-- to exactly ONE transport person. They may then spread the load across
-- as many of their own vehicles as it takes, but two people never share
-- a request.
--
-- ASSIGNED_TO stays a ternary (request x vehicle x personnel) because
-- the vehicle and the person are both recorded per row. What changes is
-- the uniqueness: the same vehicle cannot appear twice on one request,
-- and a trigger holds the request to a single person.
-- =====================================================================

SET DEFINE OFF
SET SERVEROUTPUT ON

DECLARE
  n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name = 'UQ_ASSIGNED_TRIPLE';
  IF n = 1 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE ASSIGNED_TO DROP CONSTRAINT UQ_ASSIGNED_TRIPLE';
  END IF;

  SELECT COUNT(*) INTO n FROM user_constraints WHERE constraint_name = 'UQ_ASSIGNED_VEHICLE';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE ASSIGNED_TO ADD CONSTRAINT UQ_ASSIGNED_VEHICLE
                       UNIQUE (TransportID, VehicleID)';
  END IF;
END;
/

UPDATE ASSIGNED_TO a
   SET PersonnelID = (SELECT MIN(a2.PersonnelID) FROM ASSIGNED_TO a2
                       WHERE a2.TransportID = a.TransportID)
 WHERE PersonnelID <> (SELECT MIN(a2.PersonnelID) FROM ASSIGNED_TO a2
                        WHERE a2.TransportID = a.TransportID);

COMMIT;

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


PROMPT
PROMPT ================ one request, one person ================
SELECT a.TransportID,
       COUNT(*)                        AS vehicles,
       COUNT(DISTINCT a.PersonnelID)   AS people,
       SUM(v.Capacity)                 AS fleet_capacity,
       so.AcceptedQuantity             AS load_kg
FROM   ASSIGNED_TO a
JOIN   VEHICLE v          ON v.VehicleID    = a.VehicleID
JOIN   TRANSPORT_REQUEST tr ON tr.TransportID = a.TransportID
JOIN   SALE_ORDER so      ON so.SaleOrderID = tr.SaleOrderID
GROUP  BY a.TransportID, so.AcceptedQuantity
ORDER  BY a.TransportID;
