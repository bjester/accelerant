import path from 'node:path';
import { defineConfig } from 'vite';

const repoRoot = path.resolve(__dirname, '../../');

export default defineConfig({
  root: path.resolve(__dirname, 'app'),
  server: {
    port: 4173,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  resolve: {
    alias: {
      '/src': path.resolve(repoRoot, 'src'),
    },
  },
});
