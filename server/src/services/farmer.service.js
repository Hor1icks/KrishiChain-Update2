'use strict';

/**
 * Farmer module services.
 *
 * TWO THINGS EVERY FUNCTION HERE DOES
 *
 * 1. Ownership. The database has no concept of "the logged-in user", so
 *    BR-02/BR-03 ("a farmer may only touch their own farms and batches")
 *    cannot be a constraint — it has to be checked here, on every call,
 *    against req.user.userId. Never trust an ID that arrived in a URL.
 *
 * 2. The cross-table business rules with no DB backstop: BR-09
 *    (MinimumPrice >= Crop.BasePrice) and BR-11 (bid >= minimum and >
 *    current highest). Until now the seed satisfied these by hand; this
 *    is where they become enforced for real.
 *
 * SQL column aliases are double-quoted ("farmId", not FarmID) so Oracle
 * preserves the case and rows arrive as ready-to-serve camelCase JSON.
 * Unquoted identifiers come back SHOUTING, which would need a mapping
 * layer for no benefit.
 */

const oracledb = require('oracledb');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const storage = require('./storage.service');

// ---------------------------------------------------------------------
// Ownership guards
// ---------------------------------------------------------------------

async function assertOwnsFarm(connection, farmerId, farmId) {
  const result = await connection.execute(
    `SELECT FarmID FROM FARM WHERE FarmID = :farmId AND FarmerID = :farmerId`,
    { farmId, farmerId }
  );
  if (!result.rows.length) {
    // Deliberately 404, not 403: telling a farmer "that farm exists but
    // is not yours" leaks the existence of other farmers' rows.
    throw ApiError.notFound('No such farm.');
  }
}

