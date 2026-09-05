'use strict';

const express = require('express');
const gateway = require('../services/sslcommerz.service');

const router = express.Router();

router.use(express.urlencoded({ extended: false }));

function handle(work) {
  return async (req, res) => {
    let result;
    try {
      result = await work({ ...req.query, ...req.body });
    } catch (err) {
      console.error(`[sslcommerz] ${req.path} failed: ${err.stack || err.message}`);
      result = { settled: false, saleOrderId: null, reason: 'error' };
    }
    res.redirect(303, gateway.resultRedirect(result));
  };
}

router.post('/sslcommerz/success', handle((body) => gateway.completeCheckout(body)));
router.post('/sslcommerz/fail', handle((body) => gateway.abandonCheckout(body, 'declined')));
router.post('/sslcommerz/cancel', handle((body) => gateway.abandonCheckout(body, 'cancelled')));

router.get('/sslcommerz/success', handle((body) => gateway.completeCheckout(body)));
router.get('/sslcommerz/fail', handle((body) => gateway.abandonCheckout(body, 'declined')));
router.get('/sslcommerz/cancel', handle((body) => gateway.abandonCheckout(body, 'cancelled')));

module.exports = router;
