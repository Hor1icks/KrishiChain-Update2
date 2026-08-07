'use strict';

/**
 * Admin module — oversight, not participation. Journey J-07: filter users
 * and complaints, change status, log daily market prices, read reports.
 *
 * Admin deliberately cannot bid, award, allocate or deliver. Every write
 * here is either reference data (DAILY_MARKET_PRICE) or a status change on
 * something a real participant created (COMPLAINT). Nothing in this file
 * touches BID, SALE_ORDER or PAYMENT — an admin who could rewrite a sale
 * would make the whole audit trail meaningless.
 */

const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

/** Stat cards + the four reports J-07 asks for. */
async function getDashboard() {
  const counts = await query(
    `SELECT
       (SELECT COUNT(*) FROM USERS)                                    AS "userCount",
       (SELECT COUNT(*) FROM FARMER)                                   AS "farmerCount",
       (SELECT COUNT(*) FROM BUYER)                                    AS "buyerCount",
       (SELECT COUNT(*) FROM HARVEST_BATCH)                            AS "batchCount",
       (SELECT COUNT(*) FROM HARVEST_BATCH WHERE Status = 'BIDDING_OPEN') AS "openAuctions",
       (SELECT COUNT(*) FROM BID)                                      AS "bidCount",
       (SELECT COUNT(*) FROM SALE_ORDER)                               AS "orderCount",
       (SELECT NVL(SUM(TotalAmount), 0) FROM SALE_ORDER)               AS "grossValue",
       (SELECT NVL(SUM(Amount), 0) FROM PAYMENT
         WHERE PaymentStatus IN ('PENDING','COMPLETED'))               AS "amountPaid",
       (SELECT COUNT(*) FROM COMPLAINT WHERE Status IN ('OPEN','IN_REVIEW')) AS "openComplaints",
       (SELECT COUNT(*) FROM TRANSPORT_REQUEST WHERE DeliveryStatus <> 'DELIVERED') AS "undelivered",
       (SELECT COUNT(*) FROM DAILY_MARKET_PRICE WHERE PriceDate = TRUNC(SYSDATE)) AS "pricesLoggedToday"
     FROM dual`
  );

  // Unsold batches — the anti-join from Q4, surfaced as a report.
  const unsold = await query(
    `SELECT hb.BatchID AS "batchId", c.CropName AS "cropName",
            hb.TotalQuantity AS "totalQuantity", hb.Status AS "status",
            u.FirstName || ' ' || u.LastName AS "farmerName"
       FROM HARVEST_BATCH hb
       JOIN CROP c  ON c.CropID  = hb.CropID
       JOIN FARM f  ON f.FarmID  = hb.FarmID
       JOIN USERS u ON u.UserID  = f.FarmerID
      WHERE NOT EXISTS (SELECT 1 FROM BID b WHERE b.BatchID = hb.BatchID)
      ORDER BY hb.BatchID`
  );

  // Payment reconciliation — delivered but not settled (Q7).
  const unpaid = await query(
    `SELECT so.SaleOrderID AS "saleOrderId", so.TotalAmount AS "totalAmount",
            tr.DeliveryDate AS "deliveryDate", so.Status AS "orderStatus",
            NVL(byr.BusinessName, u.FirstName || ' ' || u.LastName) AS "buyerName",
            so.TotalAmount - NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                                   WHERE p.SaleOrderID = so.SaleOrderID
                                     AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS "outstanding"
       FROM SALE_ORDER so
       JOIN TRANSPORT_REQUEST tr ON tr.SaleOrderID = so.SaleOrderID
       JOIN BID b     ON b.BidID     = so.BidID
       JOIN BUYER byr ON byr.BuyerID = b.BuyerID
       JOIN USERS u   ON u.UserID    = byr.BuyerID
      WHERE tr.DeliveryStatus = 'DELIVERED'
        AND so.TotalAmount > NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                                   WHERE p.SaleOrderID = so.SaleOrderID
                                     AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0)
      ORDER BY so.SaleOrderID`
  );

  // Yield by crop — what the platform actually moved.
  const byCrop = await query(
    `SELECT c.CropName AS "cropName",
            COUNT(DISTINCT hb.BatchID) AS "batches",
            NVL(SUM(hb.TotalQuantity), 0) AS "totalQuantity",
            NVL(SUM(hb.SoldQuantity), 0)  AS "soldQuantity"
       FROM CROP c
       LEFT JOIN HARVEST_BATCH hb ON hb.CropID = c.CropID
      GROUP BY c.CropName
      ORDER BY c.CropName`
  );

  return { summary: counts.rows[0], unsoldBatches: unsold.rows, unpaidOrders: unpaid.rows, byCrop: byCrop.rows };
}

