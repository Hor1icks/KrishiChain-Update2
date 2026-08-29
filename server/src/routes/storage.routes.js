'use strict';

const express = require('express');
const storage = require('../services/storage.service');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

router.use(authenticate, requireRole('STORAGE_MANAGER'));

const me = (req) => req.user.userId;

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await storage.getDashboard(me(req)));
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses', async (req, res, next) => {
  try {
    res.json(await storage.listWarehouses(me(req)));
  } catch (err) {
    next(err);
  }
});

router.post('/warehouses', async (req, res, next) => {
  try {
    res.status(201).json(await storage.createWarehouse(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.put('/warehouses/:warehouseId/rate', async (req, res, next) => {
  try {
    res.json(
      await storage.setStorageFeeRate(me(req), Number(req.params.warehouseId), req.body.rate)
    );
  } catch (err) {
    next(err);
  }
});

router.get('/units', async (req, res, next) => {
  try {
    res.json(await storage.listUnits(me(req), req.query.warehouseId));
  } catch (err) {
    next(err);
  }
});

router.post('/warehouses/:warehouseId/units', async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await storage.addUnit(me(req), Number(req.params.warehouseId), req.body));
  } catch (err) {
    next(err);
  }
});

// Candidates for each storage leg — any manager can propose against
// either list, not just ones tied to their own warehouse's district.
router.patch('/warehouses/:warehouseId/units/:unitNo/maintenance', async (req, res, next) => {
  try {
    res.json(
      await storage.setUnitMaintenance(
        me(req),
        Number(req.params.warehouseId),
        Number(req.params.unitNo),
        Boolean(req.body.inMaintenance)
      )
    );
  } catch (err) {
    next(err);
  }
});

router.get('/awaiting/leg1', async (_req, res, next) => {
  try {
    res.json(await storage.listBatchesAwaitingStorage());
  } catch (err) {
    next(err);
  }
});

router.get('/awaiting/leg2', async (_req, res, next) => {
  try {
    res.json(await storage.listSaleOrdersAwaitingStorage());
  } catch (err) {
    next(err);
  }
});

router.get('/allocations', async (req, res, next) => {
  try {
    res.json(await storage.listAllocations(me(req)));
  } catch (err) {
    next(err);
  }
});

// PRD §9.10 transaction #2, now split into propose + customer consent.
router.post('/allocations', async (req, res, next) => {
  try {
    res.status(201).json(await storage.propose(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

// Everything waiting on THIS manager: customer-initiated requests, and
// counter-offers the customer sent back against the manager's proposals.
router.get('/requests', async (req, res, next) => {
  try {
    res.json(await storage.listRequestsForManager(me(req)));
  } catch (err) {
    next(err);
  }
});

// Answer a customer's request: ACCEPT, REJECT or COUNTER (with a
// counterRatePerKg). Same service call the customer uses against a
// manager's proposal — who may answer is derived from ProposedBy.
router.post('/requests/:allocationId/respond', async (req, res, next) => {
  try {
    res.json(
      await storage.respondToProposal(
        'MANAGER',
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

// Settle a counter the customer sent back against this manager's own
// proposal. ACCEPT or REJECT only — one negotiation round, no re-counter.
router.post('/allocations/:allocationId/counter/respond', async (req, res, next) => {
  try {
    res.json(
      await storage.respondToCounter(
        'MANAGER',
        me(req),
        Number(req.params.allocationId),
        req.body.decision
      )
    );
  } catch (err) {
    next(err);
  }
});

// Manager-initiated release request (the customer is the other party
// who must approve it, unless the minimum term is already fulfilled).
router.post('/allocations/:allocationId/release', async (req, res, next) => {
  try {
    res.json(await storage.requestRelease('MANAGER', me(req), Number(req.params.allocationId)));
  } catch (err) {
    next(err);
  }
});

// Manager approving/declining a release the CUSTOMER requested early.
router.post('/allocations/:allocationId/release/respond', async (req, res, next) => {
  try {
    res.json(
      await storage.respondToRelease(
        'MANAGER',
        me(req),
        Number(req.params.allocationId),
        req.body.decision
      )
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
