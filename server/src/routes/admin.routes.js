'use strict';

const express = require('express');
const admin = require('../services/admin.service');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

router.use(authenticate, requireRole('ADMIN'));

const me = (req) => req.user.userId;

router.get('/dashboard', async (_req, res, next) => {
  try {
    res.json(await admin.getDashboard());
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    res.json(await admin.listUsers({ role: req.query.role, search: req.query.search }));
  } catch (err) {
    next(err);
  }
});

router.get('/prices', async (req, res, next) => {
  try {
    res.json(await admin.listDailyPrices({ cropId: req.query.cropId, aratId: req.query.aratId }));
  } catch (err) {
    next(err);
  }
});

router.post('/prices', async (req, res, next) => {
  try {
    res.status(201).json(await admin.logDailyPrice(me(req), req.body));
  } catch (err) {
    next(err);
  }
});

/**
 * The Reporting Module. Every report is a PL/SQL procedure in
 * pkg_krishi_reports returning a ref cursor — this route only names one
 * and passes the filters through.
 */
router.get('/reports', async (_req, res, next) => {
  try {
    res.json({ reports: admin.listReports() });
  } catch (err) {
    next(err);
  }
});

router.get('/reports/:name', async (req, res, next) => {
  try {
    res.json(await admin.runReport(req.params.name, req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/complaints', async (req, res, next) => {
  try {
    res.json(await admin.listComplaints({ status: req.query.status }));
  } catch (err) {
    next(err);
  }
});

router.patch('/complaints/:complaintId', async (req, res, next) => {
  try {
    res.json(
      await admin.updateComplaint(me(req), Number(req.params.complaintId), req.body.status)
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
