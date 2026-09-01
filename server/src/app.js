'use strict';

const express = require('express');
const cors = require('cors');

const { clientOrigin } = require('./config/env');
const { query } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const referenceRoutes = require('./routes/reference.routes');
const farmerRoutes = require('./routes/farmer.routes');
const buyerRoutes = require('./routes/buyer.routes');
const storageRoutes = require('./routes/storage.routes');
const transportRoutes = require('./routes/transport.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payments.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get('/api/health', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT USER AS db_user, TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS db_time FROM dual`
    );
    res.json({
      status: 'ok',
      database: 'connected',
      dbUser: result.rows[0].DB_USER,
      dbTime: result.rows[0].DB_TIME,
    });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/farmer', farmerRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
