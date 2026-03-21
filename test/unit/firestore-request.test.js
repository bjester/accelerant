import { expect } from 'chai';
import { BadRequestError } from '../../src/errors.js';
import FirestoreRequestDescriptor, {
  buildQueryConstraints,
  FirestorePath,
} from '../../src/request/firestore.js';
import RequestContext from '../../src/request/index.js';

function makeContext(url) {
  return new RequestContext(new Request(url), { pathPrefix: '/api/db' });
}

describe('FirestoreRequestDescriptor', () => {
  it('parses document path and query options', () => {
    const context = makeContext(
      'https://example.com/api/db/users/u1?age__lte=2&active=true&deleted=false&none=null&skip=undefined&orderBy=desc:createdAt&limit=2',
    );

    const descriptor = FirestoreRequestDescriptor.fromContext(context);

    expect(descriptor.kind).to.equal('document');
    expect(descriptor.collectionPath).to.equal('users');
    expect(descriptor.docId).to.equal('u1');
    expect(descriptor.limit).to.equal(2);
    expect(descriptor.orderBy).to.deep.equal([{ field: 'createdAt', direction: 'desc' }]);
    expect(descriptor.filters).to.deep.equal([
      { field: 'age', operator: '<=', value: '2' },
      { field: 'active', operator: '==', value: true },
      { field: 'deleted', operator: '==', value: false },
      { field: 'none', operator: '==', value: null },
    ]);
  });

  it('parses array operators and collection group path', () => {
    const context = makeContext(
      'https://example.com/api/db/items.group?role__in=admin&role__in=editor&tags__has_any=alpha&tags__has_any=beta',
    );

    const descriptor = FirestoreRequestDescriptor.fromContext(context);

    expect(descriptor.kind).to.equal('collectionGroup');
    expect(descriptor.groupName).to.equal('items');
    expect(descriptor.collectionPath).to.equal('items');
    expect(descriptor.filters).to.deep.equal([
      { field: 'role', operator: 'in', value: ['admin', 'editor'] },
      { field: 'tags', operator: 'array-contains-any', value: ['alpha', 'beta'] },
    ]);
  });

  it('throws for invalid query suffix', () => {
    const context = makeContext('https://example.com/api/db/users?age__nope=1');

    expect(() => FirestoreRequestDescriptor.fromContext(context)).to.throw(BadRequestError);
  });

  it('produces deterministic key independent of query param order', () => {
    const first = FirestoreRequestDescriptor.fromContext(
      makeContext('https://example.com/api/db/users?age__gte=21&orderBy=desc:createdAt&limit=2'),
    );
    const second = FirestoreRequestDescriptor.fromContext(
      makeContext('https://example.com/api/db/users?limit=2&orderBy=desc:createdAt&age__gte=21'),
    );

    expect(first.toKey()).to.equal(second.toKey());
  });

  it('produces deterministic standardized URL independent of query param order', () => {
    const first = FirestoreRequestDescriptor.fromContext(
      makeContext('https://example.com/api/db/users?age__gte=21&orderBy=desc:createdAt&limit=2'),
    );
    const second = FirestoreRequestDescriptor.fromContext(
      makeContext('https://example.com/api/db/users?limit=2&orderBy=desc:createdAt&age__gte=21'),
    );

    expect(first.toStandardizedURI('/api/db')).to.equal(second.toStandardizedURI('/api/db'));
    expect(first.toStandardizedURI('/api/db')).to.equal(
      '/api/db/users?age__gte=21&orderBy=desc%3AcreatedAt&limit=2',
    );
  });

  it('builds firestore constraints from descriptor', async () => {
    const descriptor = FirestoreRequestDescriptor.fromContext(
      makeContext('https://example.com/api/db/users?age__gte=21&orderBy=desc:createdAt&limit=2'),
    );

    const constraints = await buildQueryConstraints(descriptor, {});

    expect(constraints).to.have.length(3);
  });
});

describe('FirestorePath', () => {
  it('provides compatibility path helpers', () => {
    const docPath = new FirestorePath(
      new Request('https://example.com/api/db/users/u1'),
      '/api/db',
    );
    expect(docPath.isDocumentPath).to.equal(true);
    expect(docPath.getCollectionPath()).to.equal('/users');

    const subCollectionPath = new FirestorePath(
      new Request('https://example.com/api/db/users/u1/items'),
      '/api/db',
    );
    expect(subCollectionPath.isSubCollectionPath).to.equal(true);
    expect(subCollectionPath.getFirestoreCollectionGroupPath().getCollectionPath()).to.equal(
      '/items',
    );
  });
});
