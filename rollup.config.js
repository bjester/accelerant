import path from 'node:path';
import { fileURLToPath } from 'node:url';
import glob from 'fast-glob';
import copy from 'rollup-plugin-copy';

export default {
  input: {
    index: './index.js',
    ...Object.fromEntries(
      glob.sync('src/**/*.js').map((file) => [
        // This remove `src/` as well as the file extension from each
        // file, so e.g. src/nested/foo.js becomes nested/foo
        path.relative('src', file.slice(0, file.length - path.extname(file).length)),
        // This expands the relative paths to absolute paths, so e.g.
        // src/nested/foo becomes /project/src/nested/foo.js
        fileURLToPath(new URL(file, import.meta.url)),
      ]),
    ),
  },
  output: {
    dir: 'dist',
    format: 'es',
    // Preserve module structure
    preserveModules: true,
    // Generate source maps for debugging
    sourcemap: true,
  },
  external: [
    'events',
    'uuid',
    'workbox-routing',
    'workbox-expiration',
    'workbox-strategies',
    'firebase/app',
    'firebase/auth',
    'firebase/firestore',
    'firebase/functions',
    'firebase/storage',
  ],
  plugins: [
    copy({
      targets: [
        {
          src: 'package.json',
          dest: 'dist',
          transform(contents) {
            const pkg = JSON.parse(contents.toString());
            delete pkg.devDependencies;
            delete pkg.scripts;
            delete pkg.packageManager;
            delete pkg.files;
            pkg.main = 'index.js';
            pkg.exports = {
              '.': './index.js',
              './sw': './sw/worker.js',
            };
            return JSON.stringify(pkg, null, 2);
          },
        },
        { src: 'README.md', dest: 'dist' },
      ],
    }),
  ],
};
