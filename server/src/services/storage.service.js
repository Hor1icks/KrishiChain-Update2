'use strict';

/**
 * Storage manager module — now with the consent workflow and storage
 * fees added post-Phase-5 (database/06_storage_workflow.sql). Not on
 * the original ER diagram; see context.md for the full design note.
 *
 * TWO STORAGE LEGS, ONE MECHANISM. A batch can sit in storage twice:
 *   LEG 1 (pre-sale)  — the farmer's local storage. Customer = FARMER.
 *   LEG 2 (post-sale) — the buyer's local storage, once bought and
 *                        moving toward them. Customer = BUYER.
 * Same STORES table, same ternary, just a second row when it applies.
 * Every function below is written once and branches on which customer
 * type applies, rather than duplicating the logic per leg.
 *
 * THE STATE MACHINE:
 *   PENDING_ACCEPT -> ACTIVE -> PENDING_RELEASE -> COMPLETED
 *                  \-> REJECTED           (customer declined the proposal)
 *                  \-> CANCELLED          (manager withdrew, unaccepted)
 * A manager PROPOSES (picks a unit, sets MinimumStorageDays); the
 * customer must ACCEPT before it becomes real. Releasing forks on
 * whether that minimum term (MinimumReleaseDate = DateIn +
 * MinimumStorageDays) has been honored:
 *   fulfilled     -> either party releases directly, one step
 *   NOT fulfilled -> the other party must explicitly approve
 * SF-01 (new rule, not a PRD BR-number): the storage fee must be paid
 * before a release can finalize, checked at the one place that actually
 * sets COMPLETED regardless of which path got there.
 *
 * OWNERSHIP (PRD §5, unchanged): a storage manager touches only units
 * inside the warehouse they manage. Re-derived from the verified token
 * on every write, never trusted from the request body.
 */

const oracledb = require('oracledb');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

async function assertManagesWarehouse(connection, managerId, warehouseId) {
  const result = await connection.execute(
    `SELECT WarehouseID FROM WAREHOUSE
      WHERE WarehouseID = :warehouseId AND ManagerID = :managerId`,
    { warehouseId, managerId }
  );
  if (!result.rows.length) {
    throw ApiError.notFound('No such warehouse.');
  }
}

/**
 * Current load of one unit: PENDING_ACCEPT + ACTIVE + PENDING_RELEASE +
 * COUNTERED. A proposal awaiting an answer has to reserve its space (see
 * V_UNIT_UTILIZATION's matching comment) or two proposals could both
 * pass BR-07 and both get accepted into the same space. COUNTERED is the
 * same case — an allocation mid-negotiation still reserves its space
 * until the counter is accepted or rejected.
 */
async function unitLoad(connection, warehouseId, unitNo) {
  const result = await connection.execute(
    `SELECT NVL(SUM(QuantityStored), 0) AS Load
       FROM STORES
      WHERE WarehouseID = :warehouseId
        AND UnitNo      = :unitNo
        AND DateOut IS NULL
        AND AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COUNTERED')`,
    { warehouseId, unitNo }
  );
  return result.rows[0].LOAD;
}

async function refreshUnitStatus(connection, warehouseId, unitNo) {
  const load = await unitLoad(connection, warehouseId, unitNo);
  const unit = await connection.execute(
    `SELECT Capacity, Status FROM STORAGE_UNIT
      WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo`,
    { warehouseId, unitNo }
  );
  if (unit.rows[0].STATUS === 'MAINTENANCE') return;

  const capacity = unit.rows[0].CAPACITY;
  const status = load <= 0 ? 'EMPTY' : load >= capacity ? 'FULL' : 'PARTIAL';

  await connection.execute(
    `UPDATE STORAGE_UNIT SET Status = :status
      WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo`,
    { status, warehouseId, unitNo }
  );
}

/**
 * Loads one allocation and everything a caller needs to authorize
 * itself against it: which manager's warehouse it is in, and which
 * farmer or buyer is its customer.
 */
async function loadAllocation(connection, allocationId) {
  const result = await connection.execute(
    `SELECT s.AllocationID, s.BatchID, s.WarehouseID, s.UnitNo, s.ManagerID,
            s.QuantityStored, s.DateIn, s.DateOut, s.AllocationStatus,
            s.RequestedByFarmerID, s.RequestedByBuyerID, s.SaleOrderID,
            s.MinimumStorageDays, s.MinimumReleaseDate,
            s.StorageFeePerKgSnapshot, s.StorageFee, s.ReleaseRequestedBy,
            s.ProposedBy, s.CounterRatePerKg, s.CounteredBy,
            w.ManagerID AS WarehouseManagerID
       FROM STORES s
       JOIN WAREHOUSE w ON w.WarehouseID = s.WarehouseID
      WHERE s.AllocationID = :allocationId`,
    { allocationId }
  );
  if (!result.rows.length) throw ApiError.notFound('No such allocation.');
  return result.rows[0];
}

function assertIsCustomer(allocation, customerType, customerId) {
  const owns =
    (customerType === 'FARMER' && allocation.REQUESTEDBYFARMERID === customerId) ||
    (customerType === 'BUYER' && allocation.REQUESTEDBYBUYERID === customerId);
  if (!owns) throw ApiError.notFound('No such storage proposal.');
}

/**
 * Whoever did NOT open the offer is the one entitled to answer it.
 * ProposedBy records which side started, so the responder is always the
 * other one. Enforced here rather than by hiding a button, so a direct
 * API call cannot let a manager accept their own proposal.
 */
function assertIsResponder(allocation, responderType, responderId) {
  if (allocation.PROPOSEDBY === 'MANAGER') {
    if (responderType === 'MANAGER') {
      throw ApiError.businessRule('You made this proposal — the customer has to answer it.');
    }
    assertIsCustomer(allocation, responderType, responderId);
    return;
  }
  if (responderType !== 'MANAGER') {
    throw ApiError.businessRule('You made this request — the storage manager has to answer it.');
  }
  if (allocation.WAREHOUSEMANAGERID !== responderId) {
    throw ApiError.notFound('No such storage request.');
  }
}

/**
 * The single place an allocation becomes real. Three paths reach it — a
 * straight ACCEPT, an ACCEPT of a counter-offer, and a manager accepting
 * a customer-initiated request — and writing it once is what keeps the
 * leg-1 batch promotion and the leg-2 transport unlock from drifting
 * apart between them.
 *
 * `agreedRate` is whatever both sides actually settled on: the original
 * snapshot for a plain accept, the countered rate when a negotiation
 * round happened. StorageFee is a virtual column derived from
 * StorageFeePerKgSnapshot, so writing the snapshot re-derives the fee.
 */
