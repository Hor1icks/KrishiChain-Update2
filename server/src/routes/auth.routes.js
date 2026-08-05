'use strict';

const express = require('express');
const authService = require('../services/auth.service');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

/** Lets the register page build its role dropdown from one source of truth. */
router.get('/roles', (_req, res) => {
  res.json({ roles: authService.ROLES });
});

router.post('/register', async (req, res, next) => {
  try {
    const { userId, role } = await authService.register(req.body);
    res.status(201).json({ userId, role, message: 'Registration complete. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { user, token } = await authService.login(req.body.email, req.body.password);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json(await authService.getProfile(req.user.userId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
