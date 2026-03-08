import {
  doc,
  getDoc,
  limit,
  orderBy,
  startAfter,
  startAt,
  where
} from 'firebase/firestore';
import { BadRequestError } from '../errors.js';
import RequestContext from './index.js';

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
  '': '==',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  [IN]: 'in',
  [NOT_IN]: 'not-in',
  has: 'array-contains',
  [HAS_ANY]: 'array-contains-any',
};

/**
 * @typedef {'doc' | 'collection' | 'collectionGroup'} FirestoreRequestKind
 */

/**
 * @typedef {{field: string, operator: Firestore.WhereFilterOp, value: unknown}} FirestoreFilterDescriptor
 */

/**
 * @typedef {{field: string, direction: Firestore.OrderByDirection}} FirestoreOrderByDescriptor
 */

/**
 * @typedef {{type: 'startAt' | 'startAfter', values: string[]}} FirestoreCursorDescriptor
 */

/**
 * Canonical representation of a Firestore request.
 */
export default class FirestoreRequestDescriptor {
  /**
   * @param {Object} data
   * @param {RequestContext} data.context
   * @param {FirestoreRequestKind} data.kind
   * @param {string[]} data.pathSplit
   * @param {string} data.collectionPath
   * @param {string|null} data.docId
   * @param {string|null} data.groupName
   * @param {FirestoreFilterDescriptor[]} data.filters
   * @param {FirestoreOrderByDescriptor[]} data.orderBy
   * @param {FirestoreCursorDescriptor[]} data.cursors
   * @param {number|null} data.limit
   */
  constructor(data) {
    this.context = data.context;
    this.kind = data.kind;
    this.pathSplit = data.pathSplit;
    this.collectionPath = data.collectionPath;
    this.docId = data.docId;
    this.groupName = data.groupName;
    this.filters = data.filters;
    this.orderBy = data.orderBy;
    this.cursors = data.cursors;
    this.limit = data.limit;
  }

