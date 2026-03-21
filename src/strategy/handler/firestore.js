import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { v4 as uuid } from 'uuid';
import { BadRequestError, NotFoundError } from '../../errors.js';
import FirestoreRequestDescriptor, { buildQueryConstraints } from '../../request/firestore.js';
import StrategyHandler from './index.js';

const CACHE_NAME = 'firestore';

/**
 * @param {Firestore} firestore
 * @param {FirestoreRequestDescriptor} descriptor
 * @return {Promise<DocumentSnapshot<DocumentData>|QueryDocumentSnapshot<DocumentData>>}
 */
async function getDocSnapshot(firestore, descriptor) {
  const collectionRef = collection(firestore, ...descriptor.collectionPathSplit);
  const constraints = await buildQueryConstraints(descriptor, collectionRef);

  if (constraints.length) {
    const q = query(collectionRef, ...constraints, where('id', '==', descriptor.docId));

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0];
    }
  } else {
    const snapshot = await getDoc(doc(collectionRef, descriptor.docId));
    if (snapshot.exists()) {
      return snapshot;
    }
  }

  throw new NotFoundError('document does not exist');
}

/**
 * @param {Firestore} firestore
 * @param {FirestoreRequestDescriptor} descriptor
 * @return {Query<DocumentData>}
 * @private
 */
function _getCollectionGroupRef(firestore, descriptor) {
  return collectionGroup(firestore, descriptor.groupName);
}

/**
 * @param {Firestore} firestore
 * @param {FirestoreRequestDescriptor} descriptor
 * @return {CollectionReference<DocumentData>}
 * @private
 */
function _getCollectionRef(firestore, descriptor) {
  return collection(firestore, ...descriptor.collectionPathSplit);
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
  get allowedMethods() {
    return ['HEAD'];
  }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const descriptor = FirestoreRequestDescriptor.fromContext(context);

    if (descriptor.isDocumentPath) {
      await getDocSnapshot(this.firestore, descriptor);
      return new Response('', { status: 204 });
    }

    if (descriptor.isCollectionPath) {
      const collectionRef = _getCollectionRef(this.firestore, descriptor);
      if (!collectionRef.parent) {
        return this.runtime.response.json.notFound();
      }

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
  get allowedMethods() {
    return ['GET'];
  }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);
    const descriptor = FirestoreRequestDescriptor.fromContext(context);

    if (descriptor.isDocumentPath) {
      return this._handleDoc(descriptor);
    }

    if (descriptor.isCollectionGroupPath) {
      return this._handleCollectionGroup(descriptor);
    }

    return this._handleCollection(descriptor);
  }

  /**
   * @param {FirestoreRequestDescriptor} descriptor
   * @return {Promise<Response>}
   * @private
   */
  async _handleDoc(descriptor) {
    const snapshot = await getDocSnapshot(this.firestore, descriptor);
    const data = {
      id: snapshot.id,
      ...snapshot.data(),
    };

    return this.runtime.response.json.ok(data);
  }

  /**
   * @param {FirestoreRequestDescriptor} descriptor
   * @return {Promise<Response>}
   * @private
   */
  async _handleCollection(descriptor) {
    const collectionRef = _getCollectionRef(this.firestore, descriptor);
    const constraints = await buildQueryConstraints(descriptor, collectionRef);

    const queryRef = query(collectionRef, ...constraints);

    const snapshot = await getDocs(queryRef);
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return this.runtime.response.json.ok(data);
  }

  /**
   * @param {FirestoreRequestDescriptor} descriptor
   * @return {Promise<Response>}
   * @private
   */
  async _handleCollectionGroup(descriptor) {
    const collectionRef = _getCollectionGroupRef(this.firestore, descriptor);
    const constraints = await buildQueryConstraints(descriptor, collectionRef);

    const queryRef = query(collectionRef, ...constraints);

    const snapshot = await getDocs(queryRef);
    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    const descriptor = FirestoreRequestDescriptor.fromContext(context);

    if (descriptor.isDocumentPath) {
      return doc(collection(this.firestore, ...descriptor.collectionPathSplit), descriptor.docId);
    }

    return doc(collection(this.firestore, ...descriptor.collectionPathSplit), uuid());
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
    let { id, ...data } = body;
    if (!id) {
      id = ref.id;
    }

    if (id !== ref.id) {
      throw new BadRequestError('id mismatch');
    }

    await setDoc(ref, { id, ...data }, options);
    return { id, ...data };
  }
}

/**
 * Handler strategy for updating Firestore documents via POST.
 */
export class PostStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() {
    return ['POST'];
  }

  /**
   * @param {Request} request
   * @param {Response} response
   */
  async cachePut(request, response) {
    const cacheKey = response.headers.get('X-Cache-Key');
    if (!cacheKey) {
      return super.cachePut(request.clone(), response);
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
    const data = await this._updateRef(context, ref, { merge: true });

    const opts = {
      headers: {
        'X-Cache-Key': `${this.apiPath}/${ref.path}`,
      },
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
  get allowedMethods() {
    return ['PUT'];
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

    if (snapshot.exists()) {
      return this.runtime.response.json.conflict('document already exists');
    }
    const data = await this._updateRef(context, ref, { merge: false });

    return this.runtime.response.json.created(data);
  }
}

/**
 * Handler strategy for updating Firestore documents via PATCH.
 */
export class PatchStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() {
    return ['PATCH'];
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

    if (!snapshot.exists()) {
      return this.runtime.response.json.notFound('document does not exist');
    }

    await this._updateRef(context, ref, { merge: true });
    const updated = await getDoc(ref);

    return this.runtime.response.json.ok({ id: updated.id, ...updated.data() });
  }
}

/**
 * Handler strategy for updating Firestore documents via DELETE.
 */
export class DeleteStrategyHandler extends UpdateStrategyHandler {
  get allowedMethods() {
    return ['DELETE'];
  }

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

    const descriptor = FirestoreRequestDescriptor.fromContext(context);
    if (!descriptor.isDocumentPath) {
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