async function finalizeAcceptance(connection, allocation, agreedRate) {
  const allocationId = allocation.ALLOCATIONID;

  await connection.execute(
    `UPDATE STORES
        SET AllocationStatus        = 'ACTIVE',
            DateIn                  = TRUNC(SYSDATE),
            StorageFeePerKgSnapshot = :agreedRate
      WHERE AllocationID = :allocationId`,
    { agreedRate, allocationId }
  );
  await refreshUnitStatus(connection, allocation.WAREHOUSEID, allocation.UNITNO);

  if (!allocation.SALEORDERID) {
    // Leg 1 only, and only from CREATED — a batch already LISTED or
    // BIDDING_OPEN keeps that status, or accepting storage would pull a
    // live auction off the buyers' listings.
    const batch = await connection.execute(
      `SELECT Status FROM HARVEST_BATCH WHERE BatchID = :batchId`,
      { batchId: allocation.BATCHID }
    );
    if (batch.rows[0].STATUS === 'CREATED') {
      await connection.execute(
        `UPDATE HARVEST_BATCH SET Status = 'STORED' WHERE BatchID = :batchId`,
        { batchId: allocation.BATCHID }
      );
    }
    return;
  }

  // Leg 2: the buyer now has a confirmed destination for this order,
  // which is precisely what releases its transport request for drivers
  // to claim (see transport.service.js listOpenRequests) and gives the
  // trip a real address to drive to.
  const warehouse = await connection.execute(
    `SELECT WarehouseName, Address, District FROM WAREHOUSE WHERE WarehouseID = :warehouseId`,
    { warehouseId: allocation.WAREHOUSEID }
  );
  const w = warehouse.rows[0];
  const destination = [w.WAREHOUSENAME, w.ADDRESS, w.DISTRICT].filter(Boolean).join(', ');

  await connection.execute(
    `UPDATE SALE_ORDER SET DeliveryPreference = 'VIA_STORAGE'
      WHERE SaleOrderID = :saleOrderId AND DeliveryPreference = 'PENDING'`,
    { saleOrderId: allocation.SALEORDERID }
  );
  // SUBSTR at the SQL level rather than trusting the JS string length —
  // DeliveryLocation is VARCHAR2(200) and a long warehouse address would
  // otherwise fail the whole acceptance with ORA-12899.
  await connection.execute(
    `UPDATE TRANSPORT_REQUEST SET DeliveryLocation = SUBSTR(:destination, 1, 200)
      WHERE SaleOrderID = :saleOrderId AND DeliveryStatus = 'PENDING'`,
    { destination, saleOrderId: allocation.SALEORDERID }
  );
}

/**
 * SF-01: the storage fee must be settled before a release can finalize.
 * The only place DateOut/COMPLETED get written, so both release paths
 * (direct, post-term; and approved, pre-term) go through here.
 */