  /**
   * @param {RequestContext} context
   * @return {FirestoreRequestDescriptor}
   */
  static fromContext(context) {
    const pathSplit = [...context.pathSplit];
    const isCollectionGroupPath = context.path.endsWith('.group');

    /** @type {FirestoreRequestKind} */
    let kind = 'collection';
    let collectionPath = '';
    let docId = null;
    let groupName = null;

    if (isCollectionGroupPath) {
      kind = 'collectionGroup';
      groupName = pathSplit[pathSplit.length - 1]?.replace(/\.group$/, '') || null;
      collectionPath = (context.path || '').replace(/^\/+/, '').replace(/\.group$/, '');
    } else if (pathSplit.length % 2 === 0) {
      kind = 'doc';
      docId = pathSplit[pathSplit.length - 1] || null;
      collectionPath = pathSplit.slice(0, -1).join('/');
    } else {
      kind = 'collection';
      collectionPath = pathSplit.join('/');
    }

    /** @type {FirestoreFilterDescriptor[]} */
    const filters = [];
    /** @type {FirestoreOrderByDescriptor[]} */
    const orderByFields = [];
    /** @type {FirestoreCursorDescriptor[]} */
    const cursors = [];
    let _limit = null;

    for (let [key, values] of context.paramEntries()) {
      if (!RESERVED_KEYS.includes(key)) {
        const parts = key.split('__');
        if (parts.length > 2) {
          throw new BadRequestError('invalid query string');
        }
        const [field, suffix = ''] = parts;
        const operator = SuffixToOperator[suffix];
        if (!operator) {
          throw new BadRequestError('invalid query string');
        }

        /** @type {unknown} */
        let value = values;
        if (!ARRAY_OPERATORS.includes(operator)) {
          value = values[0];
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

        filters.push({ field, operator, value });
        continue;
      }

      switch (key) {
        case ORDER_BY:
          orderByFields.push(...values.map((entry) => {
            const [field, direction = 'asc'] = entry.split(':').reverse();
            return {
              field,
              direction: /** @type {Firestore.OrderByDirection} */ (direction || 'asc'),
            };
          }));
          break;
        case LIMIT: {
          const parsedLimit = parseInt(values[0], 10);
          if (Number.isNaN(parsedLimit)) {
            throw new BadRequestError('invalid query string: limit');
          }
          if (parsedLimit > 100) {
            throw new BadRequestError('query string to large: limit');
          }
          _limit = parsedLimit;
          break;
        }
        case AFTER:
          cursors.push({ type: 'startAfter', values: [...values] });
          break;
        case AT:
          cursors.push({ type: 'startAt', values: [...values] });
          break;
      }
    }

    return new FirestoreRequestDescriptor({
      context,
      kind,
      pathSplit,
      collectionPath,
      docId,
      groupName,
      filters,
      orderBy: orderByFields,
      cursors,
      limit: _limit,
    });
  }

  /**
   * @return {boolean}
   */
  get isDocumentPath() {
    return this.kind === 'doc';
  }

  /**
   * @return {boolean}
   */
  get isCollectionPath() {
    return this.kind === 'collection';
  }

  /**
   * @return {boolean}
   */
  get isCollectionGroupPath() {
    return this.kind === 'collectionGroup';
  }

  /**
   * @return {boolean}
   */
  get isSubCollectionPath() {
    return this.isCollectionPath && this.pathSplit.length > 2;
  }

  /**
   * @return {string[]}
   */
  get collectionPathSplit() {
    return this.collectionPath.split('/').filter(Boolean);
  }

  /**
   * @return {string}
   */
  getCollectionPath() {
    return this.collectionPath;
  }

  /**
   * @return {string}
   */
  toKey() {
    const normalized = {
      kind: this.kind,
      collectionPath: this.collectionPath,
      docId: this.docId,
      groupName: this.groupName,
      filters: [...this.filters]
        .sort((a, b) => `${a.field}:${a.operator}`.localeCompare(`${b.field}:${b.operator}`))
        .map((item) => ({ field: item.field, operator: item.operator, value: item.value })),
      orderBy: [...this.orderBy]
        .sort((a, b) => `${a.field}:${a.direction}`.localeCompare(`${b.field}:${b.direction}`)),
      cursors: [...this.cursors]
        .sort((a, b) => a.type.localeCompare(b.type)),
      limit: this.limit,
    };

    return JSON.stringify(normalized);
  }
}

/**
 * @param {FirestoreRequestDescriptor} descriptor
 * @param {Firestore.CollectionReference|Firestore.Query} ref
 * @return {Promise<Firestore.QueryConstraint[]>}
 */
export async function buildQueryConstraints(descriptor, ref) {
  /** @type {Firestore.QueryConstraint[]} */
  const constraints = [];

  for (const filter of descriptor.filters) {
    constraints.push(where(filter.field, filter.operator, filter.value));
  }

  for (const field of descriptor.orderBy) {
    constraints.push(orderBy(field.field, field.direction));
  }

  if (descriptor.limit !== null) {
    constraints.push(limit(descriptor.limit));
  }

  for (const cursor of descriptor.cursors) {
    const start = cursor.type === 'startAfter' ? startAfter : startAt;
    if (cursor.values.length === 1) {
      const snapshot = await getDoc(doc(ref, cursor.values[0]));
      constraints.push(start(snapshot));
      continue;
    }
    constraints.push(start(...cursor.values));
  }

  return constraints;
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
    this.context = new RequestContext(request, { pathPrefix: apiPath });
    this.descriptor = FirestoreRequestDescriptor.fromContext(this.context);
  }

  /**
   * @return {string}
   */
  get pathname() {
    return this.context.pathname;
  }

  /**
   * @return {string}
   */
  get relativePath() {
    return this.context.relativePath;
  }

  /**
   * @return {string[]}
   */
  get pathSplit() {
    return this.descriptor.pathSplit;
  }

  /**
   * @return {boolean}
   */
  get isDocumentPath() {
    return this.descriptor.isDocumentPath;
  }

  /**
   * @return {boolean}
   */
  get isCollectionGroupPath() {
    return this.descriptor.isCollectionGroupPath;
  }

  /**
   * @return {boolean}
   */
  get isCollectionPath() {
    return this.descriptor.isCollectionPath;
  }

  /**
   * @return {boolean}
   */
  get isSubCollectionPath() {
    return this.descriptor.isSubCollectionPath;
  }

  /**
   * @return {string}
   */
  getCollectionPath() {
    return `/${this.descriptor.getCollectionPath()}`;
  }

  /**
   * @return {FirestorePath}
   */
  getFirestoreCollectionGroupPath() {
    const collectionName = (this.pathSplit[this.pathSplit.length - 1] || '').replace(/\.group$/, '');
    const apiPath = this._apiPath.replace(/^\/+/, '');
    const request = new Request(`${this.url.origin}/${apiPath}/${collectionName}.group`);
    return new FirestorePath(request, this._apiPath);
  }
}

export {
  RESERVED_KEYS,
  LIMIT,
  ORDER_BY,
  AFTER,
  AT,
};
