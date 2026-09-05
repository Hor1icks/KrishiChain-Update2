'use strict';

const ApiError = require('./ApiError');

function id(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`${name} must be a positive whole number.`);
  }
  return n;
}

function bool(value, name) {
  if (typeof value === 'boolean') return value;
  throw ApiError.badRequest(`${name} must be true or false.`);
}

module.exports = { id, bool };
