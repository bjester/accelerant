export class WorkboxError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }

  toString() {
    const name = this.constructor.name;
    const message = this.message ? `${this.message} ` : '';
    const details = this.details ? `| ${JSON.stringify(this.details)}` : '';
    return `${name}: ${message}[${this.status}] ${details}`.trim();
  }
}

export class RequestError extends WorkboxError {}

export class BadRequestError extends RequestError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}

export class NotFoundError extends RequestError {
  constructor(message, details = null) {
    super(message, 404, details);
  }
}

export class MethodNotAllowedError extends RequestError {
  constructor(message, details = null) {
    super(message, 405, details);
  }
}

export class ServerError extends WorkboxError {
  constructor(message, status = 500, details = null) {
    super(message, status, details);
  }
}

export class InvalidImplementationError extends ServerError {
  constructor(message, details = null) {
    super(message, 500, details);
  }
}
