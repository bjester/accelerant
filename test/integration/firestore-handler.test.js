import { expect } from 'chai';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import JSONResponseFactory from '../../src/response/json.js';
import { GetStrategyHandler, PostStrategyHandler, PatchStrategyHandler, DeleteStrategyHandler } from '../../src/strategy/handler/firestore.js';
import RequestContext from '../../src/request/index.js';
import { getIntegrationRuntime } from './runtime.js';

function makeHandler(runtime, HandlerClass, request) {
  // process.env.NODE_ENV = 'production';
  const strategy = {
    plugins: [],
    responseFactory: new JSONResponseFactory(),
    options: { apiPath: '/api/db' }
  };
  const event = { waitUntil: () => {} };
  return new HandlerClass(runtime, strategy, { event, request, params: undefined });
}

function makeRequest(url, options = {}) {
  return new RequestContext(new Request(url, options), { pathPrefix: '/api/db' });
}

describe('Firestore handlers (emulator)', () => {
  let runtime;

  before(async function () {
    runtime = await getIntegrationRuntime();
  });

  beforeEach(() => runtime.ready());

  it('GET returns doc with id merged into data', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'users', 'u1'), { id: 'u1', name: 'Ada' });

    const request = makeRequest('http://localhost/api/db/users/u1', { method: 'GET' });
    const handler = makeHandler(runtime, GetStrategyHandler, request);

    const response = await handler._doFetch(request);
    const body = await response.json();

    expect(response.status).to.equal(200);
    expect(body).to.deep.equal({ id: 'u1', name: 'Ada' });
  });

  it('POST creates doc and PATCH updates it', async () => {
    const postRequest = makeRequest(
      'http://localhost/api/db/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Write tests' })
      }
    );
    const postHandler = makeHandler(runtime, PostStrategyHandler, postRequest);
    const postResponse = await postHandler._doFetch(postRequest);
    expect(postResponse.status).to.equal(201);

    const created = await postResponse.json();
    expect(created.id).to.be.a('string').and.not.empty;

    const patchRequest = makeRequest(
      `http://localhost/api/db/todos/${created.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id, done: true })
      }
    );

    const patchHandler = makeHandler(runtime, PatchStrategyHandler, patchRequest);
    const patchResponse = await patchHandler._doFetch(patchRequest);
    expect(patchResponse.status).to.equal(200);

    const updated = await patchResponse.json();
    expect(updated).to.include({ id: created.id, done: true });

    const snapshot = await getDoc(doc(runtime.firebase.firestore, 'todos', created.id));
    expect(snapshot.exists()).to.equal(true);
  });

  it('DELETE removes doc', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'notes', 'n1'), { id: 'n1', title: 'Delete me' });

    const request = makeRequest('http://localhost/api/db/notes/n1', { method: 'DELETE' });
    const handler = makeHandler(runtime, DeleteStrategyHandler, request);

    const response = await handler._doFetch(request);
    expect(response.status).to.equal(204);

    const snapshot = await getDoc(doc(runtime.firebase.firestore, 'notes', 'n1'));
    expect(snapshot.exists()).to.equal(false);
  });

  it('GET collection supports where, orderBy, and limit', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'people', 'p1'), { id: 'p1', age: '30', role: 'admin', createdAt: 3 });
    await setDoc(doc(runtime.firebase.firestore, 'people', 'p2'), { id: 'p2', age: '25', role: 'editor', createdAt: 2 });
    await setDoc(doc(runtime.firebase.firestore, 'people', 'p3'), { id: 'p3', age: '19', role: 'viewer', createdAt: 1 });

    const request = makeRequest(
      'http://localhost/api/db/people?age__gte=21&orderBy=desc:createdAt&limit=2',
      { method: 'GET' }
    );
    const handler = makeHandler(runtime, GetStrategyHandler, request);

    const response = await handler._doFetch(request);
    const body = await response.json();

    expect(response.status).to.equal(200);
    expect(body.length).to.equal(2);
    expect(body[0].createdAt).to.be.greaterThan(body[1].createdAt);
  });

  it('GET collection supports in and has_any filters', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'teams', 't1'), { id: 't1', role: 'admin', tags: ['alpha'] });
    await setDoc(doc(runtime.firebase.firestore, 'teams', 't2'), { id: 't2', role: 'editor', tags: ['beta'] });
    await setDoc(doc(runtime.firebase.firestore, 'teams', 't3'), { id: 't3', role: 'viewer', tags: ['gamma'] });

    const request = makeRequest(
      'http://localhost/api/db/teams?role__in=admin&role__in=editor&tags__has_any=alpha&tags__has_any=beta',
      { method: 'GET' });
    const handler = makeHandler(runtime, GetStrategyHandler, request);

    const response = await handler._doFetch(request);
    const body = await response.json();

    expect(response.status).to.equal(200);
    const ids = body.map((doc) => doc.id).sort();
    expect(ids).to.deep.equal(['t1', 't2']);
  });

  it('GET collection group returns matching docs', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'users', 'u1', 'items', 'i1'), { id: 'i1', createdAt: 1 });
    await setDoc(doc(runtime.firebase.firestore, 'orgs', 'o1', 'items', 'i2'), { id: 'i2', createdAt: 2 });

    const request = makeRequest(
      'http://localhost/api/db/items.group?orderBy=asc:createdAt',
      { method: 'GET' });
    const handler = makeHandler(runtime, GetStrategyHandler, request);

    const response = await handler._doFetch(request);
    const body = await response.json();

    expect(response.status).to.equal(200);
    const ids = body.map((doc) => doc.id).sort();
    expect(ids).to.deep.equal(['i1', 'i2']);
  });

  it('GET collection supports startAt/after with orderBy', async () => {
    await setDoc(doc(runtime.firebase.firestore, 'pages', 'p1'), { id: 'p1', createdAt: 1 });
    await setDoc(doc(runtime.firebase.firestore, 'pages', 'p2'), { id: 'p2', createdAt: 2 });
    await setDoc(doc(runtime.firebase.firestore, 'pages', 'p3'), { id: 'p3', createdAt: 3 });

    const startAtRequest = makeRequest(
      'http://localhost/api/db/pages?orderBy=asc:createdAt&at=p2',
      { method: 'GET' });
    const startAtHandler = makeHandler(runtime, GetStrategyHandler, startAtRequest);
    const startAtResponse = await startAtHandler._doFetch(startAtRequest);
    const startAtBody = await startAtResponse.json();

    expect(startAtResponse.status).to.equal(200);
    expect(startAtBody.map((doc) => doc.id)).to.deep.equal(['p2', 'p3']);

    const startAfterRequest = makeRequest(
      'http://localhost/api/db/pages?orderBy=asc:createdAt&after=p2',
      { method: 'GET' });
    const startAfterHandler = makeHandler(runtime, GetStrategyHandler, startAfterRequest);
    const startAfterResponse = await startAfterHandler._doFetch(startAfterRequest);
    const startAfterBody = await startAfterResponse.json();

    expect(startAfterResponse.status).to.equal(200);
    expect(startAfterBody.map((doc) => doc.id)).to.deep.equal(['p3']);
  });

  it('GET collection rejects invalid query params', async () => {
    const invalidOrderRequest = makeRequest(
      'http://localhost/api/db/people?age__nope=1',
      { method: 'GET' });
    const invalidOrderHandler = makeHandler(runtime, GetStrategyHandler, invalidOrderRequest);
    let invalidOrderResponse;
    try {
      invalidOrderResponse = await invalidOrderHandler._doFetch(invalidOrderRequest);
    } catch (error) {
      invalidOrderResponse = invalidOrderHandler.strategy.responseFactory.fromError(error);
    }
    expect(invalidOrderResponse.status).to.equal(400);

    const invalidLimitRequest = makeRequest(
      'http://localhost/api/db/people?limit=not-a-number',
      { method: 'GET' });
    const invalidLimitHandler = makeHandler(runtime, GetStrategyHandler, invalidLimitRequest);
    let invalidLimitResponse;
    try {
      invalidLimitResponse = await invalidLimitHandler._doFetch(invalidLimitRequest);
    } catch (error) {
      invalidLimitResponse = invalidLimitHandler.strategy.responseFactory.fromError(error);
    }
    expect(invalidLimitResponse.status).to.equal(400);
  });
});
