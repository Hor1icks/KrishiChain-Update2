'use strict';


const oracledb = require('oracledb');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

const ADVANCEABLE = { ASSIGNED: 'PICKED_UP', PICKED_UP: 'IN_TRANSIT' };

async function loadTrip(connection, transportId) {
  const result = await connection.execute(
    `SELECT tr.TransportID, tr.SaleOrderID, tr.DeliveryStatus, tr.DeliveryDate,
            so.Status AS OrderStatus, so.PaymentTerms, so.TotalAmount,
            so.DeliveryPreference,
            b.BuyerID, f.FarmerID
       FROM TRANSPORT_REQUEST tr
       JOIN SALE_ORDER so    ON so.SaleOrderID = tr.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
      WHERE tr.TransportID = :transportId
        FOR UPDATE OF tr.DeliveryStatus`,
    { transportId }
  );
  if (!result.rows.length) throw ApiError.notFound('No such transport request.');
  return result.rows[0];
}

async function driverOnTrip(connection, transportId, personnelId) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS N FROM ASSIGNED_TO
      WHERE TransportID = :transportId AND PersonnelID = :personnelId
        AND AssignmentStatus = 'ACTIVE'`,
    { transportId, personnelId }
  );
  return result.rows[0].N > 0;
}

async function tripHolder(connection, transportId) {
  const result = await connection.execute(
    `SELECT MIN(PersonnelID) AS HOLDER FROM ASSIGNED_TO
      WHERE TransportID = :transportId AND AssignmentStatus = 'ACTIVE'`,
    { transportId }
  );
  return result.rows[0].HOLDER;
}

async function assignedCapacity(connection, transportId) {
  const result = await connection.execute(
    `SELECT NVL(SUM(v.Capacity), 0) AS CAP
       FROM ASSIGNED_TO a
       JOIN VEHICLE v ON v.VehicleID = a.VehicleID
      WHERE a.TransportID = :transportId AND a.AssignmentStatus = 'ACTIVE'`,
    { transportId }
  );
  return result.rows[0].CAP;
}

async function listOpenRequests() {
  const result = await query(
    `SELECT tr.TransportID      AS "transportId",
            tr.SaleOrderID      AS "saleOrderId",
            tr.PickupLocation   AS "pickupLocation",
            tr.DeliveryLocation AS "deliveryLocation",
            tr.RequestDate      AS "requestDate",
            tr.DeliveryStatus   AS "deliveryStatus",
            c.CropName          AS "cropName",
            so.AcceptedQuantity AS "quantity",
            NVL((SELECT SUM(v.Capacity) FROM ASSIGNED_TO a
                   JOIN VEHICLE v ON v.VehicleID = a.VehicleID
                  WHERE a.TransportID = tr.TransportID
                    AND a.AssignmentStatus = 'ACTIVE'), 0) AS "assignedCapacity",
            so.TotalAmount      AS "totalAmount",
            so.PaymentTerms     AS "paymentTerms",
            uf.FirstName || ' ' || uf.LastName AS "farmerName",
            NVL(byr.BusinessName, ub.FirstName || ' ' || ub.LastName) AS "buyerName"
       FROM TRANSPORT_REQUEST tr
       JOIN SALE_ORDER so    ON so.SaleOrderID = tr.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN CROP c           ON c.CropID       = hb.CropID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
       JOIN USERS uf         ON uf.UserID      = f.FarmerID
       JOIN BUYER byr        ON byr.BuyerID    = b.BuyerID
       JOIN USERS ub         ON ub.UserID      = byr.BuyerID
      WHERE tr.DeliveryStatus = 'PENDING'
        AND so.DeliveryPreference IN ('DIRECT', 'VIA_STORAGE')
        AND NVL((SELECT SUM(v.Capacity) FROM ASSIGNED_TO a
                   JOIN VEHICLE v ON v.VehicleID = a.VehicleID
                  WHERE a.TransportID = tr.TransportID
                    AND a.AssignmentStatus = 'ACTIVE'), 0) < so.AcceptedQuantity
      ORDER BY tr.RequestDate, tr.TransportID`
  );
  return result.rows;
}

async function listAvailableVehicles() {
  const result = await query(
    `SELECT VehicleID   AS "vehicleId",
            VehicleNo   AS "vehicleNo",
            VehicleType AS "vehicleType",
            Capacity    AS "capacity",
            Status      AS "status"
       FROM VEHICLE
      WHERE Status = 'AVAILABLE'
      ORDER BY Capacity DESC, VehicleID`
  );
  return result.rows;
}

async function listMyAssignments(personnelId) {
  const result = await query(
    `SELECT a.AssignmentID     AS "assignmentId",
            a.AssignedDate     AS "assignedDate",
            a.AssignmentStatus AS "assignmentStatus",
            tr.TransportID     AS "transportId",
            tr.SaleOrderID     AS "saleOrderId",
            tr.PickupLocation  AS "pickupLocation",
            tr.DeliveryLocation AS "deliveryLocation",
            tr.DeliveryStatus  AS "deliveryStatus",
            tr.DeliveryDate    AS "deliveryDate",
            v.VehicleNo        AS "vehicleNo",
            v.Capacity         AS "vehicleCapacity",
            c.CropName         AS "cropName",
            so.AcceptedQuantity AS "quantity",
            so.TotalAmount     AS "totalAmount",
            so.PaymentTerms    AS "paymentTerms",
            so.Status          AS "orderStatus",
            uf.FirstName || ' ' || uf.LastName AS "farmerName",
            NVL(byr.BusinessName, ub.FirstName || ' ' || ub.LastName) AS "buyerName",
            NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                  WHERE p.PaymentType = 'SALE'
                    AND p.SaleOrderID = so.SaleOrderID
                    AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "paidSoFar",
            (SELECT COUNT(*) FROM ASSIGNED_TO a2
              WHERE a2.TransportID = tr.TransportID
                AND a2.AssignmentStatus = a.AssignmentStatus) AS "vehicleCount",
            (SELECT SUM(v2.Capacity) FROM ASSIGNED_TO a2
               JOIN VEHICLE v2 ON v2.VehicleID = a2.VehicleID
              WHERE a2.TransportID = tr.TransportID
                AND a2.AssignmentStatus = a.AssignmentStatus) AS "fleetCapacity",
            (SELECT LISTAGG(v2.VehicleNo, ', ') WITHIN GROUP (ORDER BY v2.VehicleNo)
               FROM ASSIGNED_TO a2
               JOIN VEHICLE v2 ON v2.VehicleID = a2.VehicleID
              WHERE a2.TransportID = tr.TransportID
                AND a2.AssignmentStatus = a.AssignmentStatus) AS "fleetVehicles"
       FROM ASSIGNED_TO a
       JOIN TRANSPORT_REQUEST tr ON tr.TransportID = a.TransportID
       JOIN VEHICLE v        ON v.VehicleID    = a.VehicleID
       JOIN SALE_ORDER so    ON so.SaleOrderID = tr.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN CROP c           ON c.CropID       = hb.CropID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
       JOIN USERS uf         ON uf.UserID      = f.FarmerID
       JOIN BUYER byr        ON byr.BuyerID    = b.BuyerID
       JOIN USERS ub         ON ub.UserID      = byr.BuyerID
      WHERE a.PersonnelID = :personnelId
      ORDER BY a.AssignmentID DESC`,
    { personnelId }
  );
  return result.rows;
}

async function getSummary(personnelId) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM TRANSPORT_REQUEST tr
         WHERE tr.DeliveryStatus = 'PENDING'
           AND NOT EXISTS (SELECT 1 FROM ASSIGNED_TO a
                            WHERE a.TransportID = tr.TransportID
                              AND a.AssignmentStatus = 'ACTIVE')) AS "openRequests",
       (SELECT COUNT(*) FROM ASSIGNED_TO a
         WHERE a.PersonnelID = :personnelId AND a.AssignmentStatus = 'ACTIVE') AS "activeTrips",
       (SELECT COUNT(*) FROM ASSIGNED_TO a
         WHERE a.PersonnelID = :personnelId AND a.AssignmentStatus = 'COMPLETED') AS "completedTrips",
       (SELECT COUNT(*) FROM VEHICLE WHERE Status = 'AVAILABLE') AS "vehiclesAvailable",
       (SELECT NVL(SUM(so.AcceptedQuantity), 0)
          FROM ASSIGNED_TO a
          JOIN TRANSPORT_REQUEST tr ON tr.TransportID = a.TransportID
          JOIN SALE_ORDER so ON so.SaleOrderID = tr.SaleOrderID
         WHERE a.PersonnelID = :personnelId AND a.AssignmentStatus = 'COMPLETED') AS "kgDelivered"
     FROM dual`,
    { personnelId }
  );
  return result.rows[0];
}

