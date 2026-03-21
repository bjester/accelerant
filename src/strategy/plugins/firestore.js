import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
} from 'firebase/firestore';
import FirestoreRequestDescriptor, {
  buildQueryConstraints,
  KIND_COLLECTION,
  KIND_COLLECTION_GROUP,
  KIND_DOCUMENT,
} from '../../request/firestore.js';
import RequestContext from '../../request/index.js';
import PrefixIndex from '../../storage/lookup.js';
import WorkboxPlugin from './index.js';

const DEFAULT_MAX_LISTENERS = 25;
const DEFAULT_MAX_EVENTS_PER_MESSAGE = 20;
const DEFAULT_EVENT_NAMESPACE = 'firestore';
const DEFAULT_MIN_HITS = 3;
const DEFAULT_HIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_LISTENER_IDLE_MS = 10 * 60 * 1000;
const DEFAULT_API_PATH = '/api/db';
const DEFAULT_BROAD_QUERY_MAX_DOCS = 100;
const DEFAULT_BROAD_QUERY_MEMORY_MS = 10 * 60 * 1000;

export class FirestoreListenerWorkboxPlugin extends WorkboxPlugin {
  /**
   * @param {WorkerRuntime} runtime
   * @param {object} [options]
   */
  constructor(runtime, options = {}) {
    super(runtime, options);

    this._listeners = {};
    /** @type {PrefixIndex} */
    this._metaIndex = null;
    this._queue = [];
    this._queueTimer = null;
  }

  /**
   * @return {string}
   */
  get name() {
    return this.options.name || 'firestore-listener';
  }

  /**
   * @return {number}
   */
  get maxListeners() {
    return this.options.maxListeners || DEFAULT_MAX_LISTENERS;
  }

  get minHits() {
    return this.options.minHits || DEFAULT_MIN_HITS;
  }

  get hitWindowMs() {
    return this.options.hitWindowMs || DEFAULT_HIT_WINDOW_MS;
  }

  get listenerIdleMs() {
    return this.options.listenerIdleMs || DEFAULT_LISTENER_IDLE_MS;
  }

  get maxEventsPerMessage() {
    return this.options.maxEventsPerMessage || DEFAULT_MAX_EVENTS_PER_MESSAGE;
  }

  get eventNamespace() {
    return this.options.eventNamespace || DEFAULT_EVENT_NAMESPACE;
  }

  get broadQueryMaxDocs() {
    return this.options.broadQueryMaxDocs || DEFAULT_BROAD_QUERY_MAX_DOCS;
  }

  get broadQueryMemoryMs() {
    return this.options.broadQueryMemoryMs || DEFAULT_BROAD_QUERY_MEMORY_MS;
  }

  get broadcastChannel() {
    return this.options.broadcastChannel || this.runtime.broadcastChannel;
  }

  /**
   * @return {Promise<PrefixIndex>}
   * @private
   */
  async _getMetadataIndex() {
    if (!this._metaIndex) {
      this._metaIndex = await PrefixIndex.getInstance(`${this.name}-${this.runtime.version}`, -1);
    }
    return this._metaIndex;
  }

  /**
   * @return {Promise<void>}
   * @private
   */
  async _syncMetadataIndex() {
    if (this._metaIndex) {
      await this._metaIndex.sync();
    }
  }

  /**
   * @param {string} key
   * @return {Promise<object|null>}
   * @private
   */
  async _getMetadata(key) {
    const index = await this._getMetadataIndex();
    const values = await index.get(key);
    return values.values().next().value;
  }

  /**
   * @param {string} key
   * @param {(current: object|null) => (object|null|Promise<object|null>)} updater
   * @return {Promise<void>}
   * @private
   */
  async _updateMetadata(key, updater) {
    const index = await this._getMetadataIndex();
    await index.update(key, async (values) => {
      // PrefixIndex stores values as an array-like set; this plugin keeps one metadata object per key.
      const current = values.size > 0 ? values.values().next().value : null;
      const next = await updater(current);
      if (!next) {
        return null;
      }
      return new Set([next]);
    });
  }

  /**
   * @param {string} key
   * @param {object} patch
   * @return {Promise<object>}
   * @private
   */
  async _mergeMetadata(key, patch) {
    let merged = null;
    await this._updateMetadata(key, (current) => {
      merged = {
        ...(current || {}),
        ...patch,
      };
      return merged;
    });
    return merged;
  }

