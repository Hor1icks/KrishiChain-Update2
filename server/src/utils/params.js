'use strict';

const ApiError = require('./ApiError');

/**
 * Route ids arrive as strings. Number('abc') is NaN, which used to reach
 * Oracle and come back as a 500 -- a malformed URL reported as a server
 * fault. This turns it into the 400 it always was.
 */
function id(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${name} must be a positive whole number.`);
  }
  return n;
}

/** Boolean('false') is true, so a string is never accepted as one. */
function bool(value, name) {
  if (typeof value === 'boolean') return value;
  throw ApiError.badRequest(`${name} must be true or false.`);
}

module.exports = { id, bool };
