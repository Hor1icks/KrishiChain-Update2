'use strict';

require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy server/.env.example to ` +
        `server/.env and fill it in.`
    );
  }
  return value;
}

module.exports = {
  port: Number(required('PORT', 5000)),
  clientOrigin: required('CLIENT_ORIGIN', 'http://localhost:5173'),

  // Thick mode needs this before any connection is opened. See config/db.js.
  oracleClientDir: required('ORACLE_CLIENT_DIR'),

  db: {
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    connectString: required('DB_CONNECT_STRING'),
    poolMin: Number(required('DB_POOL_MIN', 2)),
    poolMax: Number(required('DB_POOL_MAX', 10)),
    poolIncrement: 1,
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: required('JWT_EXPIRES_IN', '8h'),
  },
};
