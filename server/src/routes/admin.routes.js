'use strict';

const express = require('express');
const admin = require('../services/admin.service');
const authService = require('../services/auth.service');
const { authenticate, requireRole } = require('../middleware/authenticate');
const param = require('../utils/params');

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

/**
 * Staff accounts are created here rather than claimed from the public
 * sign-up form, since an admin or a storage manager holds authority over
 * other people's records.
 */
router.post('/users', async (req, res, next) => {
  try {
    const { userId, role } = await authService.register(req.body, { allowStaffRoles: true });
    res.status(201).json({ userId, role, message: `${role} account created.` });
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
      await admin.updateComplaint(me(req), param.id(req.params.complaintId, 'complaintId'), req.body.status)
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
