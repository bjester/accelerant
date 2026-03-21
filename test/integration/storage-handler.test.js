import { expect } from 'chai';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import RequestContext from '../../src/request/index.js';
import JSONResponseFactory from '../../src/response/json.js';
import {
  DeleteStrategyHandler,
  GetStrategyHandler,
  HeadStrategyHandler,
  PutStrategyHandler,
} from '../../src/strategy/handler/storage.js';
import { getIntegrationRuntime, hasEmulatorEnv } from './runtime.js';

function makeHandler(runtime, HandlerClass, request) {
  process.env.NODE_ENV = 'production';
  const strategy = {
    plugins: [],
    responseFactory: new JSONResponseFactory(),
    options: { apiPath: '/api/fs' },
  };
  const event = { waitUntil: () => {} };
  return new HandlerClass(runtime, strategy, { event, request, params: undefined });
}

function makeRequest(url, options = {}) {
  return new RequestContext(new Request(url, options), { pathPrefix: '/api/fs' });
}

describe('Storage handler (emulator)', () => {
  let runtime;

  before(function () {
    if (!hasEmulatorEnv()) {
      this.skip();
      return;
    }
    return getIntegrationRuntime().then((value) => {
      runtime = value;
    });
  });

  beforeEach(() => runtime.ready());

  it('PUT uploads, HEAD returns metadata, GET downloads, DELETE removes', async () => {
    const path = 'fixtures/hello.txt';
    const content = 'hello storage';

    const putRequest = makeRequest(`http://localhost/api/fs/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: new TextEncoder().encode(content),
    });

    const putHandler = makeHandler(runtime, PutStrategyHandler, putRequest);
    const putResponse = await putHandler._runFetch(putRequest);
    if (putResponse.status !== 201) {
      const text = await putResponse.text();
      throw new Error(`PUT failed: ${putResponse.status} ${text}`);
    }

    const headRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'HEAD' });
    const headHandler = makeHandler(runtime, HeadStrategyHandler, headRequest);
    const headResponse = await headHandler._runFetch(headRequest);
    expect(headResponse.status).to.equal(204);

    const getRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'GET' });
    const getHandler = makeHandler(runtime, GetStrategyHandler, getRequest);
    const getResponse = await getHandler._runFetch(getRequest);
    expect(getResponse.status).to.equal(200);
    expect(getResponse.headers.get('Content-Type')).to.equal('text/plain');
    const downloaded = await getResponse.text();
    expect(downloaded).to.equal(content);

    const deleteRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'DELETE' });
    const deleteHandler = makeHandler(runtime, DeleteStrategyHandler, deleteRequest);
    const deleteResponse = await deleteHandler._runFetch(deleteRequest);
    expect(deleteResponse.status).to.equal(204);

    const headAfterDelete = makeRequest(`http://localhost/api/fs/${path}`, { method: 'HEAD' });
    const headAfterHandler = makeHandler(runtime, HeadStrategyHandler, headAfterDelete);
    const headAfterResponse = await headAfterHandler._runFetch(headAfterDelete);
    expect(headAfterResponse.status).to.equal(404);
  });

  it('HEAD and GET return 404 for missing files', async () => {
    const path = 'fixtures/missing.txt';

    const headRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'HEAD' });
    const headHandler = makeHandler(runtime, HeadStrategyHandler, headRequest);
    const headResponse = await headHandler._runFetch(headRequest);
    expect(headResponse.status).to.equal(404);

    const getRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'GET' });
    const getHandler = makeHandler(runtime, GetStrategyHandler, getRequest);
    const getResponse = await getHandler._runFetch(getRequest);
    expect(getResponse.status).to.equal(404);
  });

  it('defaults content-type when missing and serves cached response', async () => {
    const path = 'fixtures/no-content-type.txt';
    const content = 'no content type';

    const putRequest = makeRequest(`http://localhost/api/fs/${path}`, {
      method: 'PUT',
      body: new TextEncoder().encode(content),
    });
    const putHandler = makeHandler(runtime, PutStrategyHandler, putRequest);
    const putResponse = await putHandler._runFetch(putRequest);
    expect(putResponse.status).to.equal(201);

    const headRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'HEAD' });
    const headHandler = makeHandler(runtime, HeadStrategyHandler, headRequest);
    const headResponse = await headHandler._runFetch(headRequest);
    expect(headResponse.status).to.equal(204);

    const getRequest = makeRequest(`http://localhost/api/fs/${path}`, { method: 'GET' });
    const getHandler = makeHandler(runtime, GetStrategyHandler, getRequest);
    const getResponse = await getHandler._runFetch(getRequest);
    expect(getResponse.status).to.equal(200);
    const firstBody = await getResponse.text();
    expect(firstBody).to.equal(content);

    // Delete directly via SDK to simulate missing object while keeping cache.
    await deleteObject(storageRef(runtime.firebase.storage, path));

    const missingResponse = await getHandler._runFetch(getRequest);
    expect(missingResponse.status).to.equal(404);
  });
});
