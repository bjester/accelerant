import { expect } from 'chai';
import { closeAllChannels, closeChannel, getChannel } from '../../src/sw/broadcast.js';

describe('Broadcast utils', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  let instances;

  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.closed = false;
      instances.push(this);
    }

    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    instances = [];
    globalThis.BroadcastChannel = FakeBroadcastChannel;
    closeAllChannels();
  });

  afterEach(() => {
    closeAllChannels();
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  it('creates and caches the default channel', () => {
    const first = getChannel();
    const second = getChannel();

    expect(first).to.equal(second);
    expect(first.name).to.equal('accelerant');
    expect(instances).to.have.length(1);
  });

  it('creates separate channels per name', () => {
    const first = getChannel('alpha');
    const second = getChannel('beta');

    expect(first).to.not.equal(second);
    expect(first.name).to.equal('alpha');
    expect(second.name).to.equal('beta');
    expect(instances).to.have.length(2);
  });

  it('closes a named channel and recreates it on next access', () => {
    const first = getChannel('alpha');

    closeChannel('alpha');

    const second = getChannel('alpha');
    expect(first.closed).to.equal(true);
    expect(second).to.not.equal(first);
    expect(instances).to.have.length(2);
  });

  it('closes all open channels', () => {
    const first = getChannel('alpha');
    const second = getChannel('beta');

    closeAllChannels();

    expect(first.closed).to.equal(true);
    expect(second.closed).to.equal(true);
  });

  it('returns null when BroadcastChannel is unavailable', () => {
    globalThis.BroadcastChannel = undefined;

    const channel = getChannel('alpha');

    expect(channel).to.equal(null);
  });
});
