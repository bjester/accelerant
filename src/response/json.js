import ResponseFactory from './index.js';

const headers = { 'Content-Type': 'application/json' };

export default class JSONResponseFactory extends ResponseFactory {
  build(body, options = {}) {
    const { status = 200 } = options;
    if (status >= 400 && (typeof body === 'string' || body instanceof String)) {
      body = { error: body };
    }

    return super.build(body !== null ? JSON.stringify(body) : null, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });
  }
}
