// Main entry point for the Accelerant library
// This file is used by Rollup as the main input

import Accelerant, { registerServiceWorker } from './src/index.js';

// Export the main library functions
export { registerServiceWorker } from './src/index.js';

// Also export individual modules for advanced usage
export { default as Accelerant } from './src/index.js';

export * from './src/strategy/index.js';
export * from './src/request/index.js';
export * from './src/response/index.js';
export * from './src/errors.js';

// Default export for common usage
export default {
  registerServiceWorker,
  Accelerant,
};