  /**
   * @param {object} payload
   * @private
   */
  _broadcast(payload) {
    if (!this.broadcastChannel) {
      return;
    }
    this.broadcastChannel.postMessage({
      ...payload,
      updatedAt: Date.now(),
    });
  }

  /**
   * @param {Request} request
   * @param {StrategyHandler} handler
   * @return {{descriptor: FirestoreRequestDescriptor, apiPath: string}}
   * @private
   */
  _getDescriptor(request, handler) {
    const apiPath = handler?.apiPath || this.options.apiPath || DEFAULT_API_PATH;
    const context = new RequestContext(request.clone(), { pathPrefix: apiPath });
    return {
      descriptor: FirestoreRequestDescriptor.fromContext(context),
      apiPath,
    };
  }

  /**
   * @param {Request} request
   * @param {StrategyHandler} handler
   * @return {Promise<{listenKey:string, descriptor:FirestoreRequestDescriptor, path:string, kind:string, ref:Firestore.DocumentReference|Firestore.Query}|null>}
   * @private
   */
  async _buildListenerTarget(request, handler) {
    if (request.method !== 'GET') {
      return null;
    }

    const firestore = this.runtime?.firebase?.firestore;
    if (!firestore) {
      return null;
    }

    const { descriptor, apiPath } = this._getDescriptor(request, handler);
    const listenKey = descriptor.toStandardizedURI(apiPath);
    const path = listenKey;

    if (descriptor.isDocumentPath) {
      const collectionRef = collection(firestore, ...descriptor.collectionPathSplit);
      return {
        listenKey,
        descriptor,
        path,
        kind: KIND_DOCUMENT,
        ref: doc(collectionRef, descriptor.docId),
      };
    }

    const collectionRef = descriptor.isCollectionGroupPath
      ? collectionGroup(firestore, descriptor.groupName)
      : collection(firestore, ...descriptor.collectionPathSplit);

    const constraints = await buildQueryConstraints(descriptor, collectionRef);
    return {
      listenKey,
      descriptor,
      path,
      kind: descriptor.isCollectionGroupPath ? KIND_COLLECTION_GROUP : KIND_COLLECTION,
      ref: query(collectionRef, ...constraints),
      apiPath,
    };
  }

  /**
   * @param {object} target
   * @return {Promise<function|null>}
   * @private
   */
  async _attachListener(target) {
    try {
      return onSnapshot(
        target.ref,
        (snapshot) => this._enqueueNotification(target, snapshot),
        (error) => this._notifyListenerError(target, error),
      );
    } catch (error) {
      this._notifyListenerError(target, error);
      return null;
    }
  }

  /**
   * @param {Firestore.Query} ref
   * @return {Promise<number>}
   * @private
   */
  async _countQueryResults(ref) {
    const snapshot = await getCountFromServer(ref);
    return snapshot?.data?.().count || 0;
  }

  /**
   * @param {FirestoreRequestDescriptor} descriptor
   * @return {string[]}
   * @private
   */
  _descriptorFilters(descriptor) {
    return [...(descriptor?.filters || [])]
      .map((filter) => {
        const value = Array.isArray(filter.value) ? [...filter.value].sort() : filter.value;
        return JSON.stringify({
          field: filter.field,
          operator: filter.operator,
          value,
        });
      })
      .sort();
  }

  /**
   * @param {FirestoreRequestDescriptor} broader
   * @param {FirestoreRequestDescriptor} target
   * @return {boolean}
   * @private
   */
  _coversWithBroaderQuery(broader, target) {
    if (!broader || !target) {
      return false;
    }
    if (broader.kind !== target.kind) {
      return false;
    }
    if (broader.kind === KIND_DOCUMENT) {
      return false;
    }
    if (broader.collectionPath !== target.collectionPath) {
      return false;
    }
    if ((broader.groupName || null) !== (target.groupName || null)) {
      return false;
    }
    // Reusing from a limited/ordered/cursor query is unsafe because it may not represent the
    // full superset needed to derive changes for a narrower query.
    if ((broader.limit ?? null) !== null) {
      return false;
    }
    if ((broader.cursors || []).length > 0) {
      return false;
    }
    if ((broader.orderBy || []).length > 0) {
      return false;
    }

    const broaderFilters = this._descriptorFilters(broader);
    const targetFilters = new Set(this._descriptorFilters(target));
    return broaderFilters.every((filter) => targetFilters.has(filter));
  }

  /**
   * @param {FirestoreRequestDescriptor} broader
   * @param {FirestoreRequestDescriptor} target
   * @return {boolean}
   * @private
   */
  _isBroaderQuery(broader, target) {
    const broaderFilters = this._descriptorFilters(broader);
    const targetFilters = this._descriptorFilters(target);
    return broaderFilters.length < targetFilters.length;
  }

