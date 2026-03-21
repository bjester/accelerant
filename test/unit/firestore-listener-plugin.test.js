import { expect } from 'chai';
import { FirestoreListenerWorkboxPlugin } from '../../src/strategy/plugins/firestore.js';

class MemoryIndex {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) || new Set();
  }

  async update(key, callback) {
    const current = await this.get(key);
    const next = await callback(current);
    if (!next || next.size === 0) {
      this.store.delete(key);
      return;
    }
    this.store.set(key, next);
  }

  async sync() {}
}

class TestListenerPlugin extends FirestoreListenerWorkboxPlugin {
  constructor(runtime, options = {}) {
    super(runtime, options);
    this.index = new MemoryIndex();
    this.targetsByUrl = new Map();
    this.countCalls = 0;
  }

  async _getMetadataIndex() {
    return this.index;
  }

  async _attachListener() {
    return () => {};
  }

  async _countQueryResults(ref) {
    this.countCalls += 1;
    return ref?.__count || 0;
  }

  async _buildListenerTarget(request) {
    const fromMap = this.targetsByUrl.get(request.url);
    if (fromMap) {
      return fromMap;
    }
    const path = new URL(request.url).pathname;
    return {
      listenKey: path,
      path,
      kind: 'collection',
      ref: {},
    };
  }
}

function makeRuntime(messages) {
  return {
    version: 'test',
    broadcastChannel: {
      postMessage(payload) {
        messages.push(payload);
      },
    },
  };
}

function makeCollectionDescriptor(collectionPath, filters = []) {
  return {
    kind: 'collection',
    collectionPath,
    groupName: null,
    filters,
    orderBy: [],
    cursors: [],
    limit: null,
  };
}

function makeHandler() {
  const waits = [];
  return {
    apiPath: '/api/db',
    waitUntil(promise) {
      waits.push(promise);
    },
    async flush() {
      await Promise.all(waits.splice(0));
    },
  };
}

