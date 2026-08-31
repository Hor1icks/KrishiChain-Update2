'use strict';

const { sslcommerz, clientOrigin, port } = require('../config/env');
const { query, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const oracledb = require('oracledb');

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

/**
 * Reserves the amount as a PENDING payment, then asks SSLCommerz for a
 * hosted checkout page. Reserving first means BR-19 already counts this
 * attempt, so a buyer cannot open two checkout pages and pay twice.
 */
async function beginCheckout(buyerId, saleOrderId) {
  if (!sslcommerz.enabled) {
    throw ApiError.badRequest(
      'Online payment is not configured. Set SSLCZ_STORE_ID and SSLCZ_STORE_PASSWORD in server/.env.'
    );
  }

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
    if (outstanding <= 0) throw ApiError.businessRule('This order is already settled.');

    await connection.execute(
      `BEGIN pkg_krishi_rules.check_payment_allowed(:saleOrderId, :amount); END;`,
      { saleOrderId, amount: outstanding }
    );

    const reference = `SSLCZ-${saleOrderId}-${Date.now()}`;
    await connection.execute(
      `INSERT INTO PAYMENT (PaymentID, SaleOrderID, BuyerID, FarmerID, Amount,
                            PaymentMethod, TransactionReference, PaymentStatus)
       VALUES ((SELECT NVL(MAX(PaymentID), 0) + 1 FROM PAYMENT),
               :saleOrderId, :buyerId, :farmerId, :amount,
               'SSLCOMMERZ', :reference, 'PENDING')`,
      { saleOrderId, buyerId, farmerId: row.FARMERID, amount: outstanding, reference }
    );

    return { tranId: reference, amount: outstanding, order: row };
  });

  const session = await post('/gwprocess/v4/api.php', {
    store_id: sslcommerz.storeId,
    store_passwd: sslcommerz.storePassword,
    total_amount: amount.toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: `${API_BASE}/success`,
    fail_url: `${API_BASE}/fail`,
    cancel_url: `${API_BASE}/cancel`,
    product_name: `${order.CROPNAME} — order #${saleOrderId}`,
    product_category: 'Agriculture',
    product_profile: 'physical-goods',
    cus_name: order.BUYERNAME,
    cus_email: order.BUYEREMAIL,
    cus_add1: order.BUYERADDRESS || 'N/A',
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

  return { saleOrderId, amount, transactionId: tranId, redirectUrl: session.GatewayPageURL };
}

async function markFailed(tranId) {
  await query(
    `UPDATE PAYMENT SET PaymentStatus = 'FAILED'
      WHERE TransactionReference = :tranId AND PaymentStatus = 'PENDING'`,
    { tranId },
    { autoCommit: true }
  );
}

/**
 * The browser is redirected here by SSLCommerz, so the POST body cannot
 * be trusted on its own -- anyone can forge it. The amount and status
 * are re-read from the gateway's validation API before the payment is
 * marked COMPLETED.
 */
async function completeCheckout(body) {
  const tranId = body.tran_id;
  const valId = body.val_id;
  if (!tranId || !valId) throw ApiError.badRequest('The gateway response was incomplete.');

  const url =
    `${sslcommerz.baseUrl}/validator/api/validationserverAPI.php` +
    `?val_id=${encodeURIComponent(valId)}` +
    `&store_id=${encodeURIComponent(sslcommerz.storeId)}` +
    `&store_passwd=${encodeURIComponent(sslcommerz.storePassword)}&format=json`;

  const response = await fetch(url);
  const validation = await response.json();

  if (!['VALID', 'VALIDATED'].includes(validation.status)) {
    await markFailed(tranId);
    return { settled: false, saleOrderId: orderIdFrom(tranId), reason: 'not-validated' };
  }

  return withTransaction(async (connection) => {
    const pending = await connection.execute(
      `SELECT PaymentID, SaleOrderID, Amount, PaymentStatus
         FROM PAYMENT
        WHERE TransactionReference = :tranId
          FOR UPDATE`,
      { tranId }
    );
    if (!pending.rows.length) throw ApiError.notFound('That transaction is not on record.');
    const payment = pending.rows[0];

    if (payment.PAYMENTSTATUS === 'COMPLETED') {
      return { settled: true, saleOrderId: payment.SALEORDERID, alreadySettled: true };
    }

    // The gateway is authoritative on what was actually charged.
    if (Number(validation.amount) !== Number(payment.AMOUNT)) {
      await connection.execute(
        `UPDATE PAYMENT SET PaymentStatus = 'FAILED' WHERE PaymentID = :id`,
        { id: payment.PAYMENTID }
      );
      return { settled: false, saleOrderId: payment.SALEORDERID, reason: 'amount-mismatch' };
    }

    await connection.execute(
      `UPDATE PAYMENT
          SET PaymentStatus = 'COMPLETED',
              TransactionReference = :reference
        WHERE PaymentID = :id`,
      {
        id: payment.PAYMENTID,
        reference: `${tranId} | ${validation.bank_tran_id || valId}`,
      }
    );

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

    return { settled: true, saleOrderId: payment.SALEORDERID, amount: Number(payment.AMOUNT) };
  });
}

async function abandonCheckout(body, outcome) {
  if (body.tran_id) await markFailed(body.tran_id);
  return { settled: false, saleOrderId: orderIdFrom(body.tran_id), reason: outcome };
}

function orderIdFrom(tranId) {
  const parts = String(tranId || '').split('-');
  return parts.length > 1 ? Number(parts[1]) : null;
}

function resultRedirect(result) {
  const params = new URLSearchParams({
    status: result.settled ? 'paid' : 'failed',
    order: String(result.saleOrderId ?? ''),
  });
  if (result.reason) params.set('reason', result.reason);
  return `${clientOrigin}/buyer/payments?${params.toString()}`;
}

module.exports = {
  enabled: () => sslcommerz.enabled,
  beginCheckout,
  completeCheckout,
  abandonCheckout,
  resultRedirect,
};
