import { expect } from 'chai';

describe('InMemoryStorage', () => {
  it('stores and retrieves values without string coercion', async () => {
    globalThis.self = globalThis;
    const { InMemoryStorage } = await import('../../src/storage/shim.js');
    const storage = new InMemoryStorage('local');
    storage.setItem('key', ['a', 'b']);
    expect(storage.getItem('key')).to.deep.equal(['a', 'b']);
  });

  it('emits change events on set and remove', async () => {
    globalThis.self = globalThis;
    const { InMemoryStorage } = await import('../../src/storage/shim.js');
    const storage = new InMemoryStorage('local');
    const events = [];
    storage.on('change', (event) => events.push(event));

    storage.setItem('key', 'value');
    storage.removeItem('key');

    expect(events.length).to.equal(2);
    expect(events[0].oldValue).to.equal(null);
    expect(events[0].newValue).to.equal('value');
    expect(events[1].oldValue).to.equal('value');
    expect(events[1].newValue).to.equal(null);
  });
});
