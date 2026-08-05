'use strict';

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details) this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Invalid email or password.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  /**
   * 422 — the request was well-formed but violates a business rule
   * (BR-09, BR-11, BR-18, ...). Distinct from 400 so the client can tell
   * "you typed something wrong" apart from "the rules forbid this".
   */
  static businessRule(message, details) {
    return new ApiError(422, message, details);
  }
}

module.exports = ApiError;
