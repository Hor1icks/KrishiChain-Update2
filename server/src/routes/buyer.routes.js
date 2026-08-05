'use strict';

const express = require('express');
const buyer = require('../services/buyer.service');
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
