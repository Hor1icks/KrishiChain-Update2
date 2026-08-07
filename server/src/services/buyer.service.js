'use strict';

/**
 * Buyer module services.
 *
 * THE AUCTION MODEL
 * At most ONE bid per batch is ACTIVE at any moment — the standing
 * highest. Every earlier bid is OUTBID, and each new bid points at the
 * one it displaced via PreviousBidID. That chain is the recursive
 * relationship from PRD §7, and it is what the seed data already shows:
 *
 *   34.50 (OUTBID) <- 35.25 (OUTBID) <- 36.00 (ACTIVE)
 *
 * Keeping only one ACTIVE bid per batch also satisfies BR-14 ("one
 * ACTIVE bid per buyer per batch") for free: if only one bid on the whole
 * batch is ACTIVE, no buyer can hold two.
 *
 * BR-05 / acceptance case T-05 ("a farmer must not bid on their own
 * batch") needs no check here. FARMER and BUYER are disjoint subclasses
 * of USERS — one person cannot hold both roles, so a farmer has no buyer
 * identity to bid with. The specialization enforces it structurally.
 */

const oracledb = require('oracledb');
const storage = require('./storage.service');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

async function getDashboard(buyerId) {
  const bidStats = await query(
    `SELECT b.Status AS "status",
            COUNT(*) AS "count",
            SUM(b.BidPricePerKg * b.RequestedQuantity) AS "value"
       FROM BID b
      WHERE b.BuyerID = :buyerId
      GROUP BY b.Status
      ORDER BY b.Status`,
    { buyerId }
  );

  // The paid total is a SEPARATE query, not a scalar subquery alongside
  // the aggregates. Oracle requires every item in an aggregated select
  // list with no GROUP BY to itself be an aggregate; a scalar subquery is
  // not one, and mixing them raises ORA-00937.
  const orders = await query(
    `SELECT COUNT(*)                    AS "orderCount",
            NVL(SUM(so.TotalAmount), 0) AS "totalCommitted"
       FROM SALE_ORDER so
       JOIN BID b ON b.BidID = so.BidID
      WHERE b.BuyerID = :buyerId`,
    { buyerId }
  );

  const paid = await query(
    `SELECT NVL(SUM(p.Amount), 0) AS "totalPaid"
       FROM PAYMENT p
      WHERE p.BuyerID = :buyerId
        AND p.PaymentStatus IN ('PENDING', 'COMPLETED')`,
    { buyerId }
  );

  // Auctions this buyer is currently leading, and ones they have lost —
  // the two things a bidder actually wants to know on landing.
  const leading = await query(
    `SELECT b.BidID          AS "bidId",
            b.BatchID        AS "batchId",
            c.CropName       AS "cropName",
            b.BidPricePerKg  AS "bidPricePerKg",
            b.RequestedQuantity AS "requestedQuantity",
            bs.HoursRemaining AS "hoursRemaining",
            bs.BiddingState   AS "biddingState"
       FROM BID b
       JOIN HARVEST_BATCH hb    ON hb.BatchID = b.BatchID
       JOIN CROP c              ON c.CropID   = hb.CropID
       JOIN V_BIDDING_SUMMARY bs ON bs.BatchID = b.BatchID
      WHERE b.BuyerID = :buyerId
        AND b.Status  = 'ACTIVE'
      ORDER BY bs.HoursRemaining`,
    { buyerId }
  );

  return {
    bidsByStatus: bidStats.rows,
    orders: { ...orders.rows[0], ...paid.rows[0] },
    leading: leading.rows,
  };
}

// ---------------------------------------------------------------------
// Browse listings
// ---------------------------------------------------------------------

/**
 * The marketplace. Only batches whose bidding window is genuinely open
 * are offered — a listing the buyer cannot act on is noise.
 *
 * "myBidStatus" is a correlated subquery rather than a join so that a
 * batch still appears exactly once whether this buyer has bid on it or
 * not.
 */
