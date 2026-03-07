import WorkboxPlugin from "./index.js";


export default class FirebaseWorkboxPlugin extends WorkboxPlugin {
  async requestWillFetch({request}) {
    // Wait for Firebase to be ready
    await this.runtime.ready();
    return request;
  }
}
