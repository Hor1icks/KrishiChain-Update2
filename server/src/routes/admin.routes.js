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