async function browseBatches(buyerId, filters = {}) {
  const binds = { buyerId };
  let where = `bs.BiddingState = 'OPEN NOW'`;

  if (filters.cropId) {
    where += ` AND v.CropID = :cropId`;
    binds.cropId = Number(filters.cropId);
  }
  if (filters.aratId) {
    where += ` AND v.AratID = :aratId`;
    binds.aratId = Number(filters.aratId);
  }

  const result = await query(
    `SELECT v.BatchID            AS "batchId",
            v.CropName           AS "cropName",
            v.CategoryName       AS "categoryName",
            v.Unit               AS "unit",
            v.BasePrice          AS "basePrice",
            v.FarmerName         AS "farmerName",
            v.FarmName           AS "farmName",
            v.FarmDistrict       AS "farmDistrict",
            v.AratName           AS "aratName",
            v.HarvestDate        AS "harvestDate",
            v.AvailableQuantity  AS "availableQuantity",
            v.QualityGrade       AS "qualityGrade",
            v.MoisturePercentage AS "moisturePercentage",
            v.MinimumPrice       AS "minimumPrice",
            v.CurrentHighestBid  AS "currentHighestBid",
            v.BiddingEndTime     AS "biddingEndTime",
            bs.BidCount          AS "bidCount",
            bs.BidderCount       AS "bidderCount",
            bs.HoursRemaining    AS "hoursRemaining",
            (SELECT b.Status FROM BID b
              WHERE b.BatchID = v.BatchID AND b.BuyerID = :buyerId
                AND b.Status = 'ACTIVE') AS "myBidStatus"
       FROM V_BATCH_AVAILABILITY v
       JOIN V_BIDDING_SUMMARY bs ON bs.BatchID = v.BatchID
      WHERE ${where}
      ORDER BY bs.HoursRemaining, v.BatchID`,
    binds
  );
  return result.rows;
}

async function getBatch(buyerId, batchId) {
  const result = await query(
    `SELECT v.BatchID            AS "batchId",
            v.CropName           AS "cropName",
            v.CategoryName       AS "categoryName",
            v.Unit               AS "unit",
            v.BasePrice          AS "basePrice",
            v.FarmerName         AS "farmerName",
            v.FarmName           AS "farmName",
            v.FarmDistrict       AS "farmDistrict",
            v.AratName           AS "aratName",
            v.AratDistrict       AS "aratDistrict",
            v.HarvestDate        AS "harvestDate",
            v.TotalQuantity      AS "totalQuantity",
            v.AvailableQuantity  AS "availableQuantity",
            v.QualityGrade       AS "qualityGrade",
            v.MoisturePercentage AS "moisturePercentage",
            v.MinimumPrice       AS "minimumPrice",
            v.CurrentHighestBid  AS "currentHighestBid",
            v.BiddingStartTime   AS "biddingStartTime",
            v.BiddingEndTime     AS "biddingEndTime",
            v.BatchStatus        AS "status",
            bs.BidCount          AS "bidCount",
            bs.BidderCount       AS "bidderCount",
            bs.AvgBid            AS "avgBid",
            bs.HoursRemaining    AS "hoursRemaining",
            bs.BiddingState      AS "biddingState",
            (SELECT b.BidID FROM BID b
              WHERE b.BatchID = v.BatchID AND b.BuyerID = :buyerId
                AND b.Status = 'ACTIVE') AS "myActiveBidId"
       FROM V_BATCH_AVAILABILITY v
       JOIN V_BIDDING_SUMMARY bs ON bs.BatchID = v.BatchID
      WHERE v.BatchID = :batchId`,
    { batchId, buyerId }
  );

  if (!result.rows.length) throw ApiError.notFound('No such batch.');

  // The bid history is public to bidders — an auction where you cannot
  // see the competition is not an auction. Buyer names are shown; the
  // seed's own bid chains are the demo for this.
  const history = await query(
    `SELECT b.BidID            AS "bidId",
            b.BidPricePerKg    AS "bidPricePerKg",
            b.RequestedQuantity AS "requestedQuantity",
            b.BidTime          AS "bidTime",
            b.Status           AS "status",
            b.PreviousBidID    AS "previousBidId",
            u.FirstName || ' ' || u.LastName AS "buyerName",
            CASE WHEN b.BuyerID = :buyerId THEN 1 ELSE 0 END AS "isMine"
       FROM BID b
       JOIN USERS u ON u.UserID = b.BuyerID
      WHERE b.BatchID = :batchId
      ORDER BY b.BidPricePerKg DESC, b.BidTime DESC`,
    { batchId, buyerId }
  );

  return { ...result.rows[0], bidHistory: history.rows };
}

