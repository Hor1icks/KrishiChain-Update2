'use strict';

const express = require('express');
const gateway = require('../services/sslcommerz.service');

const router = express.Router();

// SSLCommerz redirects the buyer's browser back with a form POST, so
// these three are public and body-parsed as a form, not JSON. Nothing
// here trusts the body: the outcome is re-read from the gateway.
router.use(express.urlencoded({ extended: false }));

function finish(res, result) {
  res.redirect(303, gateway.resultRedirect(result));
}

router.post('/sslcommerz/success', async (req, res, next) => {
  try {
    finish(res, await gateway.completeCheckout(req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/sslcommerz/fail', async (req, res, next) => {
  try {
    finish(res, await gateway.abandonCheckout(req.body, 'declined'));
  } catch (err) {
    next(err);
  }
});

router.post('/sslcommerz/cancel', async (req, res, next) => {
  try {
    finish(res, await gateway.abandonCheckout(req.body, 'cancelled'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
