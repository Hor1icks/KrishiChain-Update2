'use strict';

const { query } = require('./../config/db');

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
