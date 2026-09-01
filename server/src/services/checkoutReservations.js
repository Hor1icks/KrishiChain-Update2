'use strict';

const { query } = require('./../config/db');

// A gateway checkout reserves the balance as a PENDING payment so it
// cannot be paid twice. If the buyer closes the tab instead of finishing,
// nothing tells us -- the browser never comes back. Without an expiry
// that reservation holds the balance forever and the pay button stays
// hidden, which is worse than the double-payment it prevents.
//
// SSLCommerz sessions do not outlive this window either, so anything
// older is certainly abandoned.
const ABANDONED_AFTER_MINUTES = 30;

async function releaseAbandoned() {
  const result = await query(
    `UPDATE PAYMENT
        SET PaymentStatus = 'FAILED'
      WHERE PaymentMethod = 'SSLCOMMERZ'
        AND PaymentStatus = 'PENDING'
        AND PaymentDate < SYSDATE - (:minutes / 1440)`,
    { minutes: ABANDONED_AFTER_MINUTES },
    { autoCommit: true }
  );
  if (result.rowsAffected) {
    console.log(`[sslcommerz] released ${result.rowsAffected} abandoned checkout(s)`);
  }
  return result.rowsAffected || 0;
}

module.exports = { releaseAbandoned, ABANDONED_AFTER_MINUTES };
