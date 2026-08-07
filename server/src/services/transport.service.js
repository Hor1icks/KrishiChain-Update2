'use strict';

/**
 * Transport module — the last two of the six PRD §9.10 transactions.
 *
 *   #5 Assign transport   INSERT ASSIGNED_TO + UPDATE VEHICLE.Status
 *                         + UPDATE TRANSPORT_REQUEST -> ASSIGNED
 *   #6 Delivery + payment UPDATE TRANSPORT_REQUEST -> DELIVERED
 *                         + UPDATE SALE_ORDER -> COMPLETED + INSERT PAYMENT
 *
 * WHO ASSIGNS. The PRD names no dispatcher role, and the nav in §11.3
 * gives TRANSPORT_PERSONNEL "My Assignments" — so personnel claim an open
 * request themselves, choosing an available vehicle. That keeps the
 * ternary ASSIGNED_TO (request x vehicle x personnel) honest: all three
 * legs are decided in one act by the person accountable for the trip.
 *
 * WHY #6 IS THE DRIVER'S ACTION AND NOT THE BUYER'S. PaymentTerms
 * 'ON_DELIVERY' is cash on delivery — the money changes hands at the
 * doorstep, which is exactly the moment the driver marks the trip
 * delivered. So the three statements really are one atomic act. Payment
 * is still recorded as buyer -> farmer (D-2, no ARAT commission, no
 * escrow); the driver only witnesses it. ADVANCE orders are paid by the
 * buyer before delivery through buyer.service.js payOrder() instead, and
 * for those #6 records the delivery and completes the order without
 * inserting a second PAYMENT row.
 *
 * BR-19 (no overpayment) and BR-20 (nothing before DELIVERED unless
 * ADVANCE) are enforced by trg_payment_biz_rules, the compound trigger —
 * not re-implemented here. The INSERT below deliberately runs while the
 * TRANSPORT_REQUEST row in the same transaction already reads DELIVERED,
 * which is what lets BR-20 pass for an ON_DELIVERY order.
 */

const oracledb = require('oracledb');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

/** Statuses a trip can move through once it has been claimed. */
const ADVANCEABLE = { ASSIGNED: 'PICKED_UP', PICKED_UP: 'IN_TRANSIT' };

async function loadTrip(connection, transportId) {
  const result = await connection.execute(
    `SELECT tr.TransportID, tr.SaleOrderID, tr.DeliveryStatus, tr.DeliveryDate,
            so.Status AS OrderStatus, so.PaymentTerms, so.TotalAmount,
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

/**
 * The assignment row for a trip, if it is still live. Used to prove the
 * caller is the person actually driving it before letting them move it on.
 */
async function loadAssignment(connection, transportId) {
  const result = await connection.execute(
    `SELECT AssignmentID, VehicleID, PersonnelID, AssignmentStatus
       FROM ASSIGNED_TO
      WHERE TransportID = :transportId AND AssignmentStatus = 'ACTIVE'`,
    { transportId }
  );
  return result.rows[0] || null;
}

/** Open work: awarded orders whose transport nobody has claimed yet. */
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
        AND NOT EXISTS (SELECT 1 FROM ASSIGNED_TO a
                         WHERE a.TransportID = tr.TransportID
                           AND a.AssignmentStatus = 'ACTIVE')
      ORDER BY tr.RequestDate, tr.TransportID`
  );
  return result.rows;
}

/** Vehicles free to be claimed, plus the load they would have to carry. */
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

/** Every trip this driver has ever run, newest first. */
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
                  WHERE p.SaleOrderID = so.SaleOrderID
                    AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "paidSoFar"
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

/**
 * PRD §9.10 transaction #5 — Assign transport.
 *
 * BR-18 (vehicle capacity >= load) has no database backstop, and this is
 * the only place it can be enforced: it compares VEHICLE.Capacity against
 * a quantity that lives two joins away in SALE_ORDER. Listed as still
 * unenforced in context.md's open items until now.
 */
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
    if (await loadAssignment(connection, transportId)) {
      throw ApiError.conflict('Another driver has already taken this trip.');
    }

    // FOR UPDATE so two drivers cannot claim the same vehicle at once —
    // the same race the storage module guards against on a unit's load.
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

    const load = await connection.execute(
      `SELECT AcceptedQuantity FROM SALE_ORDER WHERE SaleOrderID = :saleOrderId`,
      { saleOrderId: trip.SALEORDERID }
    );
    const quantity = load.rows[0].ACCEPTEDQUANTITY;
    if (quantity > vehicle.CAPACITY) {
      throw ApiError.businessRule(
        `BR-18: this order is ${quantity} kg but vehicle ${vehicle.VEHICLENO} ` +
          `carries only ${vehicle.CAPACITY} kg.`
      );
    }

    // --- 1. ASSIGNED_TO (the second ternary relationship) -------------
    const assignment = await connection.execute(
      `INSERT INTO ASSIGNED_TO (TransportID, VehicleID, PersonnelID, AssignmentStatus)
       VALUES (:transportId, :vehicleId, :personnelId, 'ACTIVE')
       RETURNING AssignmentID INTO :assignmentId`,
      {
        transportId,
        vehicleId,
        personnelId,
        assignmentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    // --- 2. VEHICLE.Status -------------------------------------------
    await connection.execute(
      `UPDATE VEHICLE SET Status = 'ASSIGNED' WHERE VehicleID = :vehicleId`,
      { vehicleId }
    );

    // --- 3. TRANSPORT_REQUEST -> ASSIGNED ----------------------------
    await connection.execute(
      `UPDATE TRANSPORT_REQUEST SET DeliveryStatus = 'ASSIGNED'
        WHERE TransportID = :transportId`,
      { transportId }
    );

    return {
      assignmentId: assignment.outBinds.assignmentId[0],
      transportId,
      vehicleId,
      vehicleNo: vehicle.VEHICLENO,
      quantity,
      capacity: vehicle.CAPACITY,
      deliveryStatus: 'ASSIGNED',
    };
  });
}

