'use strict';

const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Reads the Bearer token and puts { userId, role, email } on req.user.
 *
 * Once the role modules land in Phases 4-6, the ownership rules (BR-02,
 * BR-03, "a farmer may only edit their own batches") are enforced by
 * comparing req.user.userId against the row's owner inside the service
 * layer — the database has no concept of a current application user.
 */
function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header.'));
  }

  try {
    const payload = jwt.verify(token, jwtConfig.secret);
    req.user = { userId: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return next(ApiError.unauthorized('Session expired or token invalid.'));
  }
}

/** Route guard: requireRole('FARMER') or requireRole('ADMIN', 'STORAGE_MANAGER'). */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}.`));
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