describe('FirestoreListenerWorkboxPlugin', () => {
  it('attaches a listener after request threshold is met', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 2,
      maxListeners: 5,
    });
    const handler = makeHandler();
    const request = new Request('http://localhost/api/db/users', { method: 'GET' });
    const response = new Response('[]', { status: 200 });

    await plugin.handlerDidRespond({ request, response, handler });
    await handler.flush();
    expect(Object.keys(plugin._listeners)).to.have.length(0);

    await plugin.handlerDidRespond({ request, response, handler });
    await handler.flush();

    expect(Object.keys(plugin._listeners)).to.have.length(1);
    const attached = messages.find((message) => message.type === 'firestore:listener-attached');
    expect(attached).to.exist;
    expect(attached.url).to.equal('/api/db/users');
  });

  it('detaches the oldest listener when maxListeners is exceeded', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 1,
      maxListeners: 1,
    });
    const handler = makeHandler();
    const response = new Response('[]', { status: 200 });

    await plugin.handlerDidRespond({
      request: new Request('http://localhost/api/db/users', { method: 'GET' }),
      response,
      handler,
    });
    await handler.flush();

    await plugin.handlerDidRespond({
      request: new Request('http://localhost/api/db/projects', { method: 'GET' }),
      response,
      handler,
    });
    await handler.flush();

    expect(Object.keys(plugin._listeners)).to.have.length(1);
    expect(plugin._listeners['/api/db/projects']).to.exist;

    const detached = messages.find((message) => message.type === 'firestore:listener-detached');
    expect(detached).to.exist;
    expect(detached.reason).to.equal('max-listeners');
    expect(detached.url).to.equal('/api/db/users');
  });

  it('broadcasts change notifications from active listeners', () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {});

    plugin._enqueueNotification(
      { path: '/api/db/users', listenKey: 'users', kind: 'collection' },
      {
        docChanges() {
          return [{ type: 'modified', doc: { data: () => ({ id: 'u1' }) } }];
        },
      },
    );
    plugin._notify();

    const changed = messages.find((message) => message.type === 'firestore:change');
    expect(changed).to.exist;
    expect(changed.events).to.deep.equal([
      { type: 'firestore:patch', url: '/api/db/users', data: { id: 'u1' } },
    ]);
  });

  it('reuses a broader listener when it is under the broad-doc limit', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 1,
      maxListeners: 5,
      broadQueryMaxDocs: 100,
    });
    const handler = makeHandler();
    const response = new Response('[]', { status: 200 });

    const broadRequest = new Request('http://localhost/api/db/users', { method: 'GET' });
    const narrowRequest = new Request('http://localhost/api/db/users?role=admin', {
      method: 'GET',
    });

    plugin.targetsByUrl.set(broadRequest.url, {
      listenKey: '/api/db/users',
      path: '/api/db/users',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', []),
      ref: { __count: 12 },
    });
    plugin.targetsByUrl.set(narrowRequest.url, {
      listenKey: '/api/db/users?role=admin',
      path: '/api/db/users?role=admin',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', [
        { field: 'role', operator: '==', value: 'admin' },
      ]),
      ref: { __count: 2 },
    });

    await plugin.handlerDidRespond({ request: broadRequest, response, handler });
    await handler.flush();
    expect(Object.keys(plugin._listeners)).to.deep.equal(['/api/db/users']);

    await plugin.handlerDidRespond({ request: narrowRequest, response, handler });
    await handler.flush();

    expect(Object.keys(plugin._listeners)).to.deep.equal(['/api/db/users']);
    const narrowMeta = await plugin._getMetadata('/api/db/users?role=admin');
    expect(narrowMeta.reusedBy).to.equal('/api/db/users');
  });

  it('does not reuse a broader listener when broad count exceeds the limit', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 1,
      maxListeners: 5,
      broadQueryMaxDocs: 10,
    });
    const handler = makeHandler();
    const response = new Response('[]', { status: 200 });

    const broadRequest = new Request('http://localhost/api/db/users', { method: 'GET' });
    const narrowRequest = new Request('http://localhost/api/db/users?role=admin', {
      method: 'GET',
    });

    plugin.targetsByUrl.set(broadRequest.url, {
      listenKey: '/api/db/users',
      path: '/api/db/users',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', []),
      ref: { __count: 250 },
    });
    plugin.targetsByUrl.set(narrowRequest.url, {
      listenKey: '/api/db/users?role=admin',
      path: '/api/db/users?role=admin',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', [
        { field: 'role', operator: '==', value: 'admin' },
      ]),
      ref: { __count: 2 },
    });

    await plugin.handlerDidRespond({ request: broadRequest, response, handler });
    await handler.flush();
    expect(Object.keys(plugin._listeners)).to.deep.equal(['/api/db/users']);

    await plugin.handlerDidRespond({ request: narrowRequest, response, handler });
    await handler.flush();

    expect(Object.keys(plugin._listeners)).to.have.members([
      '/api/db/users',
      '/api/db/users?role=admin',
    ]);
  });

  it('clears reusedBy metadata once a dedicated listener is attached', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 1,
      maxListeners: 5,
      broadQueryMaxDocs: 100,
    });
    const handler = makeHandler();
    const response = new Response('[]', { status: 200 });

    const broadRequest = new Request('http://localhost/api/db/users', { method: 'GET' });
    const narrowRequest = new Request('http://localhost/api/db/users?role=admin', {
      method: 'GET',
    });

    plugin.targetsByUrl.set(broadRequest.url, {
      listenKey: '/api/db/users',
      path: '/api/db/users',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', []),
      ref: { __count: 12 },
    });
    plugin.targetsByUrl.set(narrowRequest.url, {
      listenKey: '/api/db/users?role=admin',
      path: '/api/db/users?role=admin',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', [
        { field: 'role', operator: '==', value: 'admin' },
      ]),
      ref: { __count: 2 },
    });

    await plugin.handlerDidRespond({ request: broadRequest, response, handler });
    await handler.flush();
    await plugin.handlerDidRespond({ request: narrowRequest, response, handler });
    await handler.flush();

    let narrowMeta = await plugin._getMetadata('/api/db/users?role=admin');
    expect(narrowMeta.reusedBy).to.equal('/api/db/users');

    await plugin._detachListener('/api/db/users', 'test');
    await plugin.handlerDidRespond({ request: narrowRequest, response, handler });
    await handler.flush();

    narrowMeta = await plugin._getMetadata('/api/db/users?role=admin');
    expect(narrowMeta.attached).to.equal(true);
    expect(narrowMeta.reusedBy).to.equal(null);
    expect(narrowMeta.reusedAt).to.equal(null);
  });

  it('uses metadata broadness memo before issuing another count query', async () => {
    const messages = [];
    const plugin = new TestListenerPlugin(makeRuntime(messages), {
      minHits: 1,
      maxListeners: 5,
      broadQueryMaxDocs: 100,
      broadQueryMemoryMs: 60 * 1000,
    });
    const handler = makeHandler();
    const response = new Response('[]', { status: 200 });

    const broadRequest = new Request('http://localhost/api/db/users', { method: 'GET' });
    const narrowRequest = new Request('http://localhost/api/db/users?role=admin', {
      method: 'GET',
    });

    plugin.targetsByUrl.set(broadRequest.url, {
      listenKey: '/api/db/users',
      path: '/api/db/users',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', []),
      ref: { __count: 12 },
    });
    plugin.targetsByUrl.set(narrowRequest.url, {
      listenKey: '/api/db/users?role=admin',
      path: '/api/db/users?role=admin',
      kind: 'collection',
      descriptor: makeCollectionDescriptor('users', [
        { field: 'role', operator: '==', value: 'admin' },
      ]),
      ref: { __count: 2 },
    });

    await plugin.handlerDidRespond({ request: broadRequest, response, handler });
    await handler.flush();
    await plugin._mergeMetadata('/api/db/users', {
      attached: true,
      broadQueryDocCount: 12,
      broadQueryTooBroad: false,
      broadQueryCheckedAt: Date.now(),
    });

    plugin.countCalls = 0;

    await plugin.handlerDidRespond({ request: narrowRequest, response, handler });
    await handler.flush();

    expect(plugin.countCalls).to.equal(0);
    expect(Object.keys(plugin._listeners)).to.deep.equal(['/api/db/users']);
  });
});
