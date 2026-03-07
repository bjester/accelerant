import {
  collection, collectionGroup, deleteDoc,
  doc,
  getDoc, getDocs,
  limit,
  orderBy, query, setDoc,
  startAfter,
  startAt,
  where
} from "firebase/firestore";
import {v4 as uuid} from "uuid";
import {
  BadRequestError,
  NotFoundError
} from '../../errors.js';
import StrategyHandler from "./index.js";


const CACHE_NAME = 'firestore';

const LIMIT = 'limit';
const ORDER_BY = 'orderBy';
const AFTER = 'after';
const AT = 'at';
const RESERVED_KEYS = [LIMIT, ORDER_BY, AFTER, AT];

const IN = 'in';
const NOT_IN = 'not_in';
const HAS_ANY = 'has_any';
const ARRAY_OPERATORS = ['in', 'not-in', 'array-contains-any'];

const SuffixToOperator = {
  '': '==' ,
  'gt': '>' ,
  'gte': '>=' ,
  'lt': '<' ,
  'lte': '<=' ,
  [IN]: 'in' ,
  [NOT_IN]: 'not-in' ,
  'has': 'array-contains' ,
  [HAS_ANY]: 'array-contains-any' ,
};

/**
 * @param {RequestContext} context
 * @return {[Firestore.QueryFieldFilterConstraint|Firestore.QueryConstraint]}
 */
function _parseWhereClauses(context) {
  const q = [];

  for (let [key, value] of context.paramEntries()) {
    if (RESERVED_KEYS.includes(key)) {
      continue;
    }
    key = key.split('__');
    if (key.length > 2) {
      throw new BadRequestError('invalid query string');
    }
    const [field, suffix= ''] = key;
    const operator = SuffixToOperator[suffix];
    if (!operator) {
      throw new BadRequestError('invalid query string');
    }
    if (!ARRAY_OPERATORS.includes(operator)) {
      value = value[0];
      if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (value === 'null') {
        value = null;
      } else if (value === 'undefined') {
        continue;
      }
    }
    q.push(where(field, operator, value));
  }

  return q;
}

/**
 *
 * @param {function(snapshot:DocumentSnapshot):QueryStartAtConstraint|function(...fieldValues: string[]):QueryStartAtConstraint} start
 * @param {string[]} value
 * @param {Firestore.CollectionReference|Firestore.Reference} ref
 * @return {Promise<QueryStartAtConstraint>}
 */
async function _prepareStartValue(start, value, ref) {
  // Assume if one value is passed, it's a document id
  if (value.length === 1) {
    const snapshot = await getDoc(doc(ref, value[0]));
    return start(snapshot);
  }
  // otherwise vales of fields ordered By
  return start(...value);
}

/**
 * Supports:
 * - limit=10
 * - orderBy=field
 * - orderBy=field&orderBy=field2
 * - orderBy[]=field&orderBy[]=field2
 * - orderBy=asc:field
 * - orderBy=desc:field
 * - orderBy=asc:field&orderBy=desc:field2
 * - orderBy[]=asc:field&orderBy[]=desc:field2
 * - after=field
 * - after=field&after=field2
 * - after[]=field&after[]=field2
 * - at=field
 * - at=field&at=field2
 * - at[]=field&at[]=field2
 *
 * @param {RequestContext} context
 * @param {Firestore.Reference} ref
 * @return {Promise<[Firestore.QueryConstraint]>}
 */
async function _prepareExtra(context, ref) {
  let extra = [];

  for (let [key, value] of context.paramEntries()) {
    if (!RESERVED_KEYS.includes(key)) {
      continue;
    }

    switch (key) {
      case ORDER_BY:
        extra.push(...value.map(field => {
          // asc:field -> field:asc
          const [f, direction = 'asc'] = field.split(':').reverse();
          return orderBy(f, direction || 'asc');
        }));
        break;
      case LIMIT:
        const _limit = parseInt(value[0], 10);
        if (isNaN(_limit)) {
          throw new BadRequestError('invalid query string: limit');
        } else if (_limit > 100) {
          throw new BadRequestError('query string to large: limit');
        }
        extra.push(limit(_limit));
        break;
      case AFTER:
        extra.push(await _prepareStartValue(startAfter, value, ref));
        break;
      case AT:
        extra.push(await _prepareStartValue(startAt, value, ref));
        break;
    }
  }

  return extra;
}

/**
 * @param {Firestore} firestore
 * @param {RequestContext} context
 * @return {Promise<DocumentSnapshot<DocumentData>|QueryDocumentSnapshot<DocumentData>>}
 */
async function getDocSnapshot(firestore, context) {
  const path = context.pathSplit;
  const [docId, ...collectionPath] = path.reverse();
  const collectionRef = collection(firestore, ...collectionPath.reverse());

  const whereClauses = _parseWhereClauses(context);
  const extra = await _prepareExtra(context, collectionRef);

  if (whereClauses.length || extra.length) {
    whereClauses.push(where('id', '==', docId));
    const q = query(
      collectionRef,
      ...whereClauses,
      ...extra
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0];
    }
  } else {
    const _doc = await getDoc(doc(collectionRef, docId));
    if (_doc.exists()) {
      return _doc;
    }
  }
  throw new NotFoundError('document does not exist');
}

