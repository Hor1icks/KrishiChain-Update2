'use strict';

const { sslcommerz, clientOrigin, port } = require('../config/env');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const storage = require('./storage.service');

const API_BASE = `http://localhost:${port}/api/payments/sslcommerz`;

function form(fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) body.append(k, String(v));
  }
  return body;
}

async function post(path, fields) {
  const response = await fetch(`${sslcommerz.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(fields),
  });
  if (!response.ok) {
    throw ApiError.badGateway(`The payment gateway returned ${response.status}.`);
  }
  return response.json();
}

async function nothingLeftToPay(connection, column, id, noun) {
  const pending = await connection.execute(
    `SELECT COUNT(*) AS Pending FROM PAYMENT
      WHERE ${column} = :id
        AND PaymentStatus = 'PENDING'
        AND PaymentMethod = 'SSLCOMMERZ'`,
    { id }
  );
  return Number(pending.rows[0].PENDING) > 0
    ? `A checkout for this ${noun} is already open. Finish or cancel it on the gateway, then try again.`
    : `This ${noun} is already settled.`;
}

function amountToCharge(requested, outstanding, noun) {
  if (requested === undefined || requested === null || requested === '') return outstanding;

  const amount = Number(requested);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('Enter an amount greater than zero.');
  }
  if (Number(amount.toFixed(2)) > Number(outstanding.toFixed(2))) {
    throw ApiError.businessRule(
      `That is more than the ${noun} still owes. The most you can pay now is ${outstanding.toFixed(2)}.`
    );
  }
  return Number(amount.toFixed(2));
}

function requireGateway() {
  if (!sslcommerz.enabled) {
    throw ApiError.badRequest(
      'Online payment is not configured. Set SSLCZ_STORE_ID and SSLCZ_STORE_PASSWORD in server/.env.'
    );
  }
}

async function beginCheckout(buyerId, saleOrderId, requestedAmount) {
  requireGateway();

  const { tranId, amount, order } = await withTransaction(async (connection) => {
    const result = await connection.execute(
      `SELECT so.SaleOrderID, so.TotalAmount, so.Status,
              b.BuyerID, f.FarmerID,
              u.FirstName || ' ' || u.LastName AS BuyerName,
              u.Email AS BuyerEmail,
              u.Address.full_text() AS BuyerAddress,
              c.CropName
         FROM SALE_ORDER so
         JOIN BID b            ON b.BidID    = so.BidID
         JOIN HARVEST_BATCH hb ON hb.BatchID = b.BatchID
         JOIN CROP c           ON c.CropID   = hb.CropID
         JOIN FARM f           ON f.FarmID   = hb.FarmID
         JOIN USERS u          ON u.UserID   = b.BuyerID
        WHERE so.SaleOrderID = :saleOrderId
          FOR UPDATE OF so.Status`,
      { saleOrderId }
    );
    if (!result.rows.length) throw ApiError.notFound('No such order.');
    const row = result.rows[0];
    if (row.BUYERID !== buyerId) throw ApiError.forbidden('That is not your order.');

    const paid = await connection.execute(
      `SELECT NVL(SUM(Amount), 0) AS Paid
         FROM PAYMENT
        WHERE SaleOrderID = :saleOrderId
          AND PaymentType = 'SALE'
          AND PaymentStatus IN ('PENDING', 'COMPLETED')`,
      { saleOrderId }
    );
    const outstanding = Number(row.TOTALAMOUNT) - Number(paid.rows[0].PAID);
    if (outstanding <= 0) {
      throw ApiError.businessRule(await nothingLeftToPay(connection, 'SaleOrderID', saleOrderId, 'order'));
    }

    const amount = amountToCharge(requestedAmount, outstanding, 'order');

    await connection.execute(
      `BEGIN pkg_krishi_rules.check_payment_allowed(:saleOrderId, :amount); END;`,
      { saleOrderId, amount }
    );

    const reference = `SSLCZ-${saleOrderId}-${Date.now()}`;
    await connection.execute(
      `INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount,
                            PaymentMethod, TransactionReference, PaymentStatus)
       VALUES ((SELECT NVL(MAX(PaymentID), 0) + 1 FROM PAYMENT),
               :saleOrderId, :buyerId, :farmerId, :amount,
               'SSLCOMMERZ', :reference, 'PENDING')`,
      { saleOrderId, buyerId, farmerId: row.FARMERID, amount, reference }
    );

    return { tranId: reference, amount, order: row };
  });

  return openSession({
    tranId,
    amount,
    productName: `${order.CROPNAME} — order #${saleOrderId}`,
    customerName: order.BUYERNAME,
    customerEmail: order.BUYEREMAIL,
    customerAddress: order.BUYERADDRESS,
    extra: { saleOrderId },
  });
}

