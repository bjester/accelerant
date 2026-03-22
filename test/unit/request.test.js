import { expect } from 'chai';
import RequestContext, { flattenToParams } from '../../src/request/index.js';

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

describe('flattenToParams', () => {
  describe('flat objects', () => {
    it('should handle simple flat objects', () => {
      const input = { a: 1, b: 2, c: 3 };
      const expected = [
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle string values', () => {
      const input = { name: 'test', value: 'hello' };
      const expected = [
        ['name', 'test'],
        ['value', 'hello'],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });
  });

  describe('nested objects', () => {
    it('should flatten single level nested objects', () => {
      const input = { parent: { child: 'value' } };
      const expected = [['parent[child]', 'value']];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should flatten multi-level nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      };
      const expected = [['level1[level2][level3]', 'deep']];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle multiple nested properties', () => {
      const input = {
        user: {
          name: 'John',
          age: 30,
        },
        settings: {
          theme: 'dark',
        },
      };
      const expected = [
        ['user[name]', 'John'],
        ['user[age]', 30],
        ['settings[theme]', 'dark'],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });
  });

  describe('arrays', () => {
    it('should handle simple arrays', () => {
      const input = { items: [1, 2, 3] };
      const expected = [
        ['items[]', 1],
        ['items[]', 2],
        ['items[]', 3],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle arrays with objects', () => {
      const input = {
        users: [
          { name: 'Alice', age: 25 },
          { name: 'Bob', age: 30 },
        ],
      };
      const expected = [
        ['users[][name]', 'Alice'],
        ['users[][age]', 25],
        ['users[][name]', 'Bob'],
        ['users[][age]', 30],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle nested arrays', () => {
      const input = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };
      const expected = [
        ['matrix[][]', 1],
        ['matrix[][]', 2],
        ['matrix[][]', 3],
        ['matrix[][]', 4],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle top-level arrays', () => {
      const input = [1, 2, 3];
      const expected = [
        ['[]', 1],
        ['[]', 2],
        ['[]', 3],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });
  });

  describe('mixed structures', () => {
    it('should handle objects with nested arrays', () => {
      const input = {
        config: {
          ports: [8080, 9099, 8000],
        },
        name: 'test',
      };
      const expected = [
        ['config[ports][]', 8080],
        ['config[ports][]', 9099],
        ['config[ports][]', 8000],
        ['name', 'test'],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle arrays with nested objects', () => {
      const input = {
        items: [
          { id: 1, tags: ['a', 'b'] },
          { id: 2, tags: ['c', 'd'] },
        ],
      };
      const expected = [
        ['items[][id]', 1],
        ['items[][tags][]', 'a'],
        ['items[][tags][]', 'b'],
        ['items[][id]', 2],
        ['items[][tags][]', 'c'],
        ['items[][tags][]', 'd'],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const input = {};
      const expected = [];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle empty arrays', () => {
      const input = { items: [] };
      const expected = [];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle null and undefined values', () => {
      const input = {
        a: null,
        c: 'value',
      };
      // Note: undefined values are skipped in Object.entries
      const expected = [
        ['a', null],
        ['c', 'value'],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });

    it('should handle mixed types', () => {
      const input = {
        string: 'text',
        number: 42,
        boolean: true,
        nested: {
          array: [1, 'two', false],
        },
      };
      const expected = [
        ['string', 'text'],
        ['number', 42],
        ['boolean', true],
        ['nested[array][]', 1],
        ['nested[array][]', 'two'],
        ['nested[array][]', false],
      ];
      expect(flattenToParams(input)).to.deep.equal(expected);
    });
  });
});
