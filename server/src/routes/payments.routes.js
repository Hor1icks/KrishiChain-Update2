'use strict';

const express = require('express');
const gateway = require('../services/sslcommerz.service');

const router = express.Router();

// SSLCommerz redirects the buyer's browser back with a form POST, so
// these three are public and body-parsed as a form, not JSON. Nothing
// here trusts the body: the outcome is re-read from the gateway.
router.use(express.urlencoded({ extended: false }));

// The buyer's browser is sitting on this request, so it always ends in a
// redirect back to the app. Reporting a 500 here would strand them on an
// API URL looking at JSON.
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

// SSLCommerz sends some buyers back with GET rather than POST.
router.get('/sslcommerz/success', handle((body) => gateway.completeCheckout(body)));
router.get('/sslcommerz/fail', handle((body) => gateway.abandonCheckout(body, 'declined')));
router.get('/sslcommerz/cancel', handle((body) => gateway.abandonCheckout(body, 'cancelled')));

module.exports = router;
