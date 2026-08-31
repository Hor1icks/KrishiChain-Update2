'use strict';

const express = require('express');
const buyer = require('../services/buyer.service');
const gateway = require('../services/sslcommerz.service');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// Buyer-only, applied once so a new endpoint cannot land unguarded.
router.use(authenticate, requireRole('BUYER'));

// Always from the verified token, never from the URL or body.
const me = (req) => req.user.userId;

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await buyer.getDashboard(me(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/batches', async (req, res, next) => {
  try {
    res.json(await buyer.browseBatches(me(req), req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/batches/:batchId', async (req, res, next) => {
  try {
    res.json(await buyer.getBatch(me(req), Number(req.params.batchId)));
  } catch (err) {
    next(err);
  }
});

// PRD §9.10 transaction #3.
router.post('/bids', async (req, res, next) => {
  try {
    res.status(201).json(await buyer.placeBid(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/bids', async (req, res, next) => {
  try {
    res.json(await buyer.listMyBids(me(req)));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Storage consent (leg 2 — this buyer's local storage, post-sale)
// ---------------------------------------------------------------------

router.get('/orders', async (req, res, next) => {
  try {
    res.json(await buyer.listOrders(me(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    res.json(await buyer.listPayments(me(req)));
  } catch (err) {
    next(err);
  }
});

/** Direct buyer -> farmer settlement (D-2). */
router.post('/orders/:saleOrderId/pay', async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await buyer.payOrder(me(req), Number(req.params.saleOrderId), req.body));
  } catch (err) {
    next(err);
  }
});

/** Hands back a hosted checkout URL for the buyer's browser to follow. */
router.post('/orders/:saleOrderId/pay/online', async (req, res, next) => {
  try {
    res.json(await gateway.beginCheckout(me(req), Number(req.params.saleOrderId)));
  } catch (err) {
    next(err);
  }
});

/**
 * "Drive it straight to me." One of the two ways an order's transport
 * request becomes claimable by a driver; the other is accepting a leg-2
 * storage allocation. Until one of them happens the trip has no
 * destination and is not offered to anyone.
 */
router.post('/orders/:saleOrderId/delivery-preference', async (req, res, next) => {
  try {
    res.json(await buyer.setDeliveryDirect(me(req), Number(req.params.saleOrderId)));
  } catch (err) {
    next(err);
  }
});

router.get('/reviews', async (req, res, next) => {
  try {
    res.json(await buyer.listReviews(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    res.status(201).json(await buyer.createReview(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/storage/proposals', async (req, res, next) => {
  try {
    res.json(await buyer.listStorageProposals(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/proposals/:allocationId/respond', async (req, res, next) => {
  try {
    res.json(
      await buyer.respondToStorageProposal(
        me(req),
        Number(req.params.allocationId),
        req.body.decision,
        req.body
      )
    );
  } catch (err) {
    next(err);
  }
});

// Ask a manager for space, rather than waiting to be offered it. The
// customer picks the warehouse and unit from /reference/warehouses.
router.post('/storage/requests', async (req, res, next) => {
  try {
    res.status(201).json(await buyer.requestStorageAllocation(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

// Settle a manager's counter-offer against this customer's own request.
// ACCEPT or REJECT only — one negotiation round, no re-counter.
router.post('/storage/:allocationId/counter/respond', async (req, res, next) => {
  try {
    res.json(
      await buyer.respondToStorageCounter(
        me(req),
        Number(req.params.allocationId),
        req.body.decision
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/release', async (req, res, next) => {
  try {
    res.json(await buyer.requestStorageRelease(me(req), Number(req.params.allocationId)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/release/respond', async (req, res, next) => {
  try {
    res.json(
      await buyer.respondToStorageRelease(
        me(req),
        Number(req.params.allocationId),
        req.body.decision
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/storage/fees', async (req, res, next) => {
  try {
    res.json(await buyer.listStorageFees(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/pay/online', async (req, res, next) => {
  try {
    res.json(
      await gateway.beginStorageCheckout('BUYER', me(req), Number(req.params.allocationId))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/pay', async (req, res, next) => {
  try {
    res.status(201).json(await buyer.payStorageFee(me(req), Number(req.params.allocationId), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/storage', async (req, res, next) => {
  try {
    res.json(await buyer.listMyStorage(me(req)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