  _isBroadAssessmentFresh(metadata) {
    if (!metadata?.broadQueryCheckedAt) {
      return false;
    }
    return Date.now() - metadata.broadQueryCheckedAt <= this.broadQueryMemoryMs;
  }

  /**
   * @param {string} key
   * @param {Firestore.Query} ref
   * @param {object} [metadata]
   * @return {Promise<boolean>}
   * @private
   */
  async _isTooBroadQuery(key, ref, metadata = null) {
    if (this.broadQueryMaxDocs <= 0) {
      return false;
    }

    const existing = metadata || (await this._getMetadata(key)) || {};
    if (
      this._isBroadAssessmentFresh(existing) &&
      typeof existing.broadQueryTooBroad === 'boolean'
    ) {
      return existing.broadQueryTooBroad;
    }

    let count = 0;
    try {
      count = await this._countQueryResults(ref);
    } catch (_e) {
      // Fail safe: if count cannot be determined, treat candidate as too broad so we avoid
      // accidentally relying on an unbounded listener for dedupe.
      count = this.broadQueryMaxDocs + 1;
    }

    const checkedAt = Date.now();
    const tooBroad = count > this.broadQueryMaxDocs;
    const updatedMetadata = {
      ...existing,
      broadQueryDocCount: count,
      broadQueryTooBroad: tooBroad,
      broadQueryCheckedAt: checkedAt,
    };
    await this._updateMetadata(key, (current) => ({
      ...(current || {}),
      ...updatedMetadata,
    }));
    if (this._listeners[key]) {
      this._listeners[key].metadata = updatedMetadata;
    }
    return tooBroad;
  }

  /**
   * @param {object} target
   * @return {Promise<string|null>}
   * @private
   */
  async _findReusableBroaderListener(target) {
    if (!target?.descriptor || target.kind === KIND_DOCUMENT) {
      return null;
    }

    const entries = Object.entries(this._listeners);
    for (const [key, listener] of entries) {
      if (!listener?.descriptor || !listener?.ref) {
        continue;
      }
      const metadata = (await this._getMetadata(key)) || listener.metadata || {};
      if (typeof metadata.attached === 'boolean' && !metadata.attached) {
        continue;
      }
      if (!this._coversWithBroaderQuery(listener.descriptor, target.descriptor)) {
        continue;
      }
      if (!this._isBroaderQuery(listener.descriptor, target.descriptor)) {
        continue;
      }

      const tooBroad = await this._isTooBroadQuery(key, listener.ref, metadata);
      if (tooBroad) {
        continue;
      }

      return key;
    }

    return null;
  }

  /**
   * Schedules the timer to send the message to the clients.
   * @private
   */
  _enqueue() {
    if (this._queueTimer) {
      clearTimeout(this._queueTimer);
    }
    this._queueTimer = setTimeout(() => {
      this._notify();
      this._queueTimer = null;
      if (this._queue.length > 0) {
        this._enqueue();
      }
    });
  }

  /**
   * @param {object} target
   * @param {Firestore.DocumentSnapshot|Firestore.QuerySnapshot} snapshot
   * @private
   */
  _enqueueNotification(target, snapshot) {
    const events = [];

    if (target.kind === KIND_DOCUMENT) {
      events.push({
        type: `${this.eventNamespace}:${snapshot.exists() ? 'patch' : 'delete'}`,
        url: target.path,
        data: snapshot.exists() ? snapshot.data() : null,
      });
    } else {
      snapshot.docChanges().forEach((change) => {
        let type;
        switch (change.type) {
          case 'added':
            type = 'put';
            break;
          case 'modified':
            type = 'patch';
            break;
          case 'removed':
            type = 'delete';
            break;
          default:
            type = change.type;
        }

        events.push({
          type: `${this.eventNamespace}:${type}`,
          url: target.path,
          data: change.doc.data(),
        });
      });
    }

    this._queue.push(...events);
    this._enqueue();
  }

  /**
   * @param {object} target
   * @param {Error} error
   * @private
   */
  _notifyListenerError(target, error) {
    this._broadcast({
      type: `${this.eventNamespace}:listener-error`,
      url: target.path,
      message: error?.message || 'unknown listener error',
    });
  }

  /**
   * @private
   */
  _notify() {
    const events = this._queue.slice(0, this.maxEventsPerMessage);
    if (events.length === 0) {
      return;
    }
    this._queue = this._queue.slice(this.maxEventsPerMessage);
    this._broadcast({
      type: `${this.eventNamespace}:change`,
      events,
    });
  }

