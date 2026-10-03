import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/preload',
    emptyOutDir: false,

    lib: {
      entry: 'src/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },

    rollupOptions: {
      external: ['electron'],
    },
  },

  resolve: {
    alias: {
      '@ag/protocol': path.resolve(
        path.resolve(__dirname, '../../packages/protocol/src'),
      ),
    },
  },
});