async function claim(personnelId, payload) {
  const transportId = Number(payload.transportId);
  const vehicleId = Number(payload.vehicleId);
  if (!transportId || !vehicleId) {
    throw ApiError.badRequest('transportId and vehicleId are required.');
  }

  return withTransaction(async (connection) => {
    const trip = await loadTrip(connection, transportId);

    if (trip.DELIVERYSTATUS !== 'PENDING') {
      throw ApiError.businessRule(
        `Transport #${transportId} is already ${trip.DELIVERYSTATUS} — nothing to claim.`
      );
    }
    if (!['DIRECT', 'VIA_STORAGE'].includes(trip.DELIVERYPREFERENCE)) {
      throw ApiError.businessRule(
        `The buyer has not settled where order #${trip.SALEORDERID} is going yet — ` +
          `it needs a direct-delivery choice or an accepted storage allocation first.`
      );
    }
    const load = await connection.execute(
      `SELECT AcceptedQuantity FROM SALE_ORDER WHERE SaleOrderID = :saleOrderId`,
      { saleOrderId: trip.SALEORDERID }
    );
    const quantity = load.rows[0].ACCEPTEDQUANTITY;
    const alreadyAssigned = await assignedCapacity(connection, transportId);

    const holder = await tripHolder(connection, transportId);
    if (holder !== null && holder !== personnelId) {
      throw ApiError.conflict('Another transport operator has already taken this request.');
    }
    if (alreadyAssigned >= quantity) {
      throw ApiError.conflict('This request already has enough capacity on it.');
    }

    const vehicleResult = await connection.execute(
      `SELECT VehicleID, VehicleNo, Capacity, Status FROM VEHICLE
        WHERE VehicleID = :vehicleId FOR UPDATE`,
      { vehicleId }
    );
    if (!vehicleResult.rows.length) throw ApiError.notFound('No such vehicle.');
    const vehicle = vehicleResult.rows[0];
    if (vehicle.STATUS !== 'AVAILABLE') {
      throw ApiError.businessRule(`Vehicle ${vehicle.VEHICLENO} is ${vehicle.STATUS}.`);
    }

    const totalCapacity = alreadyAssigned + vehicle.CAPACITY;


    await connection.execute(
      `BEGIN pkg_krishi_rules.check_one_personnel(:transportId, :personnelId); END;`,
      { transportId, personnelId }
    );

    const assignment = await connection.execute(
      `INSERT INTO ASSIGNED_TO (AssignmentID, TransportID, VehicleID, PersonnelID, AssignmentStatus)
       VALUES ((SELECT NVL(MAX(AssignmentID), 0) + 1 FROM ASSIGNED_TO), :transportId, :vehicleId, :personnelId, 'ACTIVE')
       RETURNING AssignmentID INTO :assignmentId`,
      {
        transportId,
        vehicleId,
        personnelId,
        assignmentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    await connection.execute(
      `UPDATE VEHICLE SET Status = 'ASSIGNED' WHERE VehicleID = :vehicleId`,
      { vehicleId }
    );

    const covered = totalCapacity >= quantity;
    if (covered) {
      await connection.execute(
        `UPDATE TRANSPORT_REQUEST SET DeliveryStatus = 'ASSIGNED'
          WHERE TransportID = :transportId`,
        { transportId }
      );
    }

    return {
      assignmentId: assignment.outBinds.assignmentId[0],
      transportId,
      vehicleId,
      vehicleNo: vehicle.VEHICLENO,
      quantity,
      capacity: vehicle.CAPACITY,
      assignedCapacity: totalCapacity,
      remainingKg: Math.max(0, quantity - totalCapacity),
      deliveryStatus: covered ? 'ASSIGNED' : 'PENDING',
    };
  });
}

async function advance(personnelId, transportId) {
  return withTransaction(async (connection) => {
    const trip = await loadTrip(connection, transportId);
    if (!(await driverOnTrip(connection, transportId, personnelId))) {
      throw ApiError.forbidden('This is not your trip.');
    }

    const next = ADVANCEABLE[trip.DELIVERYSTATUS];
    if (!next) {
      throw ApiError.businessRule(
        `A trip that is ${trip.DELIVERYSTATUS} cannot be advanced from here.`
      );
    }

    await connection.execute(
      `UPDATE TRANSPORT_REQUEST SET DeliveryStatus = :next WHERE TransportID = :transportId`,
      { next, transportId }
    );

    if (next === 'IN_TRANSIT') {
      await connection.execute(
        `UPDATE SALE_ORDER SET Status = 'IN_TRANSIT'
          WHERE SaleOrderID = :saleOrderId AND Status = 'CONFIRMED'`,
        { saleOrderId: trip.SALEORDERID }
      );
    }

    return { transportId, deliveryStatus: next };
  });
}

async function complete(personnelId, transportId, payload = {}) {
  return withTransaction(async (connection) => {
    const trip = await loadTrip(connection, transportId);
    if (!(await driverOnTrip(connection, transportId, personnelId))) {
      throw ApiError.forbidden('This is not your trip.');
    }
    if (trip.DELIVERYSTATUS === 'DELIVERED') {
      throw ApiError.businessRule('This trip is already delivered.');
    }
    if (trip.DELIVERYSTATUS === 'PENDING') {
      throw ApiError.businessRule('Claim the trip before delivering it.');
    }

    const paidResult = await connection.execute(
      `SELECT NVL(SUM(Amount), 0) AS Paid FROM PAYMENT
        WHERE SaleOrderID = :saleOrderId AND PaymentStatus IN ('PENDING','COMPLETED')`,
      { saleOrderId: trip.SALEORDERID }
    );
    const alreadyPaid = paidResult.rows[0].PAID;
    const outstanding = Number((trip.TOTALAMOUNT - alreadyPaid).toFixed(2));

    await connection.execute(
      `UPDATE TRANSPORT_REQUEST
          SET DeliveryStatus = 'DELIVERED', DeliveryDate = TRUNC(SYSDATE)
        WHERE TransportID = :transportId`,
      { transportId }
    );

    let payment = null;
    if (outstanding > 0 && trip.PAYMENTTERMS === 'ON_DELIVERY') {
      const method = payload.paymentMethod || 'CASH';
      const reference = `COD-${Date.now()}-${trip.SALEORDERID}`;

      await connection.execute(
        `BEGIN pkg_krishi_rules.check_payment_allowed(:saleOrderId, :amount); END;`,
        { saleOrderId: trip.SALEORDERID, amount: outstanding }
      );

      const inserted = await connection.execute(
        `INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount,
                              PaymentMethod, TransactionReference, PaymentStatus)
         VALUES ((SELECT NVL(MAX(PaymentID), 0) + 1 FROM PAYMENT), :saleOrderId, :buyerId, :farmerId, :amount,
                 :method, :reference, 'COMPLETED')
         RETURNING PaymentID INTO :paymentId`,
        {
          saleOrderId: trip.SALEORDERID,
          buyerId: trip.BUYERID,
          farmerId: trip.FARMERID,
          amount: outstanding,
          method,
          reference,
          paymentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
      );
      payment = {
        paymentId: inserted.outBinds.paymentId[0],
        amount: outstanding,
        method,
        reference,
      };
    }

    const settled = payment !== null || outstanding <= 0;
    if (settled) {
      await connection.execute(
        `UPDATE SALE_ORDER SET Status = 'COMPLETED' WHERE SaleOrderID = :saleOrderId`,
        { saleOrderId: trip.SALEORDERID }
      );
    }

    await connection.execute(
      `UPDATE VEHICLE SET Status = 'AVAILABLE'
        WHERE VehicleID IN (SELECT VehicleID FROM ASSIGNED_TO
                             WHERE TransportID = :transportId
                               AND AssignmentStatus = 'ACTIVE')`,
      { transportId }
    );
    await connection.execute(
      `UPDATE ASSIGNED_TO SET AssignmentStatus = 'COMPLETED'
        WHERE TransportID = :transportId AND AssignmentStatus = 'ACTIVE'`,
      { transportId }
    );

    return {
      transportId,
      saleOrderId: trip.SALEORDERID,
      deliveryStatus: 'DELIVERED',
      orderStatus: settled ? 'COMPLETED' : 'IN_TRANSIT',
      paymentTerms: trip.PAYMENTTERMS,
      totalAmount: trip.TOTALAMOUNT,
      alreadyPaid,
      payment,
      outstanding: settled ? 0 : outstanding,
    };
  });
}

module.exports = {
  listOpenRequests,
  listAvailableVehicles,
  listMyAssignments,
  getSummary,
  claim,
  advance,
  complete,
};