/**
 * Everyone on the platform, with their subclass detail folded in. The
 * five LEFT JOINs are the total/disjoint specialization made visible —
 * exactly one of them matches for any given row.
 */
async function listUsers(filters = {}) {
  const role = filters.role || null;
  const search = filters.search ? `%${filters.search.toLowerCase()}%` : null;

  const result = await query(
    `SELECT u.UserID AS "userId",
            u.FirstName || ' ' || NVL(u.MiddleName || ' ', '') || u.LastName AS "name",
            u.Email AS "email", u.Gender AS "gender", u.District AS "district",
            u.RegistrationDate AS "registrationDate",
            CASE WHEN f.FarmerID   IS NOT NULL THEN 'FARMER'
                 WHEN b.BuyerID    IS NOT NULL THEN 'BUYER'
                 WHEN a.AdminID    IS NOT NULL THEN 'ADMIN'
                 WHEN s.ManagerID  IS NOT NULL THEN 'STORAGE_MANAGER'
                 WHEN t.PersonnelID IS NOT NULL THEN 'TRANSPORT_PERSONNEL'
            END AS "role",
            NVL(b.BusinessName, NVL(a.Designation, t.LicenseNo)) AS "detail",
            (SELECT COUNT(*) FROM USER_PHONE up WHERE up.UserID = u.UserID) AS "phoneCount"
       FROM USERS u
       LEFT JOIN FARMER f              ON f.FarmerID    = u.UserID
       LEFT JOIN BUYER b               ON b.BuyerID     = u.UserID
       LEFT JOIN ADMIN_STAFF a         ON a.AdminID     = u.UserID
       LEFT JOIN STORAGE_MANAGER s     ON s.ManagerID   = u.UserID
       LEFT JOIN TRANSPORT_PERSONNEL t ON t.PersonnelID = u.UserID
      WHERE (:role IS NULL OR
             :role = CASE WHEN f.FarmerID   IS NOT NULL THEN 'FARMER'
                          WHEN b.BuyerID    IS NOT NULL THEN 'BUYER'
                          WHEN a.AdminID    IS NOT NULL THEN 'ADMIN'
                          WHEN s.ManagerID  IS NOT NULL THEN 'STORAGE_MANAGER'
                          WHEN t.PersonnelID IS NOT NULL THEN 'TRANSPORT_PERSONNEL'
                     END)
        AND (:search IS NULL OR
             LOWER(u.FirstName || ' ' || u.LastName) LIKE :search OR
             LOWER(u.Email) LIKE :search)
      ORDER BY u.UserID`,
    { role, search }
  );
  return result.rows;
}

/**
 * Daily market prices. Row-limited with ROWNUM in an inline view —
 * 11g has no FETCH FIRST.
 */
async function listDailyPrices(filters = {}) {
  const cropId = filters.cropId ? Number(filters.cropId) : null;
  const aratId = filters.aratId ? Number(filters.aratId) : null;

  const result = await query(
    `SELECT * FROM (
       SELECT dmp.PriceDate AS "priceDate",
              c.CropID      AS "cropId",
              c.CropName    AS "cropName",
              va.AratID     AS "aratId",
              va.AratName   AS "aratName",
              dmp.PricePerKg AS "pricePerKg",
              dmp.MinPrice   AS "minPrice",
              dmp.MaxPrice   AS "maxPrice",
              u.FirstName || ' ' || u.LastName AS "loggedBy"
         FROM DAILY_MARKET_PRICE dmp
         JOIN CROP c          ON c.CropID  = dmp.CropID
         JOIN VIRTUAL_ARAT va ON va.AratID = dmp.AratID
         JOIN USERS u         ON u.UserID  = dmp.LoggedBy
        WHERE (:cropId IS NULL OR dmp.CropID = :cropId)
          AND (:aratId IS NULL OR dmp.AratID = :aratId)
        ORDER BY dmp.PriceDate DESC, c.CropName, va.AratName
     ) WHERE ROWNUM <= 100`,
    { cropId, aratId }
  );
  return result.rows;
}

/**
 * Log a price. BR/T-08: (CropID, AratID, PriceDate) is the primary key,
 * so a second entry for the same crop, arat and day is rejected by the
 * database. Caught here only to turn ORA-00001 into a sentence.
 */
