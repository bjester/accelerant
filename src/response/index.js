import {
  BadRequestError,
  InvalidImplementationError,
  MethodNotAllowedError,
  NotFoundError,
  RequestError,
  ServerError,
} from '../errors.js';
import { FirebaseErrorCodeToStatus } from './constants.js';

export default class ResponseFactory {
  constructor(options = {}) {
    this.options = options;
  }

  build(body, options = {}) {
    return new Response(body, {
      ...this.options,
      ...options,
    });
  }

  fromError(error, options = {}) {
    const { returnDefault = true } = options;
    if (error instanceof NotFoundError) {
      return this.notFound(error.message, options);
    }
    if (error instanceof MethodNotAllowedError) {
      return this.methodNotAllowed(error.message, options);
    }
    if (error instanceof RequestError || error instanceof BadRequestError) {
      return this.badRequest(error.message, options);
    }
    if (error instanceof InvalidImplementationError) {
      return this.serviceUnavailable(error.message, options);
    }
    if (error instanceof ServerError) {
      return this.internalServerError(error.message, options);
    }
    if (error.code && FirebaseErrorCodeToStatus[error.code]) {
      return this.build(error.message, {
        status: FirebaseErrorCodeToStatus[error.code],
        ...options,
      });
    }
    if (returnDefault) {
      return this.unknownError(error.message, options);
    }
    return null;
  }

  ok(body, options = {}) {
    return this.build(body, {
      status: 200,
      ...options,
    });
  }

  created(body = 'Created', options = {}) {
    return this.build(body, {
      status: 201,
      ...options,
    });
  }

  noContent(options = {}) {
    return this.build(null, {
      status: 204,
      ...options,
    });
  }

  badRequest(body = 'Bad request', options = {}) {
    return this.build(body, {
      status: 400,
      ...options,
    });
  }

  unauthorized(body = 'Unauthorized', options = {}) {
    return this.build(body, {
      status: 401,
      ...options,
    });
  }

  forbidden(body = 'Forbidden', options = {}) {
    return this.build(body, {
      status: 403,
      ...options,
    });
  }

  notFound(body = 'Not found', options = {}) {
    return this.build(body, {
      status: 404,
      ...options,
    });
  }

  methodNotAllowed(body = 'Method not allowed', options = {}) {
    return this.build(body, {
      status: 405,
      ...options,
    });
  }

  conflict(body = 'Conflict', options = {}) {
    return this.build(body, {
      status: 409,
      ...options,
    });
  }

  gone(body = 'Gone', options = {}) {
    return this.build(body, {
      status: 410,
      ...options,
    });
  }

  preconditionFailed(body = 'Precondition failed', options = {}) {
    return this.build(body, {
      status: 412,
      ...options,
    });
  }

  tooManyRequests(body = 'Too many requests', options = {}) {
    return this.build(body, {
      status: 429,
      ...options,
    });
  }

  internalServerError(body = 'Internal server error', options = {}) {
    return this.build(body, {
      status: 500,
      ...options,
    });
  }

  serviceUnavailable(body = 'Service unavailable', options = {}) {
    return this.build(body, {
      status: 503,
      ...options,
    });
  }

  gatewayTimeout(body = 'Gateway timeout', options = {}) {
    return this.build(body, {
      status: 504,
      ...options,
    });
  }

  unknownError(body = 'Unknown error', options = {}) {
    return this.build(body, {
      status: 520,
      ...options,
    });
  }

  deadlineExceeded(body = 'Deadline exceeded', options = {}) {
    return this.build(body, {
      status: 524,
      ...options,
    });
  }
}
