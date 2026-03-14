import { expect } from 'chai';
import JSONResponseFactory from '../../src/response/json.js';
import { PostStrategyHandler as AuthPostHandler, GetStrategyHandler as AuthGetHandler } from '../../src/strategy/handler/auth.js';
import RequestContext from '../../src/request/index.js';
import { signOut } from 'firebase/auth';
import { getIntegrationRuntime, hasEmulatorEnv } from './runtime.js';

import {createUser, createAdminUser, createDisabledUser, teardown} from "../fixtures/auth.js";


class MockBroadcastChannel {
  static instances = [];

  constructor(name) {
    this.name = name;
    this.messages = [];
    this.closed = false;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(payload) {
    this.messages.push(payload);
  }

  close() {
    this.closed = true;
  }
}

function makeHandler(runtime, HandlerClass, request, requireClaims = null) {
  process.env.NODE_ENV = 'production';
  runtime.config.requireClaims = requireClaims;
  const strategy = {
    plugins: [],
    responseFactory: new JSONResponseFactory(),
    options: { apiPath: '/api/auth' }
  };
  const event = { waitUntil: () => {} };
  return new HandlerClass(runtime, strategy, { event, request, params: undefined });
}

function makeRequest(url, options = {}) {
  return new RequestContext(new Request(url, options), { pathPrefix: '/api/auth' });
}

describe('Auth handler (emulator)', () => {
  let runtime;
  let originalBroadcastChannel;

  before(function () {
    if (!hasEmulatorEnv()) {
      this.skip();
    } else {
      return getIntegrationRuntime().then((value) => {
        runtime = value;
      });
    }
  });

  beforeEach(() => runtime.ready());

  afterEach(async () => {
    if (runtime?.firebase?.auth?.currentUser) {
      await signOut(runtime.firebase.auth);
    }
  });

  afterEach(() => {
    if (originalBroadcastChannel) {
      globalThis.BroadcastChannel = originalBroadcastChannel;
      originalBroadcastChannel = null;
    }
  });

  after(teardown);

  it('signs in, reports status, and signs out', async () => {
    const email = `test-${Date.now()}@example.com`;
    const password = 'password123!';

    await createAdminUser({ email, password });

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    const signInBody = await signInResponse.json();

    expect(signInResponse.status).to.equal(200);
    expect(signInBody.authenticated).to.equal(true);

    const statusRequest = makeRequest('http://localhost/api/auth/status', { method: 'GET' });
    const statusHandler = makeHandler(runtime, AuthGetHandler, statusRequest, { admin: true });
    const statusResponse = await statusHandler._doFetch(statusRequest);
    const statusBody = await statusResponse.json();

    expect(statusResponse.status).to.equal(200);
    expect(statusBody.authenticated).to.equal(true);
    expect(statusBody.user.email).to.equal(email);

    const signOutRequest = makeRequest('http://localhost/api/auth/sign-out', { method: 'POST' });
    const signOutHandler = makeHandler(runtime, AuthPostHandler, signOutRequest, { admin: true });
    const signOutResponse = await signOutHandler._doFetch(signOutRequest);
    const signOutBody = await signOutResponse.json();

    expect(signOutResponse.status).to.equal(200);
    expect(signOutBody.authenticated).to.equal(false);
  });

  it('does not broadcast auth state changes without route plugins', async () => {
    const email = `broadcast-${Date.now()}@example.com`;
    const password = 'password123!';
    await createAdminUser({ email, password });

    originalBroadcastChannel = globalThis.BroadcastChannel;
    MockBroadcastChannel.instances = [];
    globalThis.BroadcastChannel = MockBroadcastChannel;

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(200);

    const signOutRequest = makeRequest('http://localhost/api/auth/sign-out', { method: 'POST' });
    const signOutHandler = makeHandler(runtime, AuthPostHandler, signOutRequest, { admin: true });
    const signOutResponse = await signOutHandler._doFetch(signOutRequest);
    expect(signOutResponse.status).to.equal(200);

    expect(MockBroadcastChannel.instances.length).to.equal(0);
  });

  it('rejects sign-in without admin claim', async () => {
    const email = `no-admin-${Date.now()}@example.com`;
    const password = 'password123!';

    await createUser({ email, password });

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(403);

    const statusRequest = makeRequest('http://localhost/api/auth/status', { method: 'GET' });
    const statusHandler = makeHandler(runtime, AuthGetHandler, statusRequest, { admin: true });
    const statusResponse = await statusHandler._doFetch(statusRequest);
    const statusBody = await statusResponse.json();

    expect(statusResponse.status).to.equal(200);
    expect(statusBody.authenticated).to.equal(false);
  });

  it('allows sign-in when no claims required', async () => {
    const email = `no-claims-${Date.now()}@example.com`;
    const password = 'password123!';
    await createUser({ email, password });

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, null);
    const signInResponse = await signInHandler._runFetch(signInRequest);
    const signInBody = await signInResponse.json();

    expect(signInResponse.status).to.equal(200);
    expect(signInBody.authenticated).to.equal(true);
  });

  it('rejects wrong password', async () => {
    const email = `wrong-pass-${Date.now()}@example.com`;
    const password = 'password123!';
    await createAdminUser({ email, password });

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'not-the-password' })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(403);
  });

  it('rejects unknown user', async () => {
    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `missing-${Date.now()}@example.com`, password: 'password123!' })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(403);
  });

  it('rejects invalid email', async () => {
    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'password123!' })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(400);
  });

  it('rejects disabled user', async () => {
    const email = `disabled-${Date.now()}@example.com`;
    const password = 'password123!';
    await createDisabledUser({ email, password });

    const signInRequest = makeRequest(
      'http://localhost/api/auth/sign-in',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }
    );

    const signInHandler = makeHandler(runtime, AuthPostHandler, signInRequest, { admin: true });
    const signInResponse = await signInHandler._runFetch(signInRequest);
    expect(signInResponse.status).to.equal(400);
  });

  it('returns unauthenticated on sign-out when not signed in', async () => {
    const signOutRequest = makeRequest('http://localhost/api/auth/sign-out', { method: 'POST' });
    const signOutHandler = makeHandler(runtime, AuthPostHandler, signOutRequest, { admin: true });
    const signOutResponse = await signOutHandler._doFetch(signOutRequest);
    const signOutBody = await signOutResponse.json();

    expect(signOutResponse.status).to.equal(200);
    expect(signOutBody.authenticated).to.equal(false);
  });

  it('rejects unsupported methods', async () => {
    const request = makeRequest('http://localhost/api/auth/status', { method: 'PUT' });
    const handler = makeHandler(runtime, AuthGetHandler, request, { admin: true });
    const response = await handler._runFetch(request);
    expect(response.status).to.equal(405);
  });
});
