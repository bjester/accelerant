import { expect } from 'chai';
import { merge } from '../../src/utils/object.js';

describe('merge function', () => {
  it('should merge simple objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const expected = { a: 1, b: 3, c: 4 };
    expect(merge(target, source)).to.deep.equal(expected);
  });

  it('should deep merge nested objects', () => {
    const target = {
      user: { name: 'John', age: 30 },
      settings: { theme: 'light' },
    };
    const source = {
      user: { age: 31, email: 'john@example.com' },
      settings: { theme: 'dark' },
    };
    const expected = {
      user: { name: 'John', age: 31, email: 'john@example.com' },
      settings: { theme: 'dark' },
    };
    expect(merge(target, source)).to.deep.equal(expected);
  });

  it('should not mutate source object', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const originalSource = { ...source };

    merge(target, source);

    expect(source).to.deep.equal(originalSource);
  });

  it('should not mutate target object', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const originalTarget = { ...target };

    merge(target, source);

    expect(target).to.deep.equal(originalTarget);
  });

  it('should overwrite arrays instead of merging', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5, 6] };
    const expected = { items: [4, 5, 6] };
    expect(merge(target, source)).to.deep.equal(expected);
  });

  it('should handle mixed nested structures', () => {
    const target = {
      config: {
        ports: [8080, 9099],
        settings: { debug: false },
      },
    };
    const source = {
      config: {
        ports: [3000, 4000],
        settings: { debug: true, logLevel: 'info' },
      },
    };
    const expected = {
      config: {
        ports: [3000, 4000],
        settings: { debug: true, logLevel: 'info' },
      },
    };
    expect(merge(target, source)).to.deep.equal(expected);
  });

  it('should handle null and undefined values', () => {
    const target = { a: 1, b: null };
    const source = { b: 2, c: undefined };
    const expected = { a: 1, b: 2, c: undefined };
    expect(merge(target, source)).to.deep.equal(expected);
  });
});
