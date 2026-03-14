import { expect } from 'chai';
import ResponseFactory from '../../src/response/index.js';
import {
  BadRequestError,
  MethodNotAllowedError,
  InvalidImplementationError,
  ServerError
} from '../../src/errors.js';

describe('ResponseFactory.fromError', () => {
  it('maps BadRequestError to 400', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError(new BadRequestError('bad'));
    expect(response.status).to.equal(400);
  });

  it('maps MethodNotAllowedError to 405', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError(new MethodNotAllowedError('nope'));
    expect(response.status).to.equal(405);
  });

  it('maps InvalidImplementationError to 503', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError(new InvalidImplementationError('invalid'));
    expect(response.status).to.equal(503);
  });

  it('maps ServerError to 500', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError(new ServerError('boom'));
    expect(response.status).to.equal(500);
  });

  it('maps Firebase error codes to status', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError({ code: 'permission-denied', message: 'nope' });
    expect(response.status).to.equal(403);
  });

  it('maps unknown errors to 520', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError({ code: 'totally-unknown', message: 'nope' });
    expect(response.status).to.equal(520);
  });

  it('maps Firebase not-found to 404', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError({ code: 'not-found', message: 'missing' });
    expect(response.status).to.equal(404);
  });

  it('maps Firebase unauthenticated to 401', async () => {
    const factory = new ResponseFactory();
    const response = factory.fromError({ code: 'unauthenticated', message: 'no auth' });
    expect(response.status).to.equal(401);
  });
});
