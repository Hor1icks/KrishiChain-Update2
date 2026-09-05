'use strict';


const oracledb = require('oracledb');
const { db, oracleClientDir } = require('./env');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

oracledb.autoCommit = false;

let pool = null;

function enableThickMode() {
  if (!oracledb.thin) return;
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

async function query(sql, binds = {}, options = {}) {
  const connection = await getPool().getConnection();
  try {
    return await connection.execute(sql, binds, options);
  } finally {
    await connection.close();
  }
}

async function callCursor(plsql, binds = {}, { batchSize = 200, maxRows = 20000 } = {}) {
  const connection = await getPool().getConnection();
  let resultSet = null;
  try {
    const result = await connection.execute(
      plsql,
      { ...binds, cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    resultSet = result.outBinds.cursor;

    const rows = [];
    let truncated = false;
    for (; ;) {
      const batch = await resultSet.getRows(batchSize);
      if (batch.length === 0) break;
      rows.push(...batch);
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
    }
    return { rows, truncated };
  } finally {
    if (resultSet) {
      try {
        await resultSet.close();
      } catch {
      }
    }
    await connection.close();
  }
}

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

module.exports = { initialize, getPool, query, callCursor, withTransaction, close };