async function completeRelease(connection, allocation) {
  const paid = await connection.execute(
    `SELECT NVL(SUM(Amount), 0) AS Paid FROM PAYMENT
      WHERE PaymentType = 'STORAGE' AND AllocationID = :allocationId
        AND PaymentStatus IN ('PENDING', 'COMPLETED')`,
    { allocationId: allocation.ALLOCATIONID }
  );
  const owed = allocation.STORAGEFEE || 0;
  if (paid.rows[0].PAID < owed) {
    throw ApiError.businessRule(
      `SF-01: the storage fee of ${owed} for this allocation is not fully paid ` +
        `(${paid.rows[0].PAID} paid so far). Settle it before release.`
    );
  }

  await connection.execute(
    `UPDATE STORES
        SET DateOut = TRUNC(SYSDATE), AllocationStatus = 'COMPLETED', ReleaseRequestedBy = NULL
      WHERE AllocationID = :allocationId`,
    { allocationId: allocation.ALLOCATIONID }
  );
  await refreshUnitStatus(connection, allocation.WAREHOUSEID, allocation.UNITNO);
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

async function getDashboard(managerId) {
  const summary = await query(
    `SELECT COUNT(DISTINCT WarehouseID) AS "warehouseCount",
            COUNT(*)                    AS "unitCount",
            NVL(SUM(UnitCapacity), 0)   AS "totalCapacity",
            NVL(SUM(CurrentLoad), 0)    AS "totalLoad",
            NVL(SUM(FreeSpace), 0)      AS "totalFree"
       FROM V_UNIT_UTILIZATION
      WHERE ManagerID = :managerId`,
    { managerId }
  );

  const byAlert = await query(
    `SELECT AlertLevel AS "alertLevel", COUNT(*) AS "count"
       FROM V_UNIT_UTILIZATION
      WHERE ManagerID = :managerId
      GROUP BY AlertLevel
      ORDER BY AlertLevel`,
    { managerId }
  );

  const attention = await query(
    `SELECT WarehouseID    AS "warehouseId",
            WarehouseName  AS "warehouseName",
            UnitNo         AS "unitNo",
            UnitCapacity   AS "capacity",
            CurrentLoad    AS "currentLoad",
            FreeSpace      AS "freeSpace",
            UtilizationPct AS "utilizationPct",
            AlertLevel     AS "alertLevel",
            UnitStatus     AS "unitStatus"
       FROM V_UNIT_UTILIZATION
      WHERE ManagerID = :managerId
        AND AlertLevel IN ('CRITICAL', 'HIGH')
      ORDER BY UtilizationPct DESC`,
    { managerId }
  );

  const pending1 = await query(`SELECT COUNT(*) AS "count" FROM (${LEG1_BASE_SQL})`);
  const pending2 = await query(`SELECT COUNT(*) AS "count" FROM (${LEG2_BASE_SQL})`);

  const actionNeeded = await query(
    `SELECT COUNT(*) AS "count" FROM STORES s
       JOIN WAREHOUSE w ON w.WarehouseID = s.WarehouseID
      WHERE w.ManagerID = :managerId
        AND s.AllocationStatus = 'PENDING_RELEASE'
        AND s.ReleaseRequestedBy IN ('FARMER', 'BUYER')`,
    { managerId }
  );

  return {
    summary: summary.rows[0],
    byAlert: byAlert.rows,
    needsAttention: attention.rows,
    batchesAwaitingLeg1Storage: pending1.rows[0].count,
    saleOrdersAwaitingLeg2Storage: pending2.rows[0].count,
    releaseApprovalsNeeded: actionNeeded.rows[0].count,
  };
}

// ---------------------------------------------------------------------
// Warehouses, units, rate
// ---------------------------------------------------------------------

async function listWarehouses(managerId) {
  const result = await query(
    `SELECT w.WarehouseID   AS "warehouseId",
            w.WarehouseName AS "warehouseName",
            w.Address       AS "address",
            w.District      AS "district",
            w.Capacity      AS "declaredCapacity",
            w.StorageFeePerKgRate AS "storageFeePerKgRate",
            COUNT(u.UnitNo)                  AS "unitCount",
            NVL(SUM(u.UnitCapacity), 0)      AS "unitCapacity",
            NVL(SUM(u.CurrentLoad), 0)       AS "currentLoad",
            NVL(SUM(u.FreeSpace), 0)         AS "freeSpace"
       FROM WAREHOUSE w
       LEFT JOIN V_UNIT_UTILIZATION u ON u.WarehouseID = w.WarehouseID
      WHERE w.ManagerID = :managerId
      GROUP BY w.WarehouseID, w.WarehouseName, w.Address, w.District, w.Capacity, w.StorageFeePerKgRate
      ORDER BY w.WarehouseID`,
    { managerId }
  );
  return result.rows;
}

async function listUnits(managerId, warehouseId) {
  const binds = { managerId };
  let filter = '';
  if (warehouseId) {
    filter = ' AND WarehouseID = :warehouseId';
    binds.warehouseId = Number(warehouseId);
  }

  const result = await query(
    `SELECT WarehouseID    AS "warehouseId",
            WarehouseName  AS "warehouseName",
            UnitNo         AS "unitNo",
            UnitCapacity   AS "capacity",
            CurrentLoad    AS "currentLoad",
            FreeSpace      AS "freeSpace",
            UtilizationPct AS "utilizationPct",
            AlertLevel     AS "alertLevel",
            UnitStatus     AS "unitStatus",
            BatchesHeld    AS "batchesHeld",
            pkg_krishi_metrics.fn_unit_free_space(WarehouseID, UnitNo) AS "freeSpaceFn"
       FROM V_UNIT_UTILIZATION
      WHERE ManagerID = :managerId${filter}
      ORDER BY WarehouseID, UnitNo`,
    binds
  );
  return result.rows;
}

async function createWarehouse(managerId, payload) {
  const missing = ['warehouseName', 'district', 'capacity'].filter((f) => !payload[f]);
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
  }
  if (!(Number(payload.capacity) > 0)) {
    throw ApiError.badRequest('Capacity must be greater than zero.');
  }
  if (payload.storageFeePerKgRate !== undefined && !(Number(payload.storageFeePerKgRate) > 0)) {
    throw ApiError.badRequest('Storage fee rate must be greater than zero.');
  }

  return withTransaction(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO WAREHOUSE (WarehouseName, Address, District, Capacity, ManagerID, StorageFeePerKgRate)
       VALUES (:warehouseName, :address, :district, :capacity, :managerId, :rate)
       RETURNING WarehouseID INTO :warehouseId`,
      {
        warehouseName: payload.warehouseName,
        address: payload.address || null,
        district: payload.district,
        capacity: Number(payload.capacity),
        managerId,
        rate: payload.storageFeePerKgRate ? Number(payload.storageFeePerKgRate) : null,
        warehouseId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return { warehouseId: result.outBinds.warehouseId[0] };
  });
}

async function setStorageFeeRate(managerId, warehouseId, rate) {
  if (!(Number(rate) > 0)) {
    throw ApiError.badRequest('Storage fee rate must be greater than zero.');
  }
  return withTransaction(async (connection) => {
    await assertManagesWarehouse(connection, managerId, warehouseId);
    await connection.execute(
      `UPDATE WAREHOUSE SET StorageFeePerKgRate = :rate WHERE WarehouseID = :warehouseId`,
      { rate: Number(rate), warehouseId }
    );
    return { warehouseId, storageFeePerKgRate: Number(rate) };
  });
}

async function addUnit(managerId, warehouseId, payload) {
  if (!(Number(payload.capacity) > 0)) {
    throw ApiError.badRequest('Unit capacity must be greater than zero.');
  }

  return withTransaction(async (connection) => {
    await assertManagesWarehouse(connection, managerId, warehouseId);

    const result = await connection.execute(
      `INSERT INTO STORAGE_UNIT (WarehouseID, Capacity, Status)
       VALUES (:warehouseId, :capacity, 'EMPTY')
       RETURNING UnitNo INTO :unitNo`,
      {
        warehouseId,
        capacity: Number(payload.capacity),
        unitNo: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return { warehouseId, unitNo: result.outBinds.unitNo[0] };
  });
}

// ---------------------------------------------------------------------
// Candidates for each leg
// ---------------------------------------------------------------------

/**
 * Leg 1: batches with produce not currently in any unit (proposed,
 * accepted, or pending release all count as "in a unit").
 */
/**
 * unstoredQuantity excludes SoldQuantity, not just currently-stored
 * quantity: produce that has already been sold is leg 2's concern (the
 * buyer's local storage), not leg 1's. Without subtracting SoldQuantity,
 * a partially-sold batch like #16 (3000 kg total, 2201 kg sold, 799 kg
 * still available) would wrongly offer the sold 2201 kg back up for
 * farmer-side storage, when a leg-2 allocation is what that portion
 * actually needs, against its own sale order.
 */
const LEG1_BASE_SQL = `
  SELECT hb.BatchID                                  AS "batchId",
         c.CropName                                  AS "cropName",
         f.FarmName                                  AS "farmName",
         fu.FirstName || ' ' || fu.LastName           AS "farmerName",
         f.District                                  AS "farmDistrict",
         hb.HarvestDate                              AS "harvestDate",
         hb.QualityGrade                             AS "qualityGrade",
         hb.TotalQuantity                            AS "totalQuantity",
         hb.SoldQuantity                             AS "soldQuantity",
         hb.Status                                   AS "batchStatus",
         NVL(st.StoredQty, 0)                        AS "storedQuantity",
         hb.TotalQuantity - hb.SoldQuantity - NVL(st.StoredQty, 0) AS "unstoredQuantity"
    FROM HARVEST_BATCH hb
    JOIN CROP c   ON c.CropID  = hb.CropID
    JOIN FARM f   ON f.FarmID  = hb.FarmID
    JOIN USERS fu ON fu.UserID = f.FarmerID
    LEFT JOIN (
      SELECT BatchID, SUM(QuantityStored) AS StoredQty
        FROM STORES
       WHERE DateOut IS NULL
         AND AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COUNTERED')
         AND SaleOrderID IS NULL
       GROUP BY BatchID
    ) st ON st.BatchID = hb.BatchID
   WHERE hb.Status NOT IN ('SOLD', 'DELIVERED', 'EXPIRED')
     AND hb.TotalQuantity - hb.SoldQuantity - NVL(st.StoredQty, 0) > 0
`;

async function listBatchesAwaitingStorage() {
  const result = await query(`${LEG1_BASE_SQL} ORDER BY "harvestDate", "batchId"`);
  return result.rows;
}

/**
 * Leg 2: sale orders that have been awarded but have no leg-2 storage
 * allocation yet for any manager to propose one against.
 */
const LEG2_BASE_SQL = `
  SELECT so.SaleOrderID                              AS "saleOrderId",
         c.CropName                                  AS "cropName",
         so.AcceptedQuantity                         AS "acceptedQuantity",
         bu.FirstName || ' ' || bu.LastName           AS "buyerName",
         byr.BusinessName                            AS "businessName",
         u.Address.District                          AS "buyerDistrict",
         so.OrderDate                                AS "orderDate",
         tr.DeliveryStatus                           AS "deliveryStatus"
    FROM SALE_ORDER so
    JOIN BID b            ON b.BidID   = so.BidID
    JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
    JOIN CROP c           ON c.CropID   = hb.CropID
    JOIN BUYER byr        ON byr.BuyerID = b.BuyerID
    JOIN USERS bu         ON bu.UserID  = b.BuyerID
    JOIN USERS u          ON u.UserID   = b.BuyerID
    LEFT JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
   WHERE so.Status NOT IN ('CANCELLED')
     AND NOT EXISTS (
       SELECT 1 FROM STORES s2
        WHERE s2.SaleOrderID = so.SaleOrderID
          AND s2.AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COMPLETED', 'COUNTERED')
     )
`;

async function listSaleOrdersAwaitingStorage() {
  const result = await query(`${LEG2_BASE_SQL} ORDER BY "orderDate"`);
  return result.rows;
}

// ---------------------------------------------------------------------
// Allocation list (both legs, all statuses — the UI groups by status)
// ---------------------------------------------------------------------

async function listAllocations(managerId) {
  const result = await query(
    `SELECT s.AllocationID     AS "allocationId",
            s.BatchID          AS "batchId",
            c.CropName         AS "cropName",
            s.WarehouseID      AS "warehouseId",
            w.WarehouseName    AS "warehouseName",
            s.UnitNo           AS "unitNo",
            s.QuantityStored   AS "quantityStored",
            s.DateIn           AS "dateIn",
            s.DateOut          AS "dateOut",
            s.AllocationStatus AS "allocationStatus",
            s.MinimumStorageDays AS "minimumStorageDays",
            s.MinimumReleaseDate AS "minimumReleaseDate",
            s.StorageFeePerKgSnapshot AS "storageFeePerKgRate",
            s.StorageFee       AS "storageFee",
            s.ReleaseRequestedBy AS "releaseRequestedBy",
            s.SaleOrderID      AS "saleOrderId",
            s.ProposedBy       AS "proposedBy",
            s.CounterRatePerKg AS "counterRatePerKg",
            s.CounteredBy      AS "counteredBy",
            CASE WHEN s.RequestedByFarmerID IS NOT NULL THEN 'FARMER' ELSE 'BUYER' END AS "customerType",
            cu.FirstName || ' ' || cu.LastName AS "customerName",
            NVL((SELECT SUM(sp.Amount) FROM PAYMENT sp
                  WHERE sp.PaymentType = 'STORAGE'
                    AND sp.AllocationID = s.AllocationID
                    AND sp.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "feePaid"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
       JOIN USERS cu         ON cu.UserID     = NVL(s.RequestedByFarmerID, s.RequestedByBuyerID)
      WHERE w.ManagerID = :managerId
      ORDER BY s.AllocationID DESC`,
    { managerId }
  );
  return result.rows;
}

/**
 * Everything sitting in this manager's court. Two different things land
 * here and the UI needs to tell them apart, so `awaiting` says which:
 *   REQUEST — a customer asked for space and nobody has answered yet
 *   COUNTER — the manager proposed, the customer countered the rate,
 *             and it is back with the manager to settle
 * The manager's own outgoing proposals are deliberately absent: those
 * are waiting on the customer, and already show in listAllocations().
 */
async function listRequestsForManager(managerId) {
  const result = await query(
    `SELECT s.AllocationID     AS "allocationId",
            s.BatchID          AS "batchId",
            c.CropName         AS "cropName",
            s.WarehouseID      AS "warehouseId",
            w.WarehouseName    AS "warehouseName",
            s.UnitNo           AS "unitNo",
            s.QuantityStored   AS "quantityStored",
            s.MinimumStorageDays AS "minimumStorageDays",
            s.StorageFeePerKgSnapshot AS "ratePerKg",
            s.CounterRatePerKg AS "counterRatePerKg",
            s.CounteredBy      AS "counteredBy",
            s.ProposedBy       AS "proposedBy",
            s.AllocationStatus AS "allocationStatus",
            s.SaleOrderID      AS "saleOrderId",
            CASE WHEN s.RequestedByFarmerID IS NOT NULL THEN 'FARMER' ELSE 'BUYER' END AS "customerType",
            cu.FirstName || ' ' || cu.LastName AS "customerName",
            CASE WHEN s.AllocationStatus = 'COUNTERED' THEN 'COUNTER' ELSE 'REQUEST' END AS "awaiting",
            s.QuantityStored * NVL(s.CounterRatePerKg, s.StorageFeePerKgSnapshot) AS "estimatedFee"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
       JOIN USERS cu         ON cu.UserID     = NVL(s.RequestedByFarmerID, s.RequestedByBuyerID)
      WHERE w.ManagerID = :managerId
        AND (   (s.AllocationStatus = 'PENDING_ACCEPT' AND s.ProposedBy = 'CUSTOMER')
             OR (s.AllocationStatus = 'COUNTERED'      AND s.ProposedBy = 'MANAGER'))
      ORDER BY s.AllocationID DESC`,
    { managerId }
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Public browse — any signed-in user picking somewhere to store
// ---------------------------------------------------------------------

/**
 * Every warehouse with a rate set, for a customer choosing where to ask
 * for space. Deliberately unscoped by manager (unlike listWarehouses()),
 * and it only exposes what a customer needs to choose: no manager
 * identity, no per-unit occupancy of other people's stock.
 */
async function listAllWarehousesPublic() {
  const result = await query(
    `SELECT w.WarehouseID   AS "warehouseId",
            w.WarehouseName AS "warehouseName",
            w.Address       AS "address",
            w.District      AS "district",
            w.StorageFeePerKgRate AS "storageFeePerKgRate",
            NVL(SUM(u.FreeSpace), 0) AS "freeSpace",
            COUNT(u.UnitNo)          AS "unitCount"
       FROM WAREHOUSE w
       LEFT JOIN V_UNIT_UTILIZATION u ON u.WarehouseID = w.WarehouseID
      WHERE w.StorageFeePerKgRate IS NOT NULL
      GROUP BY w.WarehouseID, w.WarehouseName, w.Address, w.District, w.StorageFeePerKgRate
      ORDER BY w.District, w.WarehouseName`
  );
  return result.rows;
}

async function listAllUnitsPublic(warehouseId) {
  const result = await query(
    `SELECT WarehouseID    AS "warehouseId",
            WarehouseName  AS "warehouseName",
            UnitNo         AS "unitNo",
            UnitCapacity   AS "capacity",
            FreeSpace      AS "freeSpace",
            UnitStatus     AS "unitStatus"
       FROM V_UNIT_UTILIZATION
      WHERE WarehouseID = :warehouseId
        AND UnitStatus <> 'MAINTENANCE'
      ORDER BY UnitNo`,
    { warehouseId: Number(warehouseId) }
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// PROPOSE — manager picks a unit and terms; nothing is active yet
// ---------------------------------------------------------------------

/**
 * BR-07, against reserved+active load rather than just what is physically
 * inside: a proposal already counts as load (see unitLoad()), so it
 * cannot itself be over-capacity even though nothing is confirmed yet.
 */
async function assertUnitHasRoom(connection, warehouseId, unitNo, capacity, quantity) {
  const load = await unitLoad(connection, warehouseId, unitNo);
  const free = capacity - load;
  if (quantity > free) {
    throw ApiError.businessRule(
      `BR-07: unit ${unitNo} has ${load} of ${capacity} kg reserved/stored, ` +
        `leaving ${free} kg free. Cannot allocate ${quantity} kg.`
    );
  }
}

async function warehouseRate(connection, warehouseId) {
  const result = await connection.execute(
    `SELECT StorageFeePerKgRate FROM WAREHOUSE WHERE WarehouseID = :warehouseId`,
    { warehouseId }
  );
  const rate = result.rows[0].STORAGEFEEPERKGRATE;
  if (!rate) {
    throw ApiError.businessRule('This warehouse has no storage fee rate set yet.');
  }
  return rate;
}

/**
 * Works out which batch or sale order an allocation is against, who its
 * customer is, and whether the requested quantity actually fits what is
 * left unallocated. Shared by the manager's propose() and the customer's
 * requestAllocation() — the derivation and the quantity rules are the
 * same either way; only who initiates differs, and a customer's request
 * additionally has to prove the derived customer is themselves.
 */
async function resolveAllocationTarget(connection, payload, quantity, isLeg2, expectCustomerId = null) {
  if (isLeg2) {
    const saleOrderId = Number(payload.saleOrderId);
    const order = await connection.execute(
      `SELECT hb.BatchID, b.BuyerID, so.AcceptedQuantity, so.Status
         FROM SALE_ORDER so
         JOIN BID b            ON b.BidID   = so.BidID
         JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
        WHERE so.SaleOrderID = :saleOrderId`,
      { saleOrderId }
    );
    if (!order.rows.length) throw ApiError.notFound('No such sale order.');
    // Ownership before anything else: otherwise the quantity error below
    // would tell a stranger how much of someone else's order is already
    // allocated. 404 rather than 403, matching the rest of the codebase.
    if (expectCustomerId !== null && order.rows[0].BUYERID !== expectCustomerId) {
      throw ApiError.notFound('No such sale order.');
    }
    if (order.rows[0].STATUS === 'CANCELLED') {
      throw ApiError.businessRule('This sale order is cancelled.');
    }

    const already = await connection.execute(
      `SELECT NVL(SUM(QuantityStored), 0) AS Qty FROM STORES
        WHERE SaleOrderID = :saleOrderId
          AND AllocationStatus IN ('PENDING_ACCEPT', 'ACTIVE', 'PENDING_RELEASE', 'COMPLETED', 'COUNTERED')`,
      { saleOrderId }
    );
    const remaining = order.rows[0].ACCEPTEDQUANTITY - already.rows[0].QTY;
    if (quantity > remaining) {
      throw ApiError.businessRule(
        `Only ${remaining} kg of this sale order has no storage allocation yet.`
      );
    }

    return {
      batchId: order.rows[0].BATCHID,
      saleOrderId,
      requestedByFarmerId: null,
      requestedByBuyerId: order.rows[0].BUYERID,
    };
  }

  const batchId = Number(payload.batchId);
  const batch = await connection.execute(
    `SELECT hb.TotalQuantity, hb.SoldQuantity, hb.Status, f.FarmerID,
            NVL((SELECT SUM(QuantityStored) FROM STORES s
                  WHERE s.BatchID = hb.BatchID AND s.SaleOrderID IS NULL
                    AND s.AllocationStatus IN ('PENDING_ACCEPT','ACTIVE','PENDING_RELEASE','COUNTERED')), 0) AS StoredQty
       FROM HARVEST_BATCH hb JOIN FARM f ON f.FarmID = hb.FarmID
      WHERE hb.BatchID = :batchId`,
    { batchId }
  );
  if (!batch.rows.length) throw ApiError.notFound('No such batch.');
  // Ownership first, same reasoning as the leg-2 branch above.
  if (expectCustomerId !== null && batch.rows[0].FARMERID !== expectCustomerId) {
    throw ApiError.notFound('No such batch.');
  }
  if (['SOLD', 'DELIVERED', 'EXPIRED'].includes(batch.rows[0].STATUS)) {
    throw ApiError.businessRule(`This batch is ${batch.rows[0].STATUS} and no longer needs storage.`);
  }
  // Excludes SoldQuantity, same reasoning as LEG1_BASE_SQL above — sold
  // produce is leg 2's concern, not a leg-1 allocation target.
  const unstored = batch.rows[0].TOTALQUANTITY - batch.rows[0].SOLDQUANTITY - batch.rows[0].STOREDQTY;
  if (quantity > unstored) {
    throw ApiError.businessRule(
      `Only ${unstored} kg of this batch is unsold and not already proposed or stored.`
    );
  }

  return {
    batchId,
    saleOrderId: null,
    requestedByFarmerId: batch.rows[0].FARMERID,
    requestedByBuyerId: null,
  };
}

/**
 * Manager proposes an allocation. `payload.batchId` proposes leg 1
 * (customer derived as that batch's farmer); `payload.saleOrderId`
 * proposes leg 2 (customer derived as that sale's winning buyer).
 * Exactly one of the two must be given.
 */
async function propose(managerId, payload) {
  const warehouseId = Number(payload.warehouseId);
  const unitNo = Number(payload.unitNo);
  const quantity = Number(payload.quantityStored);
  const minimumStorageDays = Number(payload.minimumStorageDays);

  if (!warehouseId || !unitNo) {
    throw ApiError.badRequest('warehouseId and unitNo are required.');
  }
  if (!(quantity > 0)) throw ApiError.badRequest('Quantity stored must be greater than zero.');
  if (!(minimumStorageDays > 0)) {
    throw ApiError.badRequest('Minimum storage days must be greater than zero.');
  }

  const isLeg2 = payload.saleOrderId !== undefined && payload.saleOrderId !== null;
  if (!isLeg2 && !payload.batchId) {
    throw ApiError.badRequest('Either batchId (leg 1) or saleOrderId (leg 2) is required.');
  }

  return withTransaction(async (connection) => {
    await assertManagesWarehouse(connection, managerId, warehouseId);

    const unitResult = await connection.execute(
      `SELECT Capacity, Status FROM STORAGE_UNIT
        WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo
          FOR UPDATE`,
      { warehouseId, unitNo }
    );
    if (!unitResult.rows.length) throw ApiError.notFound('No such storage unit.');
    const unit = unitResult.rows[0];
    if (unit.STATUS === 'MAINTENANCE') {
      throw ApiError.businessRule(`Unit ${unitNo} is under maintenance.`);
    }

    await assertUnitHasRoom(connection, warehouseId, unitNo, unit.CAPACITY, quantity);
    const rate = await warehouseRate(connection, warehouseId);

    const { batchId, saleOrderId, requestedByFarmerId, requestedByBuyerId } =
      await resolveAllocationTarget(connection, payload, quantity, isLeg2);

    const inserted = await connection.execute(
      `INSERT INTO STORES (
         BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored,
         RequestedByFarmerID, RequestedByBuyerID, SaleOrderID,
         MinimumStorageDays, StorageFeePerKgSnapshot, AllocationStatus, ProposedBy
       ) VALUES (
         :batchId, :warehouseId, :unitNo, :managerId, :quantity,
         :requestedByFarmerId, :requestedByBuyerId, :saleOrderId,
         :minimumStorageDays, :rate, 'PENDING_ACCEPT', 'MANAGER'
       )
       RETURNING AllocationID INTO :allocationId`,
      {
        batchId, warehouseId, unitNo, managerId, quantity,
        requestedByFarmerId, requestedByBuyerId, saleOrderId,
        minimumStorageDays, rate,
        allocationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    await refreshUnitStatus(connection, warehouseId, unitNo);

    return {
      allocationId: inserted.outBinds.allocationId[0],
      batchId,
      saleOrderId,
      customerType: isLeg2 ? 'BUYER' : 'FARMER',
      warehouseId,
      unitNo,
      quantityStored: quantity,
      minimumStorageDays,
      storageFeePerKgRate: rate,
      estimatedFee: Number((quantity * rate).toFixed(2)),
      status: 'PENDING_ACCEPT',
      proposedBy: 'MANAGER',
    };
  });
}

/**
 * The mirror of propose(): the customer picks the warehouse and unit and
 * asks for space, and the manager is the one who then has to answer.
 * Everything about the resulting row is identical except ProposedBy,
 * which is what flips who may accept, reject or counter it.
 *
 * The customer may pick ANY warehouse, so there is no
 * assertManagesWarehouse() here — instead the owning manager is derived
 * from the warehouse, and the customer has to prove the batch or sale
 * order is genuinely theirs.
 */
async function requestAllocation(customerType, customerId, payload) {
  const warehouseId = Number(payload.warehouseId);
  const unitNo = Number(payload.unitNo);
  const quantity = Number(payload.quantityStored);
  const minimumStorageDays = Number(payload.minimumStorageDays);

  if (!warehouseId || !unitNo) {
    throw ApiError.badRequest('warehouseId and unitNo are required.');
  }
  if (!(quantity > 0)) throw ApiError.badRequest('Quantity stored must be greater than zero.');
  if (!(minimumStorageDays > 0)) {
    throw ApiError.badRequest('Minimum storage days must be greater than zero.');
  }

  const isLeg2 = payload.saleOrderId !== undefined && payload.saleOrderId !== null;
  if (!isLeg2 && !payload.batchId) {
    throw ApiError.badRequest('Either batchId (leg 1) or saleOrderId (leg 2) is required.');
  }
  if (isLeg2 && customerType !== 'BUYER') {
    throw ApiError.badRequest('Only a buyer can request storage against a sale order.');
  }
  if (!isLeg2 && customerType !== 'FARMER') {
    throw ApiError.badRequest('Only a farmer can request storage against an unsold batch.');
  }

  return withTransaction(async (connection) => {
    const warehouse = await connection.execute(
      `SELECT ManagerID FROM WAREHOUSE WHERE WarehouseID = :warehouseId`,
      { warehouseId }
    );
    if (!warehouse.rows.length) throw ApiError.notFound('No such warehouse.');
    const managerId = warehouse.rows[0].MANAGERID;

    const unitResult = await connection.execute(
      `SELECT Capacity, Status FROM STORAGE_UNIT
        WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo
          FOR UPDATE`,
      { warehouseId, unitNo }
    );
    if (!unitResult.rows.length) throw ApiError.notFound('No such storage unit.');
    const unit = unitResult.rows[0];
    if (unit.STATUS === 'MAINTENANCE') {
      throw ApiError.businessRule(`Unit ${unitNo} is under maintenance.`);
    }

    await assertUnitHasRoom(connection, warehouseId, unitNo, unit.CAPACITY, quantity);
    const rate = await warehouseRate(connection, warehouseId);

    // Passing customerId makes resolveAllocationTarget check ownership as
    // soon as it has derived the rightful customer — before its quantity
    // rules, so a stranger's request fails with a flat 404 rather than an
    // error that describes someone else's order.
    const { batchId, saleOrderId, requestedByFarmerId, requestedByBuyerId } =
      await resolveAllocationTarget(connection, payload, quantity, isLeg2, customerId);

    const inserted = await connection.execute(
      `INSERT INTO STORES (
         BatchID, WarehouseID, UnitNo, ManagerID, QuantityStored,
         RequestedByFarmerID, RequestedByBuyerID, SaleOrderID,
         MinimumStorageDays, StorageFeePerKgSnapshot, AllocationStatus, ProposedBy
       ) VALUES (
         :batchId, :warehouseId, :unitNo, :managerId, :quantity,
         :requestedByFarmerId, :requestedByBuyerId, :saleOrderId,
         :minimumStorageDays, :rate, 'PENDING_ACCEPT', 'CUSTOMER'
       )
       RETURNING AllocationID INTO :allocationId`,
      {
        batchId, warehouseId, unitNo, managerId, quantity,
        requestedByFarmerId, requestedByBuyerId, saleOrderId,
        minimumStorageDays, rate,
        allocationId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    await refreshUnitStatus(connection, warehouseId, unitNo);

    return {
      allocationId: inserted.outBinds.allocationId[0],
      batchId,
      saleOrderId,
      customerType,
      warehouseId,
      unitNo,
      quantityStored: quantity,
      minimumStorageDays,
      storageFeePerKgRate: rate,
      estimatedFee: Number((quantity * rate).toFixed(2)),
      status: 'PENDING_ACCEPT',
      proposedBy: 'CUSTOMER',
    };
  });
}

// ---------------------------------------------------------------------
// CUSTOMER CONSENT — accept or reject a proposal
// ---------------------------------------------------------------------

/**
 * Answer an offer that is still on the table. responderType is 'FARMER',
 * 'BUYER' or 'MANAGER' — the route layer supplies it based on which
 * role's endpoint was called; responderId always comes from the verified
 * token. Which of the three is entitled to answer depends on who opened
 * the offer, which assertIsResponder() works out from ProposedBy.
 *
 * COUNTER opens the single permitted negotiation round: it names a new
 * rate and hands the decision back to the original proposer, who then
 * settles it through respondToCounter(). There is no second counter.
 */
async function respondToProposal(responderType, responderId, allocationId, decision, payload = {}) {
  if (!['ACCEPT', 'REJECT', 'COUNTER'].includes(decision)) {
    throw ApiError.badRequest('decision must be ACCEPT, REJECT or COUNTER.');
  }

  return withTransaction(async (connection) => {
    const allocation = await loadAllocation(connection, allocationId);
    assertIsResponder(allocation, responderType, responderId);

    if (allocation.ALLOCATIONSTATUS !== 'PENDING_ACCEPT') {
      throw ApiError.businessRule(`This proposal is ${allocation.ALLOCATIONSTATUS}, not awaiting a decision.`);
    }

    if (decision === 'REJECT') {
      await connection.execute(
        `UPDATE STORES SET AllocationStatus = 'REJECTED' WHERE AllocationID = :allocationId`,
        { allocationId }
      );
      await refreshUnitStatus(connection, allocation.WAREHOUSEID, allocation.UNITNO);
      return { allocationId, status: 'REJECTED' };
    }

    if (decision === 'COUNTER') {
      const counterRate = Number(payload.counterRatePerKg);
      if (!(counterRate > 0)) {
        throw ApiError.badRequest('counterRatePerKg must be greater than zero.');
      }
      if (counterRate === Number(allocation.STORAGEFEEPERKGSNAPSHOT)) {
        throw ApiError.badRequest(
          'That is the rate already on the table — accept it instead of countering.'
        );
      }
      // The space stays reserved while the counter is outstanding: a
      // COUNTERED row still counts toward unitLoad(), so nobody can
      // double-book the unit mid-negotiation.
      await connection.execute(
        `UPDATE STORES
            SET AllocationStatus = 'COUNTERED',
                CounterRatePerKg = :counterRate,
                CounteredBy      = :counteredBy
          WHERE AllocationID = :allocationId`,
        {
          counterRate,
          counteredBy: responderType === 'MANAGER' ? 'MANAGER' : 'CUSTOMER',
          allocationId,
        }
      );
      return {
        allocationId,
        status: 'COUNTERED',
        counterRatePerKg: counterRate,
        originalRatePerKg: allocation.STORAGEFEEPERKGSNAPSHOT,
        estimatedFee: Number((allocation.QUANTITYSTORED * counterRate).toFixed(2)),
      };
    }

    // ACCEPT at the offered rate — the clock starts now.
    await finalizeAcceptance(connection, allocation, allocation.STORAGEFEEPERKGSNAPSHOT);
    return {
      allocationId,
      status: 'ACTIVE',
      agreedRatePerKg: allocation.STORAGEFEEPERKGSNAPSHOT,
      dateIn: new Date().toISOString().slice(0, 10),
      minimumReleaseDate: null, // computed by the DB; refetch if needed
    };
  });
}

/**
 * Settle a counter-offer. Only the side that opened the original offer
 * may answer it, and only with ACCEPT or REJECT — the single-round rule
 * is enforced structurally here, so no sequence of API calls can bounce
 * a negotiation back and forth indefinitely.
 */
async function respondToCounter(responderType, responderId, allocationId, decision) {
  if (!['ACCEPT', 'REJECT'].includes(decision)) {
    throw ApiError.badRequest('decision must be ACCEPT or REJECT.');
  }

  return withTransaction(async (connection) => {
    const allocation = await loadAllocation(connection, allocationId);

    if (allocation.ALLOCATIONSTATUS !== 'COUNTERED') {
      throw ApiError.businessRule(
        `This allocation is ${allocation.ALLOCATIONSTATUS}, with no counter-offer to settle.`
      );
    }

    // Mirror image of assertIsResponder(): the sides have swapped, so it
    // is the original proposer's turn.
    if (allocation.PROPOSEDBY === 'MANAGER') {
      if (responderType !== 'MANAGER') {
        throw ApiError.businessRule('The storage manager has to settle this counter-offer.');
      }
      if (allocation.WAREHOUSEMANAGERID !== responderId) {
        throw ApiError.notFound('No such allocation.');
      }
    } else {
      if (responderType === 'MANAGER') {
        throw ApiError.businessRule('The customer has to settle this counter-offer.');
      }
      assertIsCustomer(allocation, responderType, responderId);
    }

    if (decision === 'REJECT') {
      await connection.execute(
        `UPDATE STORES SET AllocationStatus = 'REJECTED' WHERE AllocationID = :allocationId`,
        { allocationId }
      );
      await refreshUnitStatus(connection, allocation.WAREHOUSEID, allocation.UNITNO);
      return { allocationId, status: 'REJECTED', mechanism: 'COUNTER_REJECTED' };
    }

    await finalizeAcceptance(connection, allocation, allocation.COUNTERRATEPERKG);
    return {
      allocationId,
      status: 'ACTIVE',
      agreedRatePerKg: allocation.COUNTERRATEPERKG,
      mechanism: 'COUNTER_ACCEPTED',
    };
  });
}

// ---------------------------------------------------------------------
// RELEASE
// ---------------------------------------------------------------------

/**
 * initiatorType is 'FARMER', 'BUYER' or 'MANAGER'. Forks on whether
 * MinimumReleaseDate has passed:
 *   fulfilled -> release completes immediately (subject to SF-01)
 *   not yet   -> PENDING_RELEASE, waits for the OTHER party to approve
 */
async function requestRelease(initiatorType, initiatorId, allocationId) {
  return withTransaction(async (connection) => {
    const allocation = await loadAllocation(connection, allocationId);

    if (initiatorType === 'MANAGER') {
      if (allocation.WAREHOUSEMANAGERID !== initiatorId) throw ApiError.notFound('No such allocation.');
    } else {
      assertIsCustomer(allocation, initiatorType, initiatorId);
    }

    if (allocation.ALLOCATIONSTATUS !== 'ACTIVE') {
      throw ApiError.businessRule(`This allocation is ${allocation.ALLOCATIONSTATUS}, not active.`);
    }

    const termResult = await connection.execute(
      `SELECT CASE WHEN MinimumReleaseDate IS NULL OR TRUNC(SYSDATE) >= MinimumReleaseDate
                   THEN 1 ELSE 0 END AS Fulfilled
         FROM STORES WHERE AllocationID = :allocationId`,
      { allocationId }
    );
    const fulfilled = termResult.rows[0].FULFILLED === 1;

    if (fulfilled) {
      await completeRelease(connection, allocation);
      return { allocationId, status: 'COMPLETED', mechanism: 'DIRECT_TERM_FULFILLED' };
    }

    await connection.execute(
      `UPDATE STORES SET AllocationStatus = 'PENDING_RELEASE', ReleaseRequestedBy = :initiatorType
        WHERE AllocationID = :allocationId`,
      { initiatorType, allocationId }
    );
    return { allocationId, status: 'PENDING_RELEASE', mechanism: 'AWAITING_OTHER_PARTY_APPROVAL' };
  });
}

/**
 * The OTHER party (relative to ReleaseRequestedBy) approves or declines
 * an early release. Declining reverts to ACTIVE — the term still stands.
 */
async function respondToRelease(responderType, responderId, allocationId, decision) {
  if (!['APPROVE', 'DECLINE'].includes(decision)) {
    throw ApiError.badRequest('decision must be APPROVE or DECLINE.');
  }

  return withTransaction(async (connection) => {
    const allocation = await loadAllocation(connection, allocationId);

    if (responderType === 'MANAGER') {
      if (allocation.WAREHOUSEMANAGERID !== responderId) throw ApiError.notFound('No such allocation.');
    } else {
      assertIsCustomer(allocation, responderType, responderId);
    }

    if (allocation.ALLOCATIONSTATUS !== 'PENDING_RELEASE') {
      throw ApiError.businessRule('This allocation has no pending release to respond to.');
    }
    if (allocation.RELEASEREQUESTEDBY === responderType) {
      throw ApiError.businessRule('You requested this release — the other party must respond to it.');
    }

    if (decision === 'DECLINE') {
      await connection.execute(
        `UPDATE STORES SET AllocationStatus = 'ACTIVE', ReleaseRequestedBy = NULL
          WHERE AllocationID = :allocationId`,
        { allocationId }
      );
      return { allocationId, status: 'ACTIVE', mechanism: 'EARLY_RELEASE_DECLINED' };
    }

    await completeRelease(connection, allocation);
    return { allocationId, status: 'COMPLETED', mechanism: 'EARLY_RELEASE_APPROVED' };
  });
}

// ---------------------------------------------------------------------
// FEES
// ---------------------------------------------------------------------

async function listFeesForCustomer(customerType, customerId) {
  const column = customerType === 'FARMER' ? 'RequestedByFarmerID' : 'RequestedByBuyerID';
  const result = await query(
    `SELECT s.AllocationID     AS "allocationId",
            s.BatchID          AS "batchId",
            c.CropName         AS "cropName",
            w.WarehouseName    AS "warehouseName",
            s.UnitNo           AS "unitNo",
            s.QuantityStored   AS "quantityStored",
            s.StorageFeePerKgSnapshot AS "ratePerKg",
            s.StorageFee       AS "totalFee",
            s.AllocationStatus AS "allocationStatus",
            s.DateIn           AS "dateIn",
            s.MinimumReleaseDate AS "minimumReleaseDate",
            NVL((SELECT SUM(sp.Amount) FROM PAYMENT sp
                  WHERE sp.PaymentType = 'STORAGE'
                    AND sp.AllocationID = s.AllocationID
                    AND sp.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "paidSoFar",
            pkg_krishi_metrics.fn_storage_days(s.AllocationID) AS "storageDays"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
      WHERE s.${column} = :customerId
        -- Only allocations the customer has actually accepted owe a fee.
        -- PENDING_ACCEPT and COUNTERED are deliberately excluded here,
        -- not just REJECTED/CANCELLED — paying against an unaccepted
        -- proposal was the item-10 bug (see payFee()'s matching guard).
        AND s.AllocationStatus IN ('ACTIVE', 'PENDING_RELEASE', 'COMPLETED')
      ORDER BY s.AllocationID DESC`,
    { customerId }
  );
  return result.rows;
}

async function payFee(customerType, customerId, allocationId, payload) {
  const amount = Number(payload.amount);
  if (!(amount > 0)) throw ApiError.badRequest('Amount must be greater than zero.');
  if (!payload.paymentMethod) throw ApiError.badRequest('paymentMethod is required.');

  return withTransaction(async (connection) => {
    const allocation = await loadAllocation(connection, allocationId);
    assertIsCustomer(allocation, customerType, customerId);

    // A fee can only be owed once the customer has accepted the terms.
    // PENDING_RELEASE stays payable, not just ACTIVE — a fee can
    // legitimately still be owed while an early release is pending the
    // other party's approval (requestRelease()/respondToRelease() both
    // treat PENDING_RELEASE as "still an open allocation").
    if (!['ACTIVE', 'PENDING_RELEASE'].includes(allocation.ALLOCATIONSTATUS)) {
      throw ApiError.businessRule('Accept the storage terms before paying its fee.');
    }

    const paid = await connection.execute(
      `SELECT NVL(SUM(Amount), 0) AS Paid FROM PAYMENT
        WHERE PaymentType = 'STORAGE' AND AllocationID = :allocationId
          AND PaymentStatus IN ('PENDING', 'COMPLETED')`,
      { allocationId }
    );
    const owed = allocation.STORAGEFEE || 0;
    if (paid.rows[0].PAID + amount > owed) {
      throw ApiError.businessRule(
        `This would overpay the storage fee: ${owed} owed, ${paid.rows[0].PAID} already paid.`
      );
    }

    const reference = `SF-${Date.now()}-${allocationId}`;
    const result = await connection.execute(
      `INSERT INTO PAYMENT (PaymentType, AllocationID, Amount, PaymentMethod, TransactionReference, PaymentStatus)
       VALUES ('STORAGE', :allocationId, :amount, :paymentMethod, :reference, 'COMPLETED')
       RETURNING PaymentID INTO :storagePaymentId`,
      {
        allocationId,
        amount,
        paymentMethod: payload.paymentMethod,
        reference,
        storagePaymentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    return {
      storagePaymentId: result.outBinds.storagePaymentId[0],
      allocationId,
      amount,
      totalPaid: paid.rows[0].PAID + amount,
      owed,
      fullyPaid: paid.rows[0].PAID + amount >= owed,
    };
  });
}

/**
 * Take a unit in or out of service.
 *
 * MAINTENANCE is the one status refreshUnitStatus() will not overwrite,
 * precisely because it is a human decision rather than a function of how
 * full the unit is. Coming back out of maintenance therefore hands the
 * unit to refreshUnitStatus() to re-derive EMPTY/PARTIAL/FULL from the
 * rows underneath it, rather than guessing.
 */
async function setUnitMaintenance(managerId, warehouseId, unitNo, inMaintenance) {
  return withTransaction(async (connection) => {
    await assertManagesWarehouse(connection, managerId, warehouseId);

    const unitResult = await connection.execute(
      `SELECT Status FROM STORAGE_UNIT
        WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo FOR UPDATE`,
      { warehouseId, unitNo }
    );
    if (!unitResult.rows.length) throw ApiError.notFound('No such storage unit.');

    if (inMaintenance) {
      // Refuse while anything is still in it — a unit under maintenance
      // is one nobody can allocate into, and stock already inside would
      // become unreachable rather than being moved out properly.
      const load = await unitLoad(connection, warehouseId, unitNo);
      if (load > 0) {
        throw ApiError.businessRule(
          `Unit ${unitNo} still holds ${load} kg. Release its allocations before ` +
            `taking it out of service.`
        );
      }
      await connection.execute(
        `UPDATE STORAGE_UNIT SET Status = 'MAINTENANCE'
          WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo`,
        { warehouseId, unitNo }
      );
      return { warehouseId, unitNo, status: 'MAINTENANCE' };
    }

    if (unitResult.rows[0].STATUS !== 'MAINTENANCE') {
      throw ApiError.businessRule(`Unit ${unitNo} is not under maintenance.`);
    }
    // Park it somewhere legal, then let the real derivation correct it.
    await connection.execute(
      `UPDATE STORAGE_UNIT SET Status = 'EMPTY'
        WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo`,
      { warehouseId, unitNo }
    );
    await refreshUnitStatus(connection, warehouseId, unitNo);

    const after = await connection.execute(
      `SELECT Status FROM STORAGE_UNIT WHERE WarehouseID = :warehouseId AND UnitNo = :unitNo`,
      { warehouseId, unitNo }
    );
    return { warehouseId, unitNo, status: after.rows[0].STATUS };
  });
}

module.exports = {
  getDashboard,
  listWarehouses,
  createWarehouse,
  setStorageFeeRate,
  listUnits,
  addUnit,
  setUnitMaintenance,
  listBatchesAwaitingStorage,
  listSaleOrdersAwaitingStorage,
  listAllocations,
  listRequestsForManager,
  listAllWarehousesPublic,
  listAllUnitsPublic,
  propose,
  requestAllocation,
  respondToProposal,
  respondToCounter,
  requestRelease,
  respondToRelease,
  listFeesForCustomer,
  payFee,
};
