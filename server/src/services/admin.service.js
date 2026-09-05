'use strict';


const { query, callCursor, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');

const REPORTS = {
  harvest: {
    plsql: `BEGIN pkg_krishi_reports.harvest_report(:dateFrom, :dateTo, :cursor); END;`,
    binds: (f) => ({ dateFrom: f.dateFrom || null, dateTo: f.dateTo || null }),
  },
  storage: {
    plsql: `BEGIN pkg_krishi_reports.storage_report(:warehouseId, :cursor); END;`,
    binds: (f) => ({ warehouseId: f.warehouseId ? Number(f.warehouseId) : null }),
  },
  sales: {
    plsql: `BEGIN pkg_krishi_reports.sales_report(:dateFrom, :dateTo, :cursor); END;`,
    binds: (f) => ({ dateFrom: f.dateFrom || null, dateTo: f.dateTo || null }),
  },
  payment: {
    plsql: `BEGIN pkg_krishi_reports.payment_report(:dateFrom, :dateTo, :cursor); END;`,
    binds: (f) => ({ dateFrom: f.dateFrom || null, dateTo: f.dateTo || null }),
  },
  'market-price': {
    plsql: `BEGIN pkg_krishi_reports.market_price_report(:cropId, :days, :cursor); END;`,
    binds: (f) => ({
      cropId: f.cropId ? Number(f.cropId) : null,
      days: f.days ? Number(f.days) : 30,
    }),
  },
  activity: {
    plsql: `BEGIN pkg_krishi_reports.user_activity_report(:userId, :maxRows, :cursor); END;`,
    binds: (f) => ({
      userId: f.userId ? Number(f.userId) : null,
      maxRows: f.maxRows ? Number(f.maxRows) : 100,
    }),
  },
};

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`"${value}" is not a valid date (use YYYY-MM-DD).`);
  }
  return parsed;
}

async function runReport(name, filters = {}) {
  const report = REPORTS[name];
  if (!report) {
    throw ApiError.notFound(
      `No such report. Available: ${Object.keys(REPORTS).join(', ')}.`
    );
  }
  const binds = report.binds(filters);
  if ('dateFrom' in binds) binds.dateFrom = toDate(binds.dateFrom);
  if ('dateTo' in binds) binds.dateTo = toDate(binds.dateTo);

  const { rows, truncated } = await callCursor(report.plsql, binds);
  return {
    report: name,
    filters: binds,
    rowCount: rows.length,
    truncated,
    rows,
  };
}

function listReports() {
  return Object.keys(REPORTS);
}

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

  const inFlight = await query(
    `SELECT SaleOrderID AS "saleOrderId", TransportID AS "transportId",
            CropName AS "cropName", FarmerName AS "farmerName",
            NVL(BusinessName, BuyerName) AS "buyerName",
            DeliveryStatus AS "deliveryStatus", VehicleNo AS "vehicleNo",
            DriverName AS "driverName", DaysSinceRequest AS "daysSinceRequest",
            PaymentEligibility AS "paymentEligibility"
       FROM V_PENDING_DELIVERY
      ORDER BY DaysSinceRequest DESC, SaleOrderID`
  );

  return {
    summary: counts.rows[0],
    unsoldBatches: unsold.rows,
    unpaidOrders: unpaid.rows,
    byCrop: byCrop.rows,
    inFlight: inFlight.rows,
  };
}

async function listUsers(filters = {}) {
  const role = filters.role || null;
  const search = filters.search ? `%${filters.search.toLowerCase()}%` : null;

  const result = await query(
    `SELECT u.UserID AS "userId",
            u.FirstName || ' ' || NVL(u.MiddleName || ' ', '') || u.LastName AS "name",
            u.Email AS "email", u.Gender AS "gender",
            u.Address.District AS "district",
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
  listReports,
  runReport,
};
