/**
 * KrishiChain | test_connection.js
 * Day 0 driver proof for Oracle Database 11g Express Edition.
 *
 * WHY THIS EXISTS
 * node-oracledb runs in "Thin" mode by default, which requires Oracle
 * Database 12.1 or later. It CANNOT connect to 11.2 at all. Thick mode
 * with Oracle Instant Client 19c is mandatory for us. This script proves
 * Thick mode loads and reaches XE before anyone writes application code.
 *
 * SETUP
 *   1. npm init -y && npm install oracledb dotenv
 *   2. Install Oracle Instant Client 19c (Basic or Basic Light).
 *      MUST match your XE build: 64-bit XE -> 64-bit client -> 64-bit Node.
 *   3. Set INSTANT_CLIENT_DIR below (or in .env) to the unzipped folder.
 *   4. node test_connection.js
 */

const oracledb = require('oracledb');

// ---------------------------------------------------------------------
// EDIT THESE FOR YOUR MACHINE
// ---------------------------------------------------------------------
const INSTANT_CLIENT_DIR = 'C:\\oracle\\instantclient_19_26'; // Windows
// const INSTANT_CLIENT_DIR = '/opt/oracle/instantclient_19_26'; // Linux

const DB = {
  user: 'krishichain',
  password: 'Krishi#2026',
  connectString: 'localhost:1521/XE', // XE's SID is fixed as XE
};
// ---------------------------------------------------------------------

function fail(step, err) {
  console.error(`\n  FAILED at: ${step}`);
  console.error(`   ${err.message}\n`);

  if (err.message.includes('DPI-1047')) {
    console.error('   DIAGNOSIS: Instant Client could not be loaded.');
    console.error('   This is almost always an ARCHITECTURE MISMATCH, not a missing file.');
    console.error('   Check all three are the same bitness:');
    console.error('     - Your XE install (Win32 vs Win64)');
    console.error('     - Your Instant Client download');
    console.error('     - Your Node.js install  (run: node -p "process.arch")');
  } else if (err.message.includes('NJS-138') || err.message.includes('Thin mode')) {
    console.error('   DIAGNOSIS: Still running in Thin mode.');
    console.error('   Thin mode cannot talk to Oracle 11.2. initOracleClient()');
    console.error('   must run BEFORE any getConnection() call.');
  } else if (err.message.includes('ORA-12541')) {
    console.error('   DIAGNOSIS: No listener. Is the XE service running?');
    console.error('   Windows: services.msc -> OracleServiceXE + OracleXETNSListener');
  } else if (err.message.includes('ORA-01017')) {
    console.error('   DIAGNOSIS: Bad username/password. Did 00_environment_check.sql run?');
  } else if (err.message.includes('ORA-12514')) {
    console.error('   DIAGNOSIS: Service name wrong. Should be XE, not ORCL or XEPDB1.');
  }
  process.exit(1);
}

async function main() {
  console.log('KrishiChain :: Day 0 driver proof\n');

  // STEP 1 -- enable Thick mode. Must happen before any connection.
  try {
    oracledb.initOracleClient({ libDir: INSTANT_CLIENT_DIR });
    console.log('  [1/4] Thick mode enabled');
  } catch (err) {
    fail('initOracleClient (Thick mode)', err);
  }

  // STEP 2 -- confirm we are actually thick, not silently thin
  if (oracledb.thin) {
    console.error('\n  Driver reports Thin mode. It cannot reach Oracle 11.2.');
    process.exit(1);
  }
  console.log(`  [2/4] Mode confirmed: THICK  (node-oracledb ${oracledb.versionString})`);

  // STEP 3 -- create the pool exactly as the app will
  let pool;
  try {
    pool = await oracledb.createPool({
      ...DB,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
    });
    console.log('  [3/4] Connection pool created');
  } catch (err) {
    fail('createPool', err);
  }

  // STEP 4 -- round-trip a real query with a bind variable
  let conn;
  try {
    conn = await pool.getConnection();

    const ver = await conn.execute(
      `SELECT banner FROM v$version WHERE ROWNUM = 1`
    );
    const who = await conn.execute(
      `SELECT USER, TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI') FROM dual`
    );
    const bind = await conn.execute(
      `SELECT :crop AS crop, :price * 2 AS doubled FROM dual`,
      { crop: 'Aman Rice', price: 32.75 }
    );

    console.log('  [4/4] Query round-trip OK\n');
    console.log('  ------------------------------------------');
    console.log(`   Database : ${ver.rows[0][0]}`);
    console.log(`   User     : ${who.rows[0][0]}`);
    console.log(`   Server   : ${who.rows[0][1]}`);
    console.log(`   Bind test: ${bind.rows[0][0]} -> ${bind.rows[0][1]}`);
    console.log('  ------------------------------------------\n');
    console.log('  ENVIRONMENT READY. Proceed to Day 1.\n');
  } catch (err) {
    fail('query execution', err);
  } finally {
    if (conn) await conn.close();
    if (pool) await pool.close(0);
  }
}

main();
