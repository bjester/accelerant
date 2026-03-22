import { expect } from 'chai';
import { parseFlattenedParams } from '../../src/utils/url.js';

describe('parseFlattenedParams', () => {
  describe('flat objects', () => {
    it('should parse simple flat objects', () => {
      const url = '?a=1&b=2&c=3';
      const expected = { a: '1', b: '2', c: '3' };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse string values', () => {
      const url = '?name=test&value=hello';
      const expected = { name: 'test', value: 'hello' };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });
  });

  describe('nested objects', () => {
    it('should parse single level nested objects', () => {
      const url = '?parent[child]=value';
      const expected = { parent: { child: 'value' } };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse multi-level nested objects', () => {
      const url = '?level1[level2][level3]=deep';
      const expected = { level1: { level2: { level3: 'deep' } } };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse multiple nested properties', () => {
      const url = '?user[name]=John&user[age]=30&settings[theme]=dark';
      const expected = {
        user: { name: 'John', age: '30' },
        settings: { theme: 'dark' },
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });
  });

  describe('arrays', () => {
    it('should parse simple arrays', () => {
      const url = '?items[]=1&items[]=2&items[]=3';
      const expected = { items: ['1', '2', '3'] };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse arrays with objects', () => {
      const url = '?users[][name]=Alice&users[][age]=25&users[][name]=Bob&users[][age]=30';
      const expected = {
        users: [
          { name: 'Alice', age: '25' },
          { name: 'Bob', age: '30' },
        ],
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse nested arrays', () => {
      const url = '?matrix[][]=1&matrix[][]=2&matrix[][]=3&matrix[][]=4';
      const expected = {
        matrix: [
          ['1', '2'],
          ['3', '4'],
        ],
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse top-level arrays', () => {
      const url = '?[]=1&[]=2&[]=3';
      const expected = ['1', '2', '3'];
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });
  });

  describe('mixed structures', () => {
    it('should parse objects with nested arrays', () => {
      const url = '?config[ports][]=8080&config[ports][]=9099&config[ports][]=8000&name=test';
      const expected = {
        config: {
          ports: ['8080', '9099', '8000'],
        },
        name: 'test',
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should parse arrays with nested objects', () => {
      const url =
        '?items[][id]=1&items[][tags][]=a&items[][tags][]=b&items[][id]=2&items[][tags][]=c&items[][tags][]=d';
      const expected = {
        items: [
          { id: '1', tags: ['a', 'b'] },
          { id: '2', tags: ['c', 'd'] },
        ],
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const url = '';
      const expected = {};
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should handle empty arrays', () => {
      const url = '?items[]=';
      const expected = { items: [''] };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should handle URL-encoded values', () => {
      const url = '?name=John%20Doe&value=hello%20world';
      const expected = { name: 'John Doe', value: 'hello world' };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });

    it('should handle special characters in keys', () => {
      const url = '?user[name-with-dash]=value&user[name_with_underscore]=value2';
      const expected = {
        user: {
          'name-with-dash': 'value',
          name_with_underscore: 'value2',
        },
      };
      expect(parseFlattenedParams(url)).to.deep.equal(expected);
    });
  });

  describe('integration with flattenToParams', () => {
    it('should correctly reconstruct objects flattened by flattenToParams', async () => {
      const { flattenToParams } = await import('../../src/request/index.js');

      const original = {
        user: {
          name: 'John',
          age: 30,
          addresses: [
            { street: '123 Main St', city: 'Anytown' },
            { street: '456 Oak Ave', city: 'Otherville' },
          ],
        },
        settings: {
          theme: 'dark',
          ports: [8080, 9099, 8000],
        },
      };

      const flattened = flattenToParams(original);

      // Convert flattened array to URL search params
      const searchParams = new URLSearchParams();
      for (const [key, value] of flattened) {
        searchParams.append(key, value);
      }

      const reconstructed = parseFlattenedParams(searchParams);

      // Convert numbers back to strings for comparison (URL params are always strings)
      const expected = {
        user: {
          name: 'John',
          age: '30',
          addresses: [
            { street: '123 Main St', city: 'Anytown' },
            { street: '456 Oak Ave', city: 'Otherville' },
          ],
        },
        settings: {
          theme: 'dark',
          ports: ['8080', '9099', '8000'],
        },
      };

      expect(reconstructed).to.deep.equal(expected);
    });
  });
});