/**
 * @param {Firestore} firestore
 * @param {RequestContext} context
 * @return {Query<DocumentData>}
 * @private
 */
function _getCollectionGroupRef(firestore, context) {
  const group = context.pathSplit.pop().replace(/\.group$/, '');
  return collectionGroup(firestore, group);
}

/**
 * @param {Firestore} firestore
 * @param {RequestContext} context
 * @return {CollectionReference<DocumentData>}
 * @private
 */
function _getCollectionRef(firestore, context) {
  const path = context.pathSplit;
  return collection(firestore, ...path);
}


export class FirestorePath {
  /**
   * @param {Request} request
   * @param {string} apiPath
   */
  constructor(request, apiPath) {
    this.request = request;
    this.url = new URL(request.url);
    this._apiPath = apiPath;
  }

  /**
   * @return {string}
   */
  get pathname() {
    return this.url.pathname;
  }

  /**
   * @return {string}
   */
  get relativePath() {
    return this.pathname.replace(this._apiPath, '');
  }

  /**
   * @return {string[]}
   */
  get pathSplit() {
    return this.relativePath.split('/').filter(Boolean);
  }

  /**
   * @return {boolean}
   */
  get isDocumentPath() {
    return this.pathSplit.length % 2 === 0;
  }

  /**
   * @return {boolean}
   */
  get isCollectionGroupPath() {
    return this.pathname.endsWith('.group');
  }

  /**
   * @return {boolean}
   */
  get isCollectionPath() {
    return !this.isDocumentPath && !this.isCollectionGroupPath;
  }

  /**
   * @return {boolean}
   */
  get isSubCollectionPath() {
    return this.isCollectionPath && this.pathSplit.length > 2;
  }

  /**
   * @return {string}
   */
  getCollectionPath() {
    if (this.isCollectionPath) {
      return this.relativePath;
    }

    if (this.isCollectionGroupPath) {
      return this.relativePath.replace(/\.group$/, '');
    }

    return this.relativePath.replace(/\/[^\/]+$/, '');
  }

  /**
   * @return {FirestorePath}
   */
  getFirestoreCollectionGroupPath() {
    const collectionName = this.pathSplit.pop();
    return new FirestorePath(new Request(this.url.origin + `/${this._apiPath}/${collectionName}.group`), this._apiPath);
  }
}


class FirestoreStrategyHandler extends StrategyHandler {
  /**
   * @return {string}
   */
  static get cacheName() {
    return CACHE_NAME;
  }

  get firestore() {
    return this.runtime.firebase.firestore;
  }
}


/**
 * Handler strategy for reading Firestore documents via HEAD.
 */
export class HeadStrategyHandler extends FirestoreStrategyHandler {
  get allowedMethods() { return ['HEAD']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const path = context.pathSplit;

    if (path.length % 2 === 0) {
      await getDocSnapshot(this.firestore, context);
      return new Response('', {status: 204});
    } else if (!/\.group$/.test(context.path)) {
      const collectionRef = _getCollectionRef(this.firestore, context);
      const snapshot = await getDoc(collectionRef.parent);
      if (snapshot.exists()) {
        return this.runtime.response.json.noContent();
      }
    }

    return this.runtime.response.json.notFound();
  }
}

/**
 * Handler strategy for reading Firestore documents via GET.
 */
export class GetStrategyHandler extends FirestoreStrategyHandler {
  get allowedMethods() { return ['GET']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const path = context.pathSplit;
    if (path.length % 2 === 0) {
      return this._handleDoc(context, request);
    } else if (/\.group$/.test(context.path)) {
      return this._handleCollectionGroup(context, request);
    } else {
      return this._handleCollection(context, request);
    }
  }

  /**
   * @param {RequestContext} context
   * @param {Request} request
   * @return {Promise<Response>}
   * @private
   */
  async _handleDoc(context, request) {
    const snapshot = await getDocSnapshot(this.firestore, context);
    const data = {
      id: snapshot.id,
      ...snapshot.data()
    };

    return this.runtime.response.json.ok(data);
  }

  /**
   * @param {RequestContext} context
   * @param {Request} request
   * @return {Promise<Response>}
   * @private
   */
  async _handleCollection(context, request) {
      const collectionRef = _getCollectionRef(this.firestore, context);

      const whereClauses = _parseWhereClauses(context);
      const extra = await _prepareExtra(context, collectionRef);

    const queryRef = query(
      collectionRef,
      ...whereClauses,
      ...extra
    );

    const snapshot = await getDocs(queryRef);
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return this.runtime.response.json.ok(data);
  }

