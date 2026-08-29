'use strict';

const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`));
}

/**
 * Constraint names are deliberately readable (PK_/FK_/UQ_/CK_ prefixes)
 * so a violation can be shown to the user rather than swallowed as a 500.
 */
const CONSTRAINT_TEXT = {
  CK_PAYMENT_TYPE_SHAPE:
    'A sale payment needs an order, a buyer and a farmer; a storage payment needs an allocation and none of those.',
  CK_PAYMENT_TYPE: 'A payment must be either SALE or STORAGE.',
  CK_USERS_DISTRICT: 'An address must include a district.',
  CK_MANAGER_SHIFT: 'A shift must be DAY, NIGHT or ROTATING.',
  CK_BATCH_MINBIDQTY:
    'The minimum bid quantity cannot exceed the batch total, or no bid could ever satisfy it.',
  CK_STORES_CUSTOMER: 'A storage allocation belongs to exactly one customer, a farmer or a buyer.',
  UQ_USERS_EMAIL: 'That email address is already registered.',
  UQ_ORDER_BID: 'That bid already has a sale order.',
  UQ_TRANSPORT_ORDER: 'That order already has a transport request.',
  UQ_ASSIGNED_TRIPLE: 'That vehicle and driver are already on this trip.',
  UQ_PAYMENT_REFERENCE: 'That transaction reference has already been used.',
  UQ_MANAGER_CERT: 'That certification number is already registered.',
};

function constraintName(message) {
  const match = message.match(/\.([A-Z][A-Z0-9_]+)\)/) || message.match(/\((?:\w+)\.([A-Z0-9_]+)\)/);
  return match ? match[1] : null;
}

function fromOracle(message) {
  const businessRule = message.match(/ORA-20\d{3}:\s*(.+?)(?:\n|ORA-|$)/);
  if (businessRule) return { status: 422, error: businessRule[1].trim() };

  const code = (message.match(/ORA-(\d{5})/) || [])[1];
  const name = constraintName(message);
  const known = name && CONSTRAINT_TEXT[name];

  switch (code) {
    case '00001':
      return { status: 409, error: known || 'That value is already taken.', constraint: name };
    case '02290':
      return { status: 422, error: known || 'That change breaks a rule the database enforces.', constraint: name };
    case '02291':
      return { status: 422, error: known || 'That refers to something that does not exist.', constraint: name };
    case '02292':
      return {
        status: 409,
        error: known || 'Other records still depend on this, so it cannot be removed.',
        constraint: name,
      };
    case '01400':
      return { status: 422, error: 'A required field was left empty.' };
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg shape
function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  const message = err.message || 'Unexpected server error.';
  const mapped = fromOracle(message);
  if (mapped) {
    const { status, ...body } = mapped;
    return res.status(status).json(body);
  }

  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Unexpected server error.' });
}

module.exports = { notFound, errorHandler };
