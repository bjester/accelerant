import { expect } from 'chai';
import RequestContext from '../../src/request/index.js';

describe('RequestContext', () => {
  it('parses path and query params with prefix', () => {
    const request = new Request('https://example.com/api/db/users/123?limit=10&tags[]=a&tags[]=b');
    const context = new RequestContext(request, { pathPrefix: '/api/db' });

    expect(context.pathname).to.equal('/api/db/users/123');
    expect(context.path).to.equal('/users/123');
    expect(context.pathSplit).to.deep.equal(['users', '123']);
    expect(context.params.get('limit')).to.equal('10');

    const entries = Array.from(context.paramEntries((key) => key === 'tags'));
    expect(entries).to.deep.equal([['tags', ['a', 'b']]]);
  });

  it('gets storage path from storage routes', () => {
    const request = new Request('https://example.com/api/fs/path/to/file.txt');
    const context = new RequestContext(request, { pathPrefix: '/api/fs' });
    expect(context.getStoragePath()).to.equal('/path/to/file.txt');
  });
});
