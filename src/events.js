import BaseEventEmitter from "events";

export default class EventEmitter extends BaseEventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * @param {string} eventName
   * @return {Promise<unknown>}
   */
  when(eventName) {
    return new Promise((resolve) => {
      this.once(eventName, resolve);
    });
  }
}