/**
 * Move a claimed trip one step along: ASSIGNED -> PICKED_UP -> IN_TRANSIT.
 * Single statement, so no transaction wrapper — DELIVERED is not reachable
 * here, it belongs to complete() below because it drags two other tables
 * with it.
 */
async function advance(personnelId, transportId) {
  return withTransaction(async (connection) => {
    const trip = await loadTrip(connection, transportId);
    const assignment = await loadAssignment(connection, transportId);

    if (!assignment) throw ApiError.notFound('This trip has no active assignment.');
    if (assignment.PERSONNELID !== personnelId) {
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

    // The order follows the goods: once it is physically moving, the
    // buyer's order should not still read CONFIRMED.
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

/**
 * PRD §9.10 transaction #6 — Delivery + payment.
 *
 * For an ON_DELIVERY order the driver collects the balance at the door,
 * so all three statements commit together. For an ADVANCE order the buyer
 * has already paid; the PAYMENT insert is skipped and only the delivery
 * and the order status move. Either way the vehicle is released and the
 * assignment closed, or none of it happens.
 */
async function complete(personnelId, transportId, payload = {}) {
  return withTransaction(async (connection) => {
    const trip = await loadTrip(connection, transportId);
    const assignment = await loadAssignment(connection, transportId);

    if (!assignment) throw ApiError.notFound('This trip has no active assignment.');
    if (assignment.PERSONNELID !== personnelId) {
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

    // --- 1. TRANSPORT_REQUEST -> DELIVERED ---------------------------
    // Written FIRST on purpose: BR-20's trigger reads TRANSPORT_REQUEST
    // when the PAYMENT row lands below, and inside one transaction it
    // sees this uncommitted value. Reordering these two would make an
    // ON_DELIVERY payment fail with ORA-20002.
    await connection.execute(
      `UPDATE TRANSPORT_REQUEST
          SET DeliveryStatus = 'DELIVERED', DeliveryDate = TRUNC(SYSDATE)
        WHERE TransportID = :transportId`,
      { transportId }
    );

    // --- 2. PAYMENT (ON_DELIVERY only) -------------------------------
    let payment = null;
    if (outstanding > 0 && trip.PAYMENTTERMS === 'ON_DELIVERY') {
      const method = payload.paymentMethod || 'CASH';
      const reference = `COD-${Date.now()}-${trip.SALEORDERID}`;
      const inserted = await connection.execute(
        `INSERT INTO PAYMENT (SaleOrderID, BuyerID, FarmerID, Amount,
                              PaymentMethod, TransactionReference, PaymentStatus)
         VALUES (:saleOrderId, :buyerId, :farmerId, :amount,
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

    // --- 3. SALE_ORDER -> COMPLETED ----------------------------------
    // Only once the money is actually all in. An ADVANCE order that was
    // never fully paid stays IN_TRANSIT rather than quietly completing.
    const settled = payment !== null || outstanding <= 0;
    if (settled) {
      await connection.execute(
        `UPDATE SALE_ORDER SET Status = 'COMPLETED' WHERE SaleOrderID = :saleOrderId`,
        { saleOrderId: trip.SALEORDERID }
      );
    }

    // Housekeeping that makes the module reusable: close the assignment
    // and hand the vehicle back, otherwise it can never be claimed again.
    await connection.execute(
      `UPDATE ASSIGNED_TO SET AssignmentStatus = 'COMPLETED'
        WHERE AssignmentID = :assignmentId`,
      { assignmentId: assignment.ASSIGNMENTID }
    );
    await connection.execute(
      `UPDATE VEHICLE SET Status = 'AVAILABLE' WHERE VehicleID = :vehicleId`,
      { vehicleId: assignment.VEHICLEID }
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