async function logDailyPrice(adminId, payload) {
  const cropId = Number(payload.cropId);
  const aratId = Number(payload.aratId);
  const pricePerKg = Number(payload.pricePerKg);
  const minPrice = Number(payload.minPrice);
  const maxPrice = Number(payload.maxPrice);

  if (!cropId || !aratId) throw ApiError.badRequest('cropId and aratId are required.');
  if (!(pricePerKg > 0)) throw ApiError.badRequest('Price per kg must be greater than zero.');
  if (!(minPrice > 0) || !(maxPrice > 0)) {
    throw ApiError.badRequest('Minimum and maximum price are required.');
  }
  // Mirrors CK_DMP_RANGE so the user gets a sentence, not an ORA- code.
  if (!(minPrice <= pricePerKg && pricePerKg <= maxPrice)) {
    throw ApiError.businessRule(
      `The day's price must sit inside its own range: ${minPrice} <= ${pricePerKg} <= ${maxPrice}.`
    );
  }

  return withTransaction(async (connection) => {
    try {
      await connection.execute(
        `INSERT INTO DAILY_MARKET_PRICE (CropID, AratID, PriceDate, PricePerKg, MinPrice, MaxPrice, LoggedBy)
         VALUES (:cropId, :aratId, TRUNC(:priceDate), :pricePerKg, :minPrice, :maxPrice, :adminId)`,
        {
          cropId,
          aratId,
          priceDate: payload.priceDate ? new Date(payload.priceDate) : new Date(),
          pricePerKg,
          minPrice,
          maxPrice,
          adminId,
        }
      );
    } catch (err) {
      if (err.message.includes('PK_DAILY_MARKET_PRICE') || err.errorNum === 1) {
        throw ApiError.conflict(
          'A price for that crop, arat and date is already logged. Prices are one per day.'
        );
      }
      throw err;
    }
    return { cropId, aratId, pricePerKg, minPrice, maxPrice };
  });
}

async function listComplaints(filters = {}) {
  const status = filters.status || null;
  const result = await query(
    `SELECT cp.ComplaintID   AS "complaintId",
            cp.SaleOrderID   AS "saleOrderId",
            cp.ComplaintType AS "complaintType",
            cp.Description   AS "description",
            cp.Status        AS "status",
            cp.ResolutionDate AS "resolutionDate",
            so.TotalAmount   AS "orderAmount",
            NVL(byr.BusinessName, ub.FirstName || ' ' || ub.LastName) AS "buyerName",
            uf.FirstName || ' ' || uf.LastName AS "farmerName",
            ua.FirstName || ' ' || ua.LastName AS "handledBy"
       FROM COMPLAINT cp
       JOIN SALE_ORDER so    ON so.SaleOrderID = cp.SaleOrderID
       JOIN BID b            ON b.BidID        = so.BidID
       JOIN HARVEST_BATCH hb ON hb.BatchID     = b.BatchID
       JOIN FARM f           ON f.FarmID       = hb.FarmID
       JOIN USERS uf         ON uf.UserID      = f.FarmerID
       JOIN BUYER byr        ON byr.BuyerID    = b.BuyerID
       JOIN USERS ub         ON ub.UserID      = byr.BuyerID
       LEFT JOIN USERS ua    ON ua.UserID      = cp.HandledByAdminID
      WHERE (:status IS NULL OR cp.Status = :status)
      ORDER BY CASE cp.Status WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,
               cp.ComplaintID`,
    { status }
  );
  return result.rows;
}

const COMPLAINT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];

/**
 * Take ownership of a complaint and move it along. Stamps the admin so
 * "who handled this" is answerable — HandledByAdminID is otherwise never
 * written by anything.
 */
async function updateComplaint(adminId, complaintId, status) {
  if (!COMPLAINT_STATUSES.includes(status)) {
    throw ApiError.badRequest(`Status must be one of: ${COMPLAINT_STATUSES.join(', ')}.`);
  }

  return withTransaction(async (connection) => {
    const existing = await connection.execute(
      `SELECT Status FROM COMPLAINT WHERE ComplaintID = :complaintId FOR UPDATE`,
      { complaintId }
    );
    if (!existing.rows.length) throw ApiError.notFound('No such complaint.');

    const closing = status === 'RESOLVED' || status === 'REJECTED';
    await connection.execute(
      `UPDATE COMPLAINT
          SET Status = :status,
              HandledByAdminID = :adminId,
              ResolutionDate = ${closing ? 'TRUNC(SYSDATE)' : 'NULL'}
        WHERE ComplaintID = :complaintId`,
      { status, adminId, complaintId }
    );

    return { complaintId, status, previousStatus: existing.rows[0].STATUS };
  });
}

module.exports = {
  getDashboard,
  listUsers,
  listDailyPrices,
  logDailyPrice,
  listComplaints,
  updateComplaint,
};