async function beginStorageCheckout(customerType, customerId, allocationId, requestedAmount) {
  requireGateway();

  const { tranId, amount, detail } = await withTransaction(async (connection) => {
    const alloc = await storage.loadAllocationForPayment(connection, customerType, customerId, allocationId);

    const paid = await connection.execute(
      `SELECT NVL(SUM(Amount), 0) AS Paid FROM PAYMENT
        WHERE PaymentType = 'STORAGE' AND AllocationID = :allocationId
          AND PaymentStatus IN ('PENDING', 'COMPLETED')`,
      { allocationId }
    );
    const outstanding = Number(alloc.STORAGEFEE || 0) - Number(paid.rows[0].PAID);
    if (outstanding <= 0) {
      throw ApiError.businessRule(await nothingLeftToPay(connection, 'AllocationID', allocationId, 'storage fee'));
    }

    const amount = amountToCharge(requestedAmount, outstanding, 'storage fee');

    const reference = `SSLCZ-S${customerType === 'FARMER' ? 'F' : 'B'}${allocationId}-${Date.now()}`;
    await connection.execute(
      `INSERT INTO PAYMENT (PaymentID, PaymentType, AllocationID, Amount,
                            PaymentMethod, TransactionReference, PaymentStatus)
       VALUES ((SELECT NVL(MAX(PaymentID), 0) + 1 FROM PAYMENT),
               'STORAGE', :allocationId, :amount, 'SSLCOMMERZ', :reference, 'PENDING')`,
      { allocationId, amount, reference }
    );

    return { tranId: reference, amount, detail: alloc };
  });

  return openSession({
    tranId,
    amount,
    productName: `Storage fee — allocation #${allocationId}`,
    customerName: detail.CUSTOMERNAME,
    customerEmail: detail.CUSTOMEREMAIL,
    customerAddress: detail.WAREHOUSENAME,
    extra: { allocationId },
  });
}

async function openSession({ tranId, amount, productName, customerName, customerEmail, customerAddress, extra }) {
  const session = await post('/gwprocess/v4/api.php', {
    store_id: sslcommerz.storeId,
    store_passwd: sslcommerz.storePassword,
    total_amount: amount.toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: `${API_BASE}/success`,
    fail_url: `${API_BASE}/fail`,
    cancel_url: `${API_BASE}/cancel`,
    product_name: productName,
    product_category: 'Agriculture',
    product_profile: 'physical-goods',
    cus_name: customerName,
    cus_email: customerEmail,
    cus_add1: customerAddress || 'N/A',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: '01700000000',
    shipping_method: 'NO',
    num_of_item: 1,
  });

  if (session.status !== 'SUCCESS' || !session.GatewayPageURL) {
    await markFailed(tranId);
    throw ApiError.badGateway(
      session.failedreason || 'The payment gateway would not open a session.'
    );
  }

  return { ...extra, amount, transactionId: tranId, redirectUrl: session.GatewayPageURL };
}

async function markFailed(tranId) {
  await query(
    `UPDATE PAYMENT SET PaymentStatus = 'FAILED'
      WHERE TransactionReference = :tranId AND PaymentStatus = 'PENDING'`,
    { tranId },
    { autoCommit: true }
  );
}

