const DEFAULT_CHANNEL = 'accelerant';
const channels = new Map();

/**
 * @param {string} [name]
 * @return {BroadcastChannel|null}
 */
export function getChannel(name = DEFAULT_CHANNEL) {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channels.has(name)) {
    channels.set(name, new BroadcastChannel(name));
  }
  return channels.get(name);
}

export function closeChannel(name = DEFAULT_CHANNEL) {
  if (channels.has(name)) {
    getChannel(name).close();
    channels.delete(name);
  }
}

export function closeAllChannels() {
  for (const [name] of channels.entries()) {
    closeChannel(name);
  }
}