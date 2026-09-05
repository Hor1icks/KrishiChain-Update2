'use strict';

const express = require('express');
const buyer = require('../services/buyer.service');
const gateway = require('../services/sslcommerz.service');
const { authenticate, requireRole } = require('../middleware/authenticate');
const param = require('../utils/params');

const router = express.Router();

router.use(authenticate, requireRole('BUYER'));

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
    res.json(await buyer.getBatch(me(req), param.id(req.params.batchId, 'batchId')));
  } catch (err) {
    next(err);
  }
});

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

router.post('/orders/:saleOrderId/pay/online', async (req, res, next) => {
  try {
    res.json(
      await gateway.beginCheckout(me(req), param.id(req.params.saleOrderId, 'saleOrderId'), req.body.amount)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:saleOrderId/delivery-preference', async (req, res, next) => {
  try {
    res.json(await buyer.setDeliveryDirect(me(req), param.id(req.params.saleOrderId, 'saleOrderId')));
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
        param.id(req.params.allocationId, 'allocationId'),
        req.body.decision,
        req.body
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/storage/requests', async (req, res, next) => {
  try {
    res.status(201).json(await buyer.requestStorageAllocation(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/counter/respond', async (req, res, next) => {
  try {
    res.json(
      await buyer.respondToStorageCounter(
        me(req),
        param.id(req.params.allocationId, 'allocationId'),
        req.body.decision
      )
    );
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/release', async (req, res, next) => {
  try {
    res.json(await buyer.requestStorageRelease(me(req), param.id(req.params.allocationId, 'allocationId')));
  } catch (err) {
    next(err);
  }
});

router.post('/storage/:allocationId/release/respond', async (req, res, next) => {
  try {
    res.json(
      await buyer.respondToStorageRelease(
        me(req),
        param.id(req.params.allocationId, 'allocationId'),
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
      await gateway.beginStorageCheckout(
        'BUYER',
        me(req),
        param.id(req.params.allocationId, 'allocationId'),
        req.body.amount
      )
    );
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
