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
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'app/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'app/index.html'),
        sw: path.resolve(__dirname, 'app/sw.js'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  resolve: {
    alias: {
      '/src': path.resolve(repoRoot, 'src'),
    },
  },
});
