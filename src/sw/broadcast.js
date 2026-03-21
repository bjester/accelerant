const DEFAULT_CHANNEL = 'accelerant';
const channels = new Map();

/**
 * Open a channel
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

/**
 * Close a channel by name
 * @param {string} [name]
 */
export function closeChannel(name = DEFAULT_CHANNEL) {
  if (channels.has(name)) {
    getChannel(name).close();
    channels.delete(name);
  }
}

/**
 * Close all channels
 */
export function closeAllChannels() {
  for (const [name] of channels.entries()) {
    closeChannel(name);
  }
}
