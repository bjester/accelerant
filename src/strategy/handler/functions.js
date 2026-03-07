import {httpsCallable} from "firebase/functions";
import StrategyHandler from "./index.js";


export class FunctionsStrategyHandler extends StrategyHandler {
  get allowedMethods() { return ['POST']; }

  get fn() {
    return httpsCallable(this.runtime.firebase.functions, this.options.name);
  }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);

    // Fixed: Remove leading slash for consistency
    const path = context.path.replace(/^\/+/, '');

    switch (path) {
      case this.options.name:
        return await this._handleRequest(context);
      default:
        return this.runtime.response.json.notFound('not-found: ' + context.path);
    }
  }

  async _handleRequest(context) {
    const data = await context.json();
    const fnResponse = await this.fn(data);
    return this.runtime.response.json.ok(fnResponse.data);
  }
}