async function assertOwnsBatch(connection, farmerId, batchId) {
  const result = await connection.execute(
    `SELECT hb.BatchID
       FROM HARVEST_BATCH hb
       JOIN FARM f ON f.FarmID = hb.FarmID
      WHERE hb.BatchID = :batchId AND f.FarmerID = :farmerId`,
    { batchId, farmerId }
  );
  if (!result.rows.length) throw ApiError.notFound('No such batch.');
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

async function getDashboard(farmerId) {
  const earnings = await query(
    `SELECT FarmerID          AS "farmerId",
            FarmerName        AS "farmerName",
            District          AS "district",
            FarmCount         AS "farmCount",
            BatchesListed     AS "batchesListed",
            BatchesSold       AS "batchesSold",
            QuantitySoldKg    AS "quantitySoldKg",
            TotalRevenue      AS "totalRevenue",
            AvgPricePerKg     AS "avgPricePerKg",
            AmountReceived    AS "amountReceived",
            AmountOutstanding AS "amountOutstanding"
       FROM V_FARMER_EARNINGS
      WHERE FarmerID = :farmerId`,
    { farmerId }
  );

  // Status breakdown drives the dashboard's "what needs my attention"
  // panel — e.g. how many auctions are open right now.
  const byStatus = await query(
    `SELECT hb.Status AS "status", COUNT(*) AS "count"
       FROM HARVEST_BATCH hb
       JOIN FARM f ON f.FarmID = hb.FarmID
      WHERE f.FarmerID = :farmerId
      GROUP BY hb.Status
      ORDER BY hb.Status`,
    { farmerId }
  );

  const openAuctions = await query(
    `SELECT bs.BatchID     AS "batchId",
            bs.CropName    AS "cropName",
            bs.BidCount    AS "bidCount",
            bs.HighestBid  AS "highestBid",
            bs.MinimumPrice AS "minimumPrice",
            bs.HoursRemaining AS "hoursRemaining"
       FROM V_BIDDING_SUMMARY bs
       JOIN HARVEST_BATCH hb ON hb.BatchID = bs.BatchID
       JOIN FARM f           ON f.FarmID   = hb.FarmID
      WHERE f.FarmerID = :farmerId
        AND bs.BiddingState = 'OPEN NOW'
      ORDER BY bs.HoursRemaining`,
    { farmerId }
  );

  const metrics = await query(
    `SELECT pkg_krishi_metrics.fn_farmer_revenue(:farmerId) AS "lifetimeRevenue"
       FROM dual`,
    { farmerId }
  );

  return {
    summary: earnings.rows[0] || null,
    batchesByStatus: byStatus.rows,
    openAuctions: openAuctions.rows,
    lifetimeRevenue: metrics.rows[0].lifetimeRevenue,
  };
}

// ---------------------------------------------------------------------
// Farms
// ---------------------------------------------------------------------

async function listFarms(farmerId) {
  const result = await query(
    `SELECT f.FarmID        AS "farmId",
            f.FarmName      AS "farmName",
            f.Area          AS "area",
            f.SoilType      AS "soilType",
            f.IrrigationType AS "irrigationType",
            f.Location      AS "location",
            f.District      AS "district",
            f.Status        AS "status",
            (SELECT COUNT(*) FROM HARVEST_BATCH hb WHERE hb.FarmID = f.FarmID) AS "batchCount"
       FROM FARM f
      WHERE f.FarmerID = :farmerId
      ORDER BY f.FarmID`,
    { farmerId }
  );
  return result.rows;
}

async function createFarm(farmerId, payload) {
  const required = ['farmName', 'area', 'district'];
  const missing = required.filter((f) => !payload[f]);
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
  }
  if (Number(payload.area) <= 0) {
    throw ApiError.badRequest('Area must be greater than zero.');
  }

  return withTransaction(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO FARM (FarmerID, FarmName, Area, SoilType, IrrigationType, Location, District)
       VALUES (:farmerId, :farmName, :area, :soilType, :irrigationType, :location, :district)
       RETURNING FarmID INTO :farmId`,
      {
        farmerId,
        farmName: payload.farmName,
        area: Number(payload.area),
        soilType: payload.soilType || null,
        irrigationType: payload.irrigationType || null,
        location: payload.location || null,
        district: payload.district,
        farmId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return { farmId: result.outBinds.farmId[0] };
  });
}

// ---------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------

async function listBatches(farmerId) {
  const result = await query(
    `SELECT v.BatchID           AS "batchId",
            v.CropName          AS "cropName",
            v.FarmName          AS "farmName",
            v.AratName          AS "aratName",
            v.HarvestDate       AS "harvestDate",
            v.TotalQuantity     AS "totalQuantity",
            v.SoldQuantity      AS "soldQuantity",
            v.AvailableQuantity AS "availableQuantity",
            v.QualityGrade      AS "qualityGrade",
            v.MinimumPrice      AS "minimumPrice",
            v.MinimumBidQuantity AS "minimumBidQuantity",
            v.CurrentHighestBid AS "currentHighestBid",
            v.BiddingEndTime    AS "biddingEndTime",
            v.BatchStatus       AS "status"
       FROM V_BATCH_AVAILABILITY v
      WHERE v.FarmerID = :farmerId
      ORDER BY v.BatchID DESC`,
    { farmerId }
  );
  return result.rows;
}

async function getBatch(farmerId, batchId) {
  const result = await query(
    `SELECT v.BatchID            AS "batchId",
            v.CropName           AS "cropName",
            v.CategoryName       AS "categoryName",
            v.BasePrice          AS "cropBasePrice",
            v.Unit               AS "unit",
            v.FarmID             AS "farmId",
            v.FarmName           AS "farmName",
            v.FarmDistrict       AS "farmDistrict",
            v.AratID             AS "aratId",
            v.AratName           AS "aratName",
            v.HarvestDate        AS "harvestDate",
            v.TotalQuantity      AS "totalQuantity",
            v.ReservedQuantity   AS "reservedQuantity",
            v.SoldQuantity       AS "soldQuantity",
            v.AvailableQuantity  AS "availableQuantity",
            v.QualityGrade       AS "qualityGrade",
            v.MoisturePercentage AS "moisturePercentage",
            v.MinimumPrice       AS "minimumPrice",
            v.MinimumBidQuantity AS "minimumBidQuantity",
            v.BiddingStartTime   AS "biddingStartTime",
            v.BiddingEndTime     AS "biddingEndTime",
            v.CurrentHighestBid  AS "currentHighestBid",
            v.BatchStatus        AS "status",
            bs.BidCount          AS "bidCount",
            bs.BidderCount       AS "bidderCount",
            bs.AvgBid            AS "avgBid",
            bs.PctAboveMinimum   AS "pctAboveMinimum",
            bs.HoursRemaining    AS "hoursRemaining",
            bs.BiddingState      AS "biddingState",
            pkg_krishi_metrics.fn_batch_unstored(v.BatchID) AS "unstoredQuantity"
       FROM V_BATCH_AVAILABILITY v
       JOIN V_BIDDING_SUMMARY bs ON bs.BatchID = v.BatchID
      WHERE v.BatchID = :batchId AND v.FarmerID = :farmerId`,
    { batchId, farmerId }
  );

  if (!result.rows.length) throw ApiError.notFound('No such batch.');
  return result.rows[0];
}

/**
 * BR-09 lives here: MinimumPrice must be at least the crop's BasePrice.
 * It is cross-table, so it cannot be a CHECK constraint — this function
 * is the only thing standing between a bad listing and the database.
 */
async function createBatch(farmerId, payload) {
  const required = [
    'farmId', 'cropId', 'aratId', 'harvestDate', 'totalQuantity', 'minimumPrice',
    'minimumBidQuantity',
  ];
  const missing = required.filter(
    (f) => payload[f] === undefined || payload[f] === null || payload[f] === ''
  );
  if (missing.length) {
    throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
  }

  const totalQuantity = Number(payload.totalQuantity);
  const minimumPrice = Number(payload.minimumPrice);
  const minimumBidQuantity = Number(payload.minimumBidQuantity);

  if (!(totalQuantity > 0)) throw ApiError.badRequest('Total quantity must be greater than zero.');
  if (!(minimumPrice > 0)) throw ApiError.badRequest('Minimum price must be greater than zero.');
  if (!(minimumBidQuantity > 0)) {
    throw ApiError.badRequest('Minimum bid quantity must be greater than zero.');
  }
  if (minimumBidQuantity > totalQuantity) {
    throw ApiError.businessRule(
      `Minimum bid quantity (${minimumBidQuantity} kg) cannot exceed the batch's total quantity (${totalQuantity} kg).`
    );
  }

  const start = payload.biddingStartTime ? new Date(payload.biddingStartTime) : null;
  const end = payload.biddingEndTime ? new Date(payload.biddingEndTime) : null;
  if (start && end && end <= start) {
    throw ApiError.badRequest('Bidding end time must be after the start time.');
  }

  return withTransaction(async (connection) => {
    await assertOwnsFarm(connection, farmerId, Number(payload.farmId));

    const crop = await connection.execute(
      `SELECT CropName, BasePrice FROM CROP WHERE CropID = :cropId`,
      { cropId: Number(payload.cropId) }
    );
    if (!crop.rows.length) throw ApiError.badRequest('No such crop.');

    // BR-09.
    const { CROPNAME: cropName, BASEPRICE: basePrice } = crop.rows[0];
    if (minimumPrice < basePrice) {
      throw ApiError.businessRule(
        `BR-09: minimum price ${minimumPrice} is below the base price for ${cropName} (${basePrice}). ` +
          `Listing below the base price is not allowed.`
      );
    }

    const result = await connection.execute(
      `INSERT INTO HARVEST_BATCH (
         FarmID, CropID, AratID, HarvestDate, TotalQuantity,
         QualityGrade, MoisturePercentage, MinimumPrice,
         BiddingStartTime, BiddingEndTime, Status, MinimumBidQuantity
       ) VALUES (
         :farmId, :cropId, :aratId, :harvestDate, :totalQuantity,
         :qualityGrade, :moisturePercentage, :minimumPrice,
         :biddingStartTime, :biddingEndTime, :status, :minimumBidQuantity
       )
       RETURNING BatchID INTO :batchId`,
      {
        farmId: Number(payload.farmId),
        cropId: Number(payload.cropId),
        aratId: Number(payload.aratId),
        harvestDate: new Date(payload.harvestDate),
        totalQuantity,
        qualityGrade: payload.qualityGrade || null,
        moisturePercentage:
          payload.moisturePercentage === '' || payload.moisturePercentage === undefined
            ? null
            : Number(payload.moisturePercentage),
        minimumPrice,
        biddingStartTime: start,
        biddingEndTime: end,
        // A batch with no bidding window is just CREATED; one with a
        // window is LISTED and becomes BIDDING_OPEN when it starts.
        status: start ? 'LISTED' : 'CREATED',
        minimumBidQuantity,
        batchId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    return { batchId: result.outBinds.batchId[0] };
  });
}

// ---------------------------------------------------------------------
// Bids on my batch
// ---------------------------------------------------------------------

async function listBidsForBatch(farmerId, batchId) {
  // Ownership first — otherwise this leaks every buyer's bidding
  // position on batches the caller does not own.
  const owns = await query(
    `SELECT hb.BatchID
       FROM HARVEST_BATCH hb
       JOIN FARM f ON f.FarmID = hb.FarmID
      WHERE hb.BatchID = :batchId AND f.FarmerID = :farmerId`,
    { batchId, farmerId }
  );
  if (!owns.rows.length) throw ApiError.notFound('No such batch.');

  const result = await query(
    `SELECT b.BidID             AS "bidId",
            b.BuyerID           AS "buyerId",
            u.FirstName || ' ' || u.LastName AS "buyerName",
            byr.BusinessName    AS "businessName",
            byr.BuyerType       AS "buyerType",
            b.BidPricePerKg     AS "bidPricePerKg",
            b.RequestedQuantity AS "requestedQuantity",
            b.BidPricePerKg * b.RequestedQuantity AS "bidValue",
            b.BidTime           AS "bidTime",
            b.Status            AS "status",
            b.PreviousBidID     AS "previousBidId"
       FROM BID b
       JOIN BUYER byr ON byr.BuyerID = b.BuyerID
       JOIN USERS u   ON u.UserID    = b.BuyerID
      WHERE b.BatchID = :batchId
      ORDER BY b.BidPricePerKg DESC, b.BidTime`,
    { batchId }
  );
  return result.rows;
}

/**
 * AWARD WINNING BID — transaction #4 of the six in PRD §9.10, and the
 * one the PRD calls "the demo centrepiece".
 *
 * Five writes, all or nothing:
 *   1. the winning BID            -> WON
 *   2. every other ACTIVE bid     -> OUTBID   (housekeeping, see below)
 *   3. HARVEST_BATCH              -> SOLD, SoldQuantity increased
 *   4. INSERT SALE_ORDER                      (the aggregation)
 *   5. INSERT TRANSPORT_REQUEST
 *
 * Step 2 is not in the PRD's four-statement list but belongs in the same
 * transaction: once a batch is awarded, leaving rival bids ACTIVE would
 * misreport the auction state on every screen that filters by status.
 *
 * The batch row is locked with SELECT ... FOR UPDATE before anything is
 * written. Two farmers cannot award the same batch, but the same farmer
 * with two browser tabs can — the lock makes the second attempt wait and
 * then fail the already-SOLD check rather than double-selling the crop.
 */
async function awardBid(farmerId, bidId, payload = {}) {
  const paymentTerms = (payload.paymentTerms || 'ON_DELIVERY').toUpperCase();
  if (!['ADVANCE', 'ON_DELIVERY'].includes(paymentTerms)) {
    throw ApiError.badRequest('Payment terms must be ADVANCE or ON_DELIVERY.');
  }

  return withTransaction(async (connection) => {
    // --- Load the bid, its batch, and prove ownership in one hop ------
    const bidResult = await connection.execute(
      `SELECT b.BidID, b.BatchID, b.BuyerID, b.BidPricePerKg, b.RequestedQuantity,
              b.Status AS BidStatus,
              hb.Status AS BatchStatus, hb.AvailableQuantity, hb.MinimumPrice,
              f.FarmerID, f.Location AS FarmLocation, f.District AS FarmDistrict
         FROM BID b
         JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
         JOIN FARM f           ON f.FarmID   = hb.FarmID
        WHERE b.BidID = :bidId`,
      { bidId }
    );

    if (!bidResult.rows.length) throw ApiError.notFound('No such bid.');
    const bid = bidResult.rows[0];

    if (bid.FARMERID !== farmerId) {
      throw ApiError.notFound('No such bid.');
    }

    // --- Lock the batch so a concurrent award cannot interleave ------
    await connection.execute(
      `SELECT BatchID FROM HARVEST_BATCH WHERE BatchID = :batchId FOR UPDATE`,
      { batchId: bid.BATCHID }
    );

    // --- Guards -----------------------------------------------------
    if (bid.BIDSTATUS !== 'ACTIVE') {
      throw ApiError.businessRule(
        `That bid is ${bid.BIDSTATUS}, not ACTIVE — only a standing bid can be awarded.`
      );
    }
    if (['SOLD', 'DELIVERED'].includes(bid.BATCHSTATUS)) {
      throw ApiError.businessRule('This batch has already been sold.');
    }
    if (bid.REQUESTEDQUANTITY > bid.AVAILABLEQUANTITY) {
      throw ApiError.businessRule(
        `The bid asks for ${bid.REQUESTEDQUANTITY} kg but only ${bid.AVAILABLEQUANTITY} kg remain available.`
      );
    }
    // BR-11's floor half, re-checked at award time: a bid could in
    // principle predate a change to the batch's minimum price.
    if (bid.BIDPRICEPERKG < bid.MINIMUMPRICE) {
      throw ApiError.businessRule(
        `BR-11: bid price ${bid.BIDPRICEPERKG} is below the batch minimum ${bid.MINIMUMPRICE}.`
      );
    }

    // --- 1. Winning bid --------------------------------------------
    await connection.execute(
      `UPDATE BID SET Status = 'WON' WHERE BidID = :bidId`,
      { bidId }
    );

    // --- 2. Everyone else loses ------------------------------------
    const outbid = await connection.execute(
      `UPDATE BID SET Status = 'OUTBID'
        WHERE BatchID = :batchId AND BidID <> :bidId AND Status = 'ACTIVE'`,
      { batchId: bid.BATCHID, bidId }
    );

    // --- 3. Batch: raise SoldQuantity, close it out ONLY if that was
    //        everything -------------------------------------------
    // A bid's RequestedQuantity can be less than the batch's
    // TotalQuantity (BID.RequestedQuantity is independent of it) — the
    // schema's separate TotalQuantity/ReservedQuantity/SoldQuantity
    // columns exist specifically so a batch can be sold off in more than
    // one award. Marking the whole batch SOLD after any award, before
    // checking whether stock remains, stranded the leftover: it can no
    // longer be bid on (BiddingState maps SOLD to CLOSED, so it drops out
    // of the buyer's listings) and no longer be awarded (the farmer UI
    // hides "Accept" once the batch reads SOLD) — a decent chunk of
    // produce with nowhere to go. Caught 2026-08-06 via batch 16
    // (3000 kg total, a 2201 kg bid awarded, 799 kg silently stranded).
    // AvailableQuantity itself is a virtual column and is never written;
    // only SoldQuantity is, and the CASE below reads it in the same
    // expression that sets it, which Oracle evaluates against the
    // pre-update row value.
    await connection.execute(
      `UPDATE HARVEST_BATCH
          SET SoldQuantity = SoldQuantity + :qty,
              Status = CASE
                         WHEN TotalQuantity - ReservedQuantity - (SoldQuantity + :qty) <= 0
                         THEN 'SOLD'
                         ELSE Status
                       END
        WHERE BatchID = :batchId`,
      { qty: bid.REQUESTEDQUANTITY, batchId: bid.BATCHID }
    );

    const remaining = await connection.execute(
      `SELECT AvailableQuantity, Status FROM HARVEST_BATCH WHERE BatchID = :batchId`,
      { batchId: bid.BATCHID }
    );
    const stillAvailable = remaining.rows[0].AVAILABLEQUANTITY;
    const batchFullySold = remaining.rows[0].STATUS === 'SOLD';

    // --- 4. SALE_ORDER (the aggregation) ---------------------------
    // TotalAmount is virtual — never inserted.
    const orderResult = await connection.execute(
      `INSERT INTO SALE_ORDER (BidID, AcceptedQuantity, AcceptedPricePerKg, PaymentTerms)
       VALUES (:bidId, :qty, :price, :paymentTerms)
       RETURNING SaleOrderID INTO :saleOrderId`,
      {
        bidId,
        qty: bid.REQUESTEDQUANTITY,
        price: bid.BIDPRICEPERKG,
        paymentTerms,
        saleOrderId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const saleOrderId = orderResult.outBinds.saleOrderId[0];

    // --- 5. TRANSPORT_REQUEST --------------------------------------
    const buyerAddress = await connection.execute(
      `SELECT NVL(byr.BusinessName, u.FirstName || ' ' || u.LastName) AS Recipient,
              u.Address.Village AS Village, u.Address.Upazila AS Upazila,
              u.Address.District AS District
         FROM BUYER byr JOIN USERS u ON u.UserID = byr.BuyerID
        WHERE byr.BuyerID = :buyerId`,
      { buyerId: bid.BUYERID }
    );
    const buyer = buyerAddress.rows[0];

    const transportResult = await connection.execute(
      `INSERT INTO TRANSPORT_REQUEST (SaleOrderID, PickupLocation, DeliveryLocation)
       VALUES (:saleOrderId, :pickup, :delivery)
       RETURNING TransportID INTO :transportId`,
      {
        saleOrderId,
        pickup: [bid.FARMLOCATION, bid.FARMDISTRICT].filter(Boolean).join(', ').slice(0, 200),
        delivery: [buyer.RECIPIENT, buyer.VILLAGE, buyer.UPAZILA, buyer.DISTRICT]
          .filter(Boolean)
          .join(', ')
          .slice(0, 200),
        transportId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    return {
      saleOrderId,
      transportId: transportResult.outBinds.transportId[0],
      batchId: bid.BATCHID,
      acceptedQuantity: bid.REQUESTEDQUANTITY,
      acceptedPricePerKg: bid.BIDPRICEPERKG,
      totalAmount: Number((bid.REQUESTEDQUANTITY * bid.BIDPRICEPERKG).toFixed(2)),
      paymentTerms,
      bidsOutbid: outbid.rowsAffected || 0,
      // Lets the UI say "799 kg still open for bidding" instead of
      // implying the batch is done when it is not.
      remainingQuantity: stillAvailable,
      batchFullySold,
    };
  });
}

// ---------------------------------------------------------------------
// Storage consent — leg 1 (this farmer's own local storage)
//
// These are thin wrappers around storage.service.js's shared workflow,
// fixed to customerType 'FARMER'. The actual ownership check (this
// proposal's RequestedByFarmerID really is this farmer) lives in
// storage.service.js's assertIsCustomer(), not duplicated here.
// ---------------------------------------------------------------------

/**
 * Everything sitting in this farmer's court. Two shapes land here and
 * `awaiting` tells the UI which:
 *   PROPOSAL — a manager offered space, the farmer accepts/rejects/counters
 *   COUNTER  — the farmer asked, the manager countered the rate, and it
 *              is back with the farmer to settle (accept or reject only)
 * The farmer's own outstanding requests are absent: those are waiting on
 * a manager, and already show in listMyStorage().
 */
async function listStorageProposals(farmerId) {
  const result = await query(
    `SELECT s.AllocationID   AS "allocationId",
            s.BatchID        AS "batchId",
            c.CropName       AS "cropName",
            w.WarehouseName  AS "warehouseName",
            s.UnitNo         AS "unitNo",
            s.QuantityStored AS "quantityStored",
            s.MinimumStorageDays AS "minimumStorageDays",
            s.StorageFeePerKgSnapshot AS "ratePerKg",
            s.CounterRatePerKg AS "counterRatePerKg",
            s.CounteredBy    AS "counteredBy",
            s.ProposedBy     AS "proposedBy",
            s.QuantityStored * NVL(s.CounterRatePerKg, s.StorageFeePerKgSnapshot) AS "estimatedFee",
            s.AllocationStatus AS "allocationStatus",
            CASE WHEN s.AllocationStatus = 'COUNTERED' THEN 'COUNTER' ELSE 'PROPOSAL' END AS "awaiting"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
      WHERE s.RequestedByFarmerID = :farmerId
        AND (   (s.AllocationStatus = 'PENDING_ACCEPT' AND s.ProposedBy = 'MANAGER')
             OR (s.AllocationStatus = 'COUNTERED'      AND s.ProposedBy = 'CUSTOMER'))
      ORDER BY s.AllocationID`,
    { farmerId }
  );
  return result.rows;
}

function respondToStorageProposal(farmerId, allocationId, decision, payload) {
  return storage.respondToProposal('FARMER', farmerId, allocationId, decision, payload);
}

function respondToStorageCounter(farmerId, allocationId, decision) {
  return storage.respondToCounter('FARMER', farmerId, allocationId, decision);
}

function requestStorageAllocation(farmerId, payload) {
  return storage.requestAllocation('FARMER', farmerId, payload);
}

function requestStorageRelease(farmerId, allocationId) {
  return storage.requestRelease('FARMER', farmerId, allocationId);
}

function respondToStorageRelease(farmerId, allocationId, decision) {
  return storage.respondToRelease('FARMER', farmerId, allocationId, decision);
}

function listStorageFees(farmerId) {
  return storage.listFeesForCustomer('FARMER', farmerId);
}

function payStorageFee(farmerId, allocationId, payload) {
  return storage.payFee('FARMER', farmerId, allocationId, payload);
}

/** All this farmer's storage allocations, any status, for a history view. */
async function listMyStorage(farmerId) {
  const result = await query(
    `SELECT s.AllocationID     AS "allocationId",
            s.BatchID          AS "batchId",
            c.CropName         AS "cropName",
            w.WarehouseName    AS "warehouseName",
            s.UnitNo           AS "unitNo",
            s.QuantityStored   AS "quantityStored",
            s.DateIn           AS "dateIn",
            s.DateOut          AS "dateOut",
            s.AllocationStatus AS "allocationStatus",
            s.MinimumStorageDays AS "minimumStorageDays",
            s.MinimumReleaseDate AS "minimumReleaseDate",
            s.StorageFee       AS "storageFee",
            s.ReleaseRequestedBy AS "releaseRequestedBy"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
      WHERE s.RequestedByFarmerID = :farmerId
      ORDER BY s.AllocationID DESC`,
    { farmerId }
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Sales and money in. Both read-only: a farmer never writes a SALE_ORDER
// (awardBid does that) and never writes a PAYMENT (the buyer pays, or the
// driver records cash on delivery — transport.service.js transaction #6).
// ---------------------------------------------------------------------

/** Every order that came out of this farmer's batches. */
async function listOrders(farmerId) {
  const result = await query(
    `SELECT so.SaleOrderID AS "saleOrderId",
            so.OrderDate   AS "orderDate",
            so.AcceptedQuantity   AS "acceptedQuantity",
            so.AcceptedPricePerKg AS "acceptedPricePerKg",
            so.TotalAmount AS "totalAmount",
            so.Status      AS "status",
            so.PaymentTerms AS "paymentTerms",
            hb.BatchID     AS "batchId",
            c.CropName     AS "cropName",
            NVL(byr.BusinessName, ub.FirstName || ' ' || ub.LastName) AS "buyerName",
            tr.TransportID AS "transportId",
            tr.DeliveryStatus AS "deliveryStatus",
            tr.DeliveryDate   AS "deliveryDate",
            NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                  WHERE p.SaleOrderID = so.SaleOrderID
                    AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "amountReceived"
       FROM SALE_ORDER so
       JOIN BID b            ON b.BidID     = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID  = b.BatchID
       JOIN CROP c           ON c.CropID    = hb.CropID
       JOIN FARM f           ON f.FarmID    = hb.FarmID
       JOIN BUYER byr        ON byr.BuyerID = b.BuyerID
       JOIN USERS ub         ON ub.UserID   = byr.BuyerID
       LEFT JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
      WHERE f.FarmerID = :farmerId
      ORDER BY so.SaleOrderID DESC`,
    { farmerId }
  );
  return result.rows;
}

/** Money actually received, newest first. */
async function listPayments(farmerId) {
  const result = await query(
    `SELECT p.PaymentID   AS "paymentId",
            p.SaleOrderID AS "saleOrderId",
            p.Amount      AS "amount",
            p.PaymentMethod AS "paymentMethod",
            p.PaymentDate   AS "paymentDate",
            p.TransactionReference AS "transactionReference",
            p.PaymentStatus AS "paymentStatus",
            c.CropName    AS "cropName",
            so.TotalAmount AS "orderTotal",
            pkg_krishi_metrics.fn_order_outstanding(so.SaleOrderID) AS "outstanding",
            NVL(byr.BusinessName, ub.FirstName || ' ' || ub.LastName) AS "buyerName"
       FROM PAYMENT p
       JOIN SALE_ORDER so    ON so.SaleOrderID = p.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN CROP c           ON c.CropID       = hb.CropID
       JOIN BUYER byr        ON byr.BuyerID    = p.BuyerID
       JOIN USERS ub         ON ub.UserID      = byr.BuyerID
      WHERE p.PaymentType = 'SALE' AND p.FarmerID = :farmerId
      ORDER BY p.PaymentID DESC`,
    { farmerId }
  );
  return result.rows;
}

module.exports = {
  getDashboard,
  listFarms,
  createFarm,
  listBatches,
  getBatch,
  createBatch,
  listBidsForBatch,
  awardBid,
  listOrders,
  listPayments,
  listStorageProposals,
  respondToStorageProposal,
  respondToStorageCounter,
  requestStorageAllocation,
  requestStorageRelease,
  respondToStorageRelease,
  listStorageFees,
  payStorageFee,
  listMyStorage,
};
