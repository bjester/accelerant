import { cleanupIntegrationRuntime } from "./runtime.js";
import { closeAllChannels } from "../../src/sw/broadcast.js";
import patchAll from '../mocks/sw.js';

patchAll();

export const mochaHooks = {
  async afterAll(){
    await cleanupIntegrationRuntime();

    closeAllChannels();
  }
}
