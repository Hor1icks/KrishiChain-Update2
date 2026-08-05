'use strict';

/**
 * Oracle connection pool.
 *
 * THICK MODE IS MANDATORY. node-oracledb defaults to Thin mode, which
 * requires Oracle Database 12.1 or later and cannot reach XE 11.2 at
 * all. initOracleClient() must run BEFORE createPool() or any
 * getConnection() call — hence initialize() below, called once from
 * server.js at startup and never lazily.
 */

const oracledb = require('oracledb');
const { db, oracleClientDir } = require('./env');

// Rows come back as plain objects rather than positional arrays, and
// CLOBs (CROP.Description, REVIEW.ReviewComment, ...) arrive as strings
// instead of Lob streams the routes would have to drain by hand.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

// autoCommit stays FALSE (the driver default). The six workflows in PRD
// §9.10 are multi-statement transactions that must commit or roll back
// as a unit — an accidental autoCommit would silently break atomicity.
oracledb.autoCommit = false;

let pool = null;

function enableThickMode() {
  if (!oracledb.thin) return; // already initialized
  try {
    oracledb.initOracleClient({ libDir: oracleClientDir });
  } catch (err) {
    if (err.message.includes('DPI-1047')) {
      throw new Error(
        `Could not load Oracle Instant Client from "${oracleClientDir}".\n` +
          `DPI-1047 is almost always an ARCHITECTURE MISMATCH, not a missing file.\n` +
          `Check XE, Instant Client and Node.js are all the same bitness ` +
          `(this Node is ${process.arch}).`
      );
    }
    throw err;
  }
}

async function initialize() {
  if (pool) return pool;

  enableThickMode();

  if (oracledb.thin) {
    throw new Error(
      'node-oracledb is still in Thin mode, which cannot talk to Oracle 11.2.'
    );
  }

  pool = await oracledb.createPool(db);
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initialize() first.');
  }
  return pool;
}

/**
 * Run a single read query. Nothing here commits, so this is safe for
 * SELECTs only — anything that writes belongs in withTransaction().
 */
async function query(sql, binds = {}, options = {}) {
  const connection = await getPool().getConnection();
  try {
    return await connection.execute(sql, binds, options);
  } finally {
    await connection.close();
  }
}

/**
 * Run `work` inside one explicit transaction: commit if it returns,
 * roll back if it throws. This is the only way multi-statement writes
 * should reach the database (PRD §9.10) — registration, storage
 * allocation, place bid, award winning bid, assign transport, and
 * delivery+payment all depend on all-or-nothing behaviour.
 */
async function withTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // A rollback failure must not mask the original error.
    }
    throw err;
  } finally {
    await connection.close();
  }
}

async function close() {
  if (!pool) return;
  await pool.close(10);
  pool = null;
}

module.exports = { initialize, getPool, query, withTransaction, close };