  /**
   * @param {string} key
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async _detachListener(key, reason = 'unknown') {
    const listener = this._listeners[key];
    if (!listener) {
      return;
    }

    try {
      listener.unsubscribe();
    } catch (_e) {
      // no-op
    }

    delete this._listeners[key];

    await this._mergeMetadata(key, {
      ...listener.metadata,
      attached: false,
      detachedAt: Date.now(),
      detachReason: reason,
    });

    this._broadcast({
      type: `${this.eventNamespace}:listener-detached`,
      url: listener.path,
      listenerKey: key,
      listenerKind: listener.kind,
      reason,
    });
  }

  /**
   * @return {Promise<void>}
   * @private
   */
  async _pruneListeners() {
    const now = Date.now();
    const entries = Object.entries(this._listeners);

    for (const [key, listener] of entries) {
      if (now - (listener.metadata?.lastSeenAt || 0) > this.listenerIdleMs) {
        await this._detachListener(key, 'idle');
      }
    }
  }

  /**
   * @return {Promise<void>}
   * @private
   */
  async _enforceMaxListeners() {
    const keys = Object.keys(this._listeners);
    if (keys.length < this.maxListeners) {
      return;
    }

    let oldest = null;
    for (const key of keys) {
      const candidate = this._listeners[key];
      const seenAt = candidate?.metadata?.lastSeenAt || 0;
      if (!oldest || seenAt < oldest.seenAt) {
        oldest = { key, seenAt };
      }
    }

    if (oldest) {
      await this._detachListener(oldest.key, 'max-listeners');
    }
  }

  /**
   * @param {object} target
   * @param {object} metadata
   * @return {Promise<void>}
   * @private
   */
  async _attachFrequentListener(target, metadata) {
    await this._enforceMaxListeners();

    const unsubscribe = await this._attachListener(target);
    if (!unsubscribe) {
      return;
    }

    const updatedMetadata = {
      ...metadata,
      attached: true,
      lastAttachedAt: Date.now(),
      reusedBy: null,
      reusedAt: null,
    };

    this._listeners[target.listenKey] = {
      unsubscribe,
      path: target.path,
      kind: target.kind,
      ref: target.ref,
      descriptor: target.descriptor,
      metadata: updatedMetadata,
    };

    await this._mergeMetadata(target.listenKey, updatedMetadata);

    this._broadcast({
      type: `${this.eventNamespace}:listener-attached`,
      url: target.path,
      listenerKey: target.listenKey,
      listenerKind: target.kind,
      hits: updatedMetadata.hits || 0,
    });
  }

  /**
   * @param {object} target
   * @return {Promise<void>}
   * @private
   */
  async _recordRequest(target) {
    const now = Date.now();
    const existing = (await this._getMetadata(target.listenKey)) || {};
    const withinWindow = existing.lastSeenAt && now - existing.lastSeenAt <= this.hitWindowMs;
    const hits = withinWindow ? (existing.hits || 0) + 1 : 1;

    const metadata = {
      ...existing,
      path: target.path,
      kind: target.kind,
      listenKey: target.listenKey,
      hits,
      lastSeenAt: now,
      attached: !!this._listeners[target.listenKey],
    };

    await this._mergeMetadata(target.listenKey, metadata);

    if (!metadata.attached && hits >= this.minHits) {
      const reusedBy = await this._findReusableBroaderListener(target);
      if (reusedBy) {
        await this._mergeMetadata(target.listenKey, {
          ...metadata,
          attached: false,
          reusedBy,
          reusedAt: now,
        });
        return;
      }
      await this._attachFrequentListener(target, metadata);
      return;
    }

    if (metadata.attached && this._listeners[target.listenKey]) {
      this._listeners[target.listenKey].metadata = metadata;
    }
  }

  /**
   * @param {Object} options
   * @param {Request} request
   * @param {Response} response
   * @param {StrategyHandler} handler
   * @return {Promise<Response>}
   */
  async handlerDidRespond({ request, response, handler }) {
    if (!response || !response.ok || request.method !== 'GET' || !handler) {
      return response;
    }

    const run = (async () => {
      const target = await this._buildListenerTarget(request, handler);
      if (!target) {
        return;
      }

      await this._recordRequest(target);
      await this._pruneListeners();
      await this._syncMetadataIndex();
    })();

    // Do not await
    handler.waitUntil(run);
  }
}