// ---------------------------------------------------------------------
// Place bid
// ---------------------------------------------------------------------

/**
 * PLACE BID — transaction #3 of the six in PRD §9.10.
 *
 * Three writes, all or nothing:
 *   1. every standing ACTIVE bid on the batch -> OUTBID
 *   2. INSERT the new BID as ACTIVE, PreviousBidID = the one it displaced
 *   3. promote the batch LISTED -> BIDDING_OPEN if this is its first bid
 *
 * Step 3 is not in the PRD's list, but a batch created through the farmer
 * module starts LISTED; without this it would still read LISTED after
 * receiving bids, and every status-filtered screen would be wrong.
 *
 * The batch row is locked FOR UPDATE before the current highest is read.
 * Without that lock two buyers bidding at the same instant could both
 * read the same "current highest", both pass BR-11, and both insert —
 * leaving two ACTIVE bids and a broken chain.
 */
async function placeBid(buyerId, payload) {
  const batchId = Number(payload.batchId);
  const bidPricePerKg = Number(payload.bidPricePerKg);
  const requestedQuantity = Number(payload.requestedQuantity);

  if (!batchId) throw ApiError.badRequest('batchId is required.');
  if (!(bidPricePerKg > 0)) throw ApiError.badRequest('Bid price must be greater than zero.');
  if (!(requestedQuantity > 0)) {
    throw ApiError.badRequest('Requested quantity must be greater than zero.');
  }

  return withTransaction(async (connection) => {
    // --- Lock the batch, then read its current state -----------------
    const batchResult = await connection.execute(
      `SELECT hb.BatchID, hb.Status, hb.MinimumPrice, hb.AvailableQuantity,
              hb.BiddingStartTime, hb.BiddingEndTime,
              CASE WHEN hb.BiddingStartTime IS NULL
                        OR CAST(hb.BiddingStartTime AS DATE) > SYSDATE THEN 'NOT_OPEN'
                   WHEN CAST(hb.BiddingEndTime AS DATE) < SYSDATE      THEN 'CLOSED'
                   ELSE 'OPEN' END AS WindowState
         FROM HARVEST_BATCH hb
        WHERE hb.BatchID = :batchId
          FOR UPDATE`,
      { batchId }
    );

    if (!batchResult.rows.length) throw ApiError.notFound('No such batch.');
    const batch = batchResult.rows[0];

    // --- Guards -----------------------------------------------------
    if (['SOLD', 'DELIVERED', 'EXPIRED'].includes(batch.STATUS)) {
      throw ApiError.businessRule(`This batch is ${batch.STATUS} and no longer accepts bids.`);
    }
    if (batch.WINDOWSTATE === 'NOT_OPEN') {
      throw ApiError.businessRule('Bidding has not opened on this batch yet.');
    }
    if (batch.WINDOWSTATE === 'CLOSED') {
      throw ApiError.businessRule('Bidding has closed on this batch.');
    }
    if (requestedQuantity > batch.AVAILABLEQUANTITY) {
      throw ApiError.businessRule(
        `Only ${batch.AVAILABLEQUANTITY} kg are available; you asked for ${requestedQuantity} kg.`
      );
    }

    // --- BR-11, first half: at or above the farmer's floor -----------
    if (bidPricePerKg < batch.MINIMUMPRICE) {
      throw ApiError.businessRule(
        `BR-11: your bid of ${bidPricePerKg} is below the minimum price of ${batch.MINIMUMPRICE} per kg.`
      );
    }

    // --- BR-11, second half: strictly above the standing bid ---------
    const standing = await connection.execute(
      `SELECT BidID, BuyerID, BidPricePerKg
         FROM BID
        WHERE BatchID = :batchId AND Status = 'ACTIVE'`,
      { batchId }
    );
    const previousBid = standing.rows[0] || null;

    if (previousBid && bidPricePerKg <= previousBid.BIDPRICEPERKG) {
      throw ApiError.businessRule(
        `BR-11: the standing bid is ${previousBid.BIDPRICEPERKG} per kg. ` +
          `Your bid must be strictly higher.`
      );
    }
    if (previousBid && previousBid.BUYERID === buyerId) {
      // Allowed — this is the buyer raising their own bid. Their old bid
      // becomes OUTBID in step 1 below, so BR-14 still holds: they never
      // end up with two ACTIVE bids on the same batch.
    }

    // --- 1. Displace the standing bid --------------------------------
    await connection.execute(
      `UPDATE BID SET Status = 'OUTBID' WHERE BatchID = :batchId AND Status = 'ACTIVE'`,
      { batchId }
    );

    // --- 2. The new standing bid -------------------------------------
    const inserted = await connection.execute(
      `INSERT INTO BID (BatchID, BuyerID, BidPricePerKg, RequestedQuantity, Status, PreviousBidID)
       VALUES (:batchId, :buyerId, :price, :qty, 'ACTIVE', :previousBidId)
       RETURNING BidID INTO :bidId`,
      {
        batchId,
        buyerId,
        price: bidPricePerKg,
        qty: requestedQuantity,
        previousBidId: previousBid ? previousBid.BIDID : null,
        bidId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    // --- 3. First bid opens the auction ------------------------------
    if (batch.STATUS === 'LISTED') {
      await connection.execute(
        `UPDATE HARVEST_BATCH SET Status = 'BIDDING_OPEN' WHERE BatchID = :batchId`,
        { batchId }
      );
    }

    return {
      bidId: inserted.outBinds.bidId[0],
      batchId,
      bidPricePerKg,
      requestedQuantity,
      bidValue: Number((bidPricePerKg * requestedQuantity).toFixed(2)),
      outbid: previousBid
        ? { bidId: previousBid.BIDID, price: previousBid.BIDPRICEPERKG }
        : null,
    };
  });
}

// ---------------------------------------------------------------------
// My bids
// ---------------------------------------------------------------------

async function listMyBids(buyerId) {
  const result = await query(
    `SELECT b.BidID             AS "bidId",
            b.BatchID           AS "batchId",
            c.CropName          AS "cropName",
            fu.FirstName || ' ' || fu.LastName AS "farmerName",
            va.AratName         AS "aratName",
            b.BidPricePerKg     AS "bidPricePerKg",
            b.RequestedQuantity AS "requestedQuantity",
            b.BidPricePerKg * b.RequestedQuantity AS "bidValue",
            b.BidTime           AS "bidTime",
            b.Status            AS "status",
            hb.MinimumPrice     AS "minimumPrice",
            hb.Status           AS "batchStatus",
            (SELECT MAX(x.BidPricePerKg) FROM BID x
              WHERE x.BatchID = b.BatchID AND x.Status IN ('ACTIVE','WON')) AS "standingBid",
            so.SaleOrderID      AS "saleOrderId",
            so.TotalAmount      AS "orderTotal",
            so.PaymentTerms     AS "paymentTerms",
            tr.DeliveryStatus   AS "deliveryStatus"
       FROM BID b
       JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
       JOIN CROP c           ON c.CropID   = hb.CropID
       JOIN FARM f           ON f.FarmID   = hb.FarmID
       JOIN USERS fu         ON fu.UserID  = f.FarmerID
       JOIN VIRTUAL_ARAT va  ON va.AratID  = hb.AratID
       LEFT JOIN SALE_ORDER so       ON so.BidID       = b.BidID
       LEFT JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
      WHERE b.BuyerID = :buyerId
      ORDER BY b.BidTime DESC`,
    { buyerId }
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Storage consent — leg 2 (this buyer's local storage, post-sale)
//
// A manager proposes leg-2 storage against one of this buyer's sale
// orders (storage.service.js's listSaleOrdersAwaitingStorage() is how
// they find it); the buyer's only lever here is accept/reject, same
// shape as leg 1's farmer side. There is no separate "request a
// warehouse" step for the buyer — a rejected proposal just leaves the
// sale order open for a different manager to propose against, which
// keeps this symmetric with leg 1 rather than adding a second kind of
// request flow.
// ---------------------------------------------------------------------

async function listStorageProposals(buyerId) {
  const result = await query(
    `SELECT s.AllocationID   AS "allocationId",
            s.BatchID        AS "batchId",
            s.SaleOrderID    AS "saleOrderId",
            c.CropName       AS "cropName",
            w.WarehouseName  AS "warehouseName",
            w.District       AS "warehouseDistrict",
            s.UnitNo         AS "unitNo",
            s.QuantityStored AS "quantityStored",
            s.MinimumStorageDays AS "minimumStorageDays",
            s.StorageFeePerKgSnapshot AS "ratePerKg",
            s.QuantityStored * s.StorageFeePerKgSnapshot AS "estimatedFee",
            s.AllocationStatus AS "allocationStatus"
       FROM STORES s
       JOIN WAREHOUSE w      ON w.WarehouseID = s.WarehouseID
       JOIN HARVEST_BATCH hb ON hb.BatchID    = s.BatchID
       JOIN CROP c           ON c.CropID      = hb.CropID
      WHERE s.RequestedByBuyerID = :buyerId
        AND s.AllocationStatus = 'PENDING_ACCEPT'
      ORDER BY s.AllocationID`,
    { buyerId }
  );
  return result.rows;
}

function respondToStorageProposal(buyerId, allocationId, decision) {
  return storage.respondToProposal('BUYER', buyerId, allocationId, decision);
}

function requestStorageRelease(buyerId, allocationId) {
  return storage.requestRelease('BUYER', buyerId, allocationId);
}

function respondToStorageRelease(buyerId, allocationId, decision) {
  return storage.respondToRelease('BUYER', buyerId, allocationId, decision);
}

function listStorageFees(buyerId) {
  return storage.listFeesForCustomer('BUYER', buyerId);
}

function payStorageFee(buyerId, allocationId, payload) {
  return storage.payFee('BUYER', buyerId, allocationId, payload);
}

async function listMyStorage(buyerId) {
  const result = await query(
    `SELECT s.AllocationID     AS "allocationId",
            s.BatchID          AS "batchId",
            s.SaleOrderID      AS "saleOrderId",
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
      WHERE s.RequestedByBuyerID = :buyerId
      ORDER BY s.AllocationID DESC`,
    { buyerId }
  );
  return result.rows;
}

// ---------------------------------------------------------------------
// Orders, money out, and reviews
// ---------------------------------------------------------------------

/** Everything this buyer has won, with its delivery and payment state. */
async function listOrders(buyerId) {
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
            uf.FirstName || ' ' || uf.LastName AS "farmerName",
            tr.DeliveryStatus AS "deliveryStatus",
            tr.DeliveryDate   AS "deliveryDate",
            tr.PickupLocation AS "pickupLocation",
            tr.DeliveryLocation AS "deliveryLocation",
            NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                  WHERE p.SaleOrderID = so.SaleOrderID
                    AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "amountPaid",
            (SELECT r.ReviewID FROM REVIEW r WHERE r.SaleOrderID = so.SaleOrderID) AS "reviewId"
       FROM SALE_ORDER so
       JOIN BID b            ON b.BidID    = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
       JOIN CROP c           ON c.CropID   = hb.CropID
       JOIN FARM f           ON f.FarmID   = hb.FarmID
       JOIN USERS uf         ON uf.UserID  = f.FarmerID
       LEFT JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
      WHERE b.BuyerID = :buyerId
      ORDER BY so.SaleOrderID DESC`,
    { buyerId }
  );
  return result.rows;
}

async function listPayments(buyerId) {
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
            uf.FirstName || ' ' || uf.LastName AS "farmerName"
       FROM PAYMENT p
       JOIN SALE_ORDER so    ON so.SaleOrderID = p.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN CROP c           ON c.CropID       = hb.CropID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
       JOIN USERS uf         ON uf.UserID      = f.FarmerID
      WHERE p.BuyerID = :buyerId
      ORDER BY p.PaymentID DESC`,
    { buyerId }
  );
  return result.rows;
}

/**
 * Pay a farmer directly (D-2 — no ARAT commission, no escrow).
 *
 * BR-19 (never more than the order total) and BR-20 (nothing before
 * DELIVERED unless the terms are ADVANCE) are enforced by
 * trg_payment_biz_rules, which raises ORA-20001 / ORA-20002. Those reach
 * the client as HTTP 422 with the trigger's own wording — errorHandler.js
 * already maps them, so this deliberately does not re-check either rule
 * and risk the two copies drifting apart.
 */
async function payOrder(buyerId, saleOrderId, payload) {
  const amount = Number(payload.amount);
  if (!(amount > 0)) throw ApiError.badRequest('Amount must be greater than zero.');
  if (!payload.paymentMethod) throw ApiError.badRequest('paymentMethod is required.');

  return withTransaction(async (connection) => {
    const orderResult = await connection.execute(
      `SELECT so.SaleOrderID, so.TotalAmount, so.PaymentTerms, so.Status,
              b.BuyerID, f.FarmerID
         FROM SALE_ORDER so
         JOIN BID b            ON b.BidID    = so.BidID
         JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
         JOIN FARM f           ON f.FarmID   = hb.FarmID
        WHERE so.SaleOrderID = :saleOrderId
          FOR UPDATE OF so.Status`,
      { saleOrderId }
    );
    if (!orderResult.rows.length) throw ApiError.notFound('No such order.');
    const order = orderResult.rows[0];
    if (order.BUYERID !== buyerId) throw ApiError.forbidden('That is not your order.');

    const reference = `PAY-${Date.now()}-${saleOrderId}`;
    const inserted = await connection.execute(
      `INSERT INTO PAYMENT (SaleOrderID, BuyerID, FarmerID, Amount,
                            PaymentMethod, TransactionReference, PaymentStatus)
       VALUES (:saleOrderId, :buyerId, :farmerId, :amount,
               :method, :reference, 'COMPLETED')
       RETURNING PaymentID INTO :paymentId`,
      {
        saleOrderId,
        buyerId,
        farmerId: order.FARMERID,
        amount,
        method: payload.paymentMethod,
        reference,
        paymentId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    const paidResult = await connection.execute(
      `SELECT NVL(SUM(Amount), 0) AS Paid FROM PAYMENT
        WHERE SaleOrderID = :saleOrderId AND PaymentStatus IN ('PENDING','COMPLETED')`,
      { saleOrderId }
    );
    const paid = paidResult.rows[0].PAID;

    // Fully paid AND already delivered means there is nothing left to
    // wait for. A fully-paid ADVANCE order still in transit stays put.
    const deliveredResult = await connection.execute(
      `SELECT DeliveryStatus FROM TRANSPORT_REQUEST WHERE SaleOrderID = :saleOrderId`,
      { saleOrderId }
    );
    const delivered = deliveredResult.rows[0]?.DELIVERYSTATUS === 'DELIVERED';
    if (paid >= order.TOTALAMOUNT && delivered) {
      await connection.execute(
        `UPDATE SALE_ORDER SET Status = 'COMPLETED' WHERE SaleOrderID = :saleOrderId`,
        { saleOrderId }
      );
    }

    return {
      paymentId: inserted.outBinds.paymentId[0],
      saleOrderId,
      amount,
      transactionReference: reference,
      totalPaid: paid,
      orderTotal: order.TOTALAMOUNT,
      outstanding: Number((order.TOTALAMOUNT - paid).toFixed(2)),
      orderCompleted: paid >= order.TOTALAMOUNT && delivered,
    };
  });
}

async function listReviews(buyerId) {
  const result = await query(
    `SELECT r.ReviewID    AS "reviewId",
            r.SaleOrderID AS "saleOrderId",
            r.Rating      AS "rating",
            r.ReviewComment AS "reviewComment",
            r.ReviewDate  AS "reviewDate",
            c.CropName    AS "cropName",
            so.TotalAmount AS "orderTotal",
            uf.FirstName || ' ' || uf.LastName AS "farmerName"
       FROM REVIEW r
       JOIN SALE_ORDER so    ON so.SaleOrderID = r.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN CROP c           ON c.CropID       = hb.CropID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
       JOIN USERS uf         ON uf.UserID      = f.FarmerID
      WHERE b.BuyerID = :buyerId
      ORDER BY r.ReviewID DESC`,
    { buyerId }
  );
  return result.rows;
}

/**
 * Leave a review. UQ_REVIEW_ORDER makes it one per order at the database
 * level; the ownership check is what stops a buyer reviewing someone
 * else's purchase.
 */
async function createReview(buyerId, payload) {
  const saleOrderId = Number(payload.saleOrderId);
  const rating = Number(payload.rating);
  if (!saleOrderId) throw ApiError.badRequest('saleOrderId is required.');
  if (!(rating >= 1 && rating <= 5)) {
    throw ApiError.badRequest('Rating must be between 1 and 5.');
  }

  return withTransaction(async (connection) => {
    const orderResult = await connection.execute(
      `SELECT so.SaleOrderID, so.Status, b.BuyerID
         FROM SALE_ORDER so JOIN BID b ON b.BidID = so.BidID
        WHERE so.SaleOrderID = :saleOrderId`,
      { saleOrderId }
    );
    if (!orderResult.rows.length) throw ApiError.notFound('No such order.');
    if (orderResult.rows[0].BUYERID !== buyerId) {
      throw ApiError.forbidden('You can only review your own orders.');
    }

    try {
      // NOT :comment — COMMENT is an Oracle reserved word, and using it as
      // a bind name fails with ORA-01745 before the statement even runs.
      const inserted = await connection.execute(
        `INSERT INTO REVIEW (SaleOrderID, Rating, ReviewComment)
         VALUES (:saleOrderId, :rating, :reviewComment)
         RETURNING ReviewID INTO :reviewId`,
        {
          saleOrderId,
          rating,
          reviewComment: payload.reviewComment || null,
          reviewId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
      );
      return { reviewId: inserted.outBinds.reviewId[0], saleOrderId, rating };
    } catch (err) {
      if (err.message.includes('UQ_REVIEW_ORDER')) {
        throw ApiError.conflict('You have already reviewed this order.');
      }
      throw err;
    }
  });
}

module.exports = {
  getDashboard,
  browseBatches,
  getBatch,
  placeBid,
  listMyBids,
  listOrders,
  listPayments,
  payOrder,
  listReviews,
  createReview,
  listStorageProposals,
  respondToStorageProposal,
  requestStorageRelease,
  respondToStorageRelease,
  listStorageFees,
  payStorageFee,
  listMyStorage,
};