  /**
   * @param {RequestContext} context
   * @param {Request} request
   * @return {Promise<Response>}
   * @private
   */
  async _handleCollectionGroup(context, request) {
      const collectionRef = _getCollectionGroupRef(this.firestore, context);

      const whereClauses = _parseWhereClauses(context);
      const extra = await _prepareExtra(context, collectionRef);

    const queryRef = query(
      collectionRef,
      ...whereClauses,
      ...extra
    );

    const snapshot = await getDocs(queryRef);
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return this.runtime.response.json.ok(data);
  }

  // /**
  //  * @param {string} name
  //  * @param {AlterIndex} alter
  //  * @param {Request} request
  //  * @param {Response} response
  //  * @return {Promise<AlterIndex>}
  //  */
  // async prepareAlterIndex(name, alter, request, response) {
  //   if (response.ok) {
  //     const context = this._getContext(request);
  //     // Add pathname (omitting search params) so we map pathname to URLs (with search params)
  //     alter.add(context.pathname);
  //   }
  //
  //   return alter;
  // }
}

/**
 * Handler strategy for updating Firestore documents.
 */
export class UpdateStrategyHandler extends FirestoreStrategyHandler {
  /**
   * @param {RequestContext} context
   * @return {Promise<DocumentReference<DocumentData, DocumentData>>}
   * @protected
   */
  async _getRef(context) {
    const path = context.pathSplit;

    if (path.length % 2 === 0) {
      const [docId, ...collectionPath] = path.reverse();
      return doc(collection(this.firestore, ...collectionPath.reverse()), docId);
    }

    return doc(collection(this.firestore, ...path), uuid());
  }

  /**
   * @param {RequestContext} context
   * @param {Firestore.DocumentReference} ref
   * @param {Object} options
   * @return {Promise<{}>}
   * @protected
   */
  async _updateRef(context, ref, options = {}) {
    const body = await context.json();
    let {id, ...data} = body;
    if (!id) {
      id = ref.id;
    }

    if (id !== ref.id) {
      throw new BadRequestError('id mismatch');
    }

    // Fixed: Spread data instead of nesting under {id, data}
    await setDoc(ref, {id, ...data}, options);
    return {id, ...data};
  }
}

/**
 * Handler strategy for updating Firestore documents via POST.
 */
export class PostStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() { return ['POST']; }

  /**
   * @param {Request} request
   * @param {Response} response
   */
  async cachePut(request, response) {
    const cacheKey = response.headers.get('X-Cache-Key');
    if (!cacheKey) {
      return super.cachePut(request, response);
    }
    return super.cachePut(new Request(`${self.location.origin}${cacheKey}`), response);
  }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const ref = await this._getRef(context);
    const snapshot = await getDoc(ref);
    const existed = snapshot.exists();
    const data = await this._updateRef(context, ref, {merge: true});

    const opts = {
      headers: {
        'X-Cache-Key': `${this.apiPath}/${ref.path}`,
      }
    };

    if (!existed) {
      return this.runtime.response.json.created(data, opts);
    }

    const updated = await getDoc(ref);
    return this.runtime.response.json.ok({ id: updated.id, ...updated.data() }, opts);
  }
}

/**
 * Handler strategy for updating Firestore documents via PUT.
 */
export class PutStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() { return ['PUT']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const ref = await this._getRef(context);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
      return this.runtime.response.json.conflict('document already exists');
    }
    const data = await this._updateRef(context, ref, {merge: false});

    return this.runtime.response.json.created(data);
  }
}

/**
 * Handler strategy for updating Firestore documents via PATCH.
 */
export class PatchStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() { return ['PATCH']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const ref = await this._getRef(context);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return this.runtime.response.json.notFound('document does not exist');
    }

    await this._updateRef(context, ref, {merge: true});
    const updated = await getDoc(ref);

    return this.runtime.response.json.ok({ id: updated.id, ...updated.data() });
  }
}

/**
 * Handler strategy for updating Firestore documents via DELETE.
 */
export class DeleteStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() { return ['DELETE']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    if (context.params.size > 0) {
      return this.runtime.response.json.badRequest('query string not allowed');
    }
    // Cannot delete a collection
    if (context.pathSplit.length % 2 === 1) {
      return this.runtime.response.json.methodNotAllowed('cannot delete a collection');
    }

    const ref = await this._getRef(context);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return this.runtime.response.json.notFound('document does not exist');
    }

    await deleteDoc(ref);
    return this.runtime.response.json.noContent();
  }

  /**
   * @param {string} name
   * @param {AlterIndex} alter
   * @param {Request} request
   * @param {Response} response
   * @return {Promise<AlterIndex>}
   */
  async prepareAlterIndex(name, alter, request, response) {
    if (name === 'firestore.ids' && response.ok) {
      const ref = await this._getRef(this._getContext(request));
      alter.remove(ref.id);
    }

    if (name === 'firestore.urls' && response.ok) {
      alter.remove(request.url);
    }

    return alter;
  }
}