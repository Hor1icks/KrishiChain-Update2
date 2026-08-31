'use strict';

const express = require('express');
const transport = require('../services/transport.service');
const { authenticate, requireRole } = require('../middleware/authenticate');
const param = require('../utils/params');

const router = express.Router();

// Transport personnel only, applied once so a new endpoint cannot be
// added unguarded — same pattern as farmer.routes.js.
router.use(authenticate, requireRole('TRANSPORT_PERSONNEL'));

const me = (req) => req.user.userId;

router.get('/summary', async (req, res, next) => {
  try {
    res.json(await transport.getSummary(me(req)));
  } catch (err) {
    next(err);
  }
});

/** Unclaimed trips — the job board. */
router.get('/requests', async (_req, res, next) => {
  try {
    res.json(await transport.listOpenRequests());
  } catch (err) {
    next(err);
  }
});

router.get('/vehicles', async (_req, res, next) => {
  try {
    res.json(await transport.listAvailableVehicles());
  } catch (err) {
    next(err);
  }
});

router.get('/assignments', async (req, res, next) => {
  try {
    res.json(await transport.listMyAssignments(me(req)));
  } catch (err) {
    next(err);
  }
});

/** PRD §9.10 transaction #5. */
router.post('/assignments', async (req, res, next) => {
  try {
    res.status(201).json(await transport.claim(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

router.post('/assignments/:transportId/advance', async (req, res, next) => {
  try {
    res.json(await transport.advance(me(req), param.id(req.params.transportId, 'transportId')));
  } catch (err) {
    next(err);
  }
});

/** PRD §9.10 transaction #6 — the last of the six. */
router.post('/assignments/:transportId/deliver', async (req, res, next) => {
  try {
    res.json(await transport.complete(me(req), param.id(req.params.transportId, 'transportId'), req.body));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
