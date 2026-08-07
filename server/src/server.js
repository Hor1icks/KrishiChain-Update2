'use strict';

const app = require('./app');
const db = require('./config/db');
const { port } = require('./config/env');

async function start() {
  try {
    // Thick-mode init and pool creation happen here, once, before the
    // server accepts a single request. Doing it lazily on first request
    // risks initOracleClient() racing itself under concurrent load.
    await db.initialize();
    console.log('Oracle pool ready (Thick mode).');
  } catch (err) {
    console.error('\nDatabase startup failed:\n  ' + err.message + '\n');
    process.exit(1);
  }

  const server = app.listen(port, () => {
    // Not 8080 — XE's bundled APEX already holds that port.
    console.log(`KrishiChain API listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