async function completeCheckout(body) {
  const tranId = body.tran_id;
  const valId = body.val_id;
  if (!tranId || !valId) throw ApiError.badRequest('The gateway response was incomplete.');

  const url =
    `${sslcommerz.baseUrl}/validator/api/validationserverAPI.php` +
    `?val_id=${encodeURIComponent(valId)}` +
    `&store_id=${encodeURIComponent(sslcommerz.storeId)}` +
    `&store_passwd=${encodeURIComponent(sslcommerz.storePassword)}&format=json`;

  let validation = null;
  try {
    const response = await fetch(url);
    const text = await response.text();
    validation = text.trim() ? JSON.parse(text) : null;
    if (!validation) {
      console.error(`[sslcommerz] empty validation response for ${tranId} (HTTP ${response.status})`);
    }
  } catch (err) {
    console.error(`[sslcommerz] validation failed for ${tranId}: ${err.message}`);
  }

  if (!validation || !['VALID', 'VALIDATED'].includes(validation.status)) {
    await markFailed(tranId);
    return { settled: false, ...targetFromRef(tranId), reason: 'not-validated' };
  }

  return withTransaction(async (connection) => {
    const pending = await connection.execute(
      `SELECT PaymentID, PaymentType, SaleOrderID, AllocationID, Amount, PaymentStatus
         FROM PAYMENT
        WHERE TransactionReference = :tranId
          FOR UPDATE`,
      { tranId }
    );
    if (!pending.rows.length) throw ApiError.notFound('That transaction is not on record.');
    const payment = pending.rows[0];
    const where = targetFromRef(tranId);

    if (payment.PAYMENTSTATUS === 'COMPLETED') {
      return { settled: true, ...where, alreadySettled: true };
    }

    if (payment.PAYMENTSTATUS !== 'PENDING') {
      console.error(`[sslcommerz] ${tranId} came back ${payment.PAYMENTSTATUS}, not PENDING`);
      return { settled: false, ...where, reason: 'expired' };
    }

    if (Number(validation.amount) !== Number(payment.AMOUNT)) {
      await connection.execute(
        `UPDATE PAYMENT SET PaymentStatus = 'FAILED' WHERE PaymentID = :id`,
        { id: payment.PAYMENTID }
      );
      return { settled: false, ...where, reason: 'amount-mismatch' };
    }

    await connection.execute(
      `UPDATE PAYMENT SET PaymentStatus = 'COMPLETED' WHERE PaymentID = :id`,
      { id: payment.PAYMENTID }
    );

    if (payment.PAYMENTTYPE === 'SALE') {
      const settled = await connection.execute(
        `SELECT so.TotalAmount,
                NVL((SELECT SUM(p.Amount) FROM PAYMENT p
                      WHERE p.SaleOrderID = so.SaleOrderID
                        AND p.PaymentType = 'SALE'
                        AND p.PaymentStatus IN ('PENDING','COMPLETED')), 0) AS Paid
           FROM SALE_ORDER so
          WHERE so.SaleOrderID = :saleOrderId`,
        { saleOrderId: payment.SALEORDERID }
      );
      const row = settled.rows[0];
      if (Number(row.PAID) >= Number(row.TOTALAMOUNT)) {
        await connection.execute(
          `UPDATE SALE_ORDER SET Status = 'COMPLETED'
            WHERE SaleOrderID = :saleOrderId AND Status <> 'CANCELLED'`,
          { saleOrderId: payment.SALEORDERID }
        );
      }
    }

    return { settled: true, ...where, amount: Number(payment.AMOUNT) };
  });
}

async function abandonCheckout(body, outcome) {
  const tranId = body.tran_id;
  if (tranId) await markFailed(tranId);
  return { settled: false, ...targetFromRef(tranId), reason: outcome };
}

function targetFromRef(tranId) {
  const part = String(tranId || '').split('-')[1] || '';
  const storageMatch = part.match(/^S([FB])(\d+)$/);
  if (storageMatch) {
    return {
      page: storageMatch[1] === 'F' ? '/farmer/storage' : '/buyer/storage',
      key: 'allocation',
      id: Number(storageMatch[2]),
    };
  }
  return { page: '/buyer/payments', key: 'order', id: Number(part) || null };
}

function resultRedirect(result) {
  const params = new URLSearchParams({ status: result.settled ? 'paid' : 'failed' });
  if (result.id) params.set(result.key || 'order', String(result.id));
  if (result.reason) params.set('reason', result.reason);
  return `${clientOrigin}${result.page || '/buyer/payments'}?${params.toString()}`;
}

module.exports = {
  enabled: () => sslcommerz.enabled,
  beginCheckout,
  beginStorageCheckout,
  completeCheckout,
  abandonCheckout,
  resultRedirect,
};
