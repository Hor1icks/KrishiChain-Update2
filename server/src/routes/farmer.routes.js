'use strict';

const express = require('express');
const farmer = require('../services/farmer.service');
const gateway = require('../services/sslcommerz.service');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// Every route below is farmer-only. Applied once here rather than
// per-route, so a new endpoint cannot be added unguarded by accident.
router.use(authenticate, requireRole('FARMER'));

// The farmer ID is always taken from the verified token, never from the
// URL or body — that is what makes the ownership checks meaningful.
const me = (req) => req.user.userId;

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await farmer.getDashboard(me(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/farms', async (req, res, next) => {
  try {
    res.json(await farmer.listFarms(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/farms', async (req, res, next) => {
  try {
    res.status(201).json(await farmer.createFarm(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/batches', async (req, res, next) => {
  try {
    res.json(await farmer.listBatches(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/batches', async (req, res, next) => {
  try {
    res.status(201).json(await farmer.createBatch(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/batches/:batchId', async (req, res, next) => {
  try {
    res.json(await farmer.getBatch(me(req), Number(req.params.batchId)));
  } catch (err) {
    next(err);
  }
});

router.get('/batches/:batchId/bids', async (req, res, next) => {
  try {
    res.json(await farmer.listBidsForBatch(me(req), Number(req.params.batchId)));
  } catch (err) {
    next(err);
  }
});

// The demo centrepiece — PRD §9.10 transaction #4.
router.post('/bids/:bidId/award', async (req, res, next) => {
  try {
    res.status(201).json(await farmer.awardBid(me(req), Number(req.params.bidId), req.body));
  } catch (err) {
    next(err);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    res.json(await farmer.listOrders(me(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    res.json(await farmer.listPayments(me(req)));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Storage consent (leg 1 — this farmer's own local storage)
// ---------------------------------------------------------------------

router.get('/storage/proposals', async (req, res, next) => {
  try {
    res.json(await farmer.listStorageProposals(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/proposals/:allocationId/respond', async (req, res, next) => {
  try {
    res.json(
      await farmer.respondToStorageProposal(
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
    res.status(201).json(await farmer.requestStorageAllocation(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

// Settle a manager's counter-offer against this customer's own request.
// ACCEPT or REJECT only — one negotiation round, no re-counter.
router.post('/storage/:allocationId/counter/respond', async (req, res, next) => {
  try {
    res.json(
      await farmer.respondToStorageCounter(
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
    res.json(await farmer.requestStorageRelease(me(req), Number(req.params.allocationId)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/release/respond', async (req, res, next) => {
  try {
    res.json(
      await farmer.respondToStorageRelease(
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
    res.json(await farmer.listStorageFees(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/pay/online', async (req, res, next) => {
  try {
    res.json(
      await gateway.beginStorageCheckout(
        'FARMER',
        me(req),
        Number(req.params.allocationId),
        req.body.amount
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/storage', async (req, res, next) => {
  try {
    res.json(await farmer.listMyStorage(me(req)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
