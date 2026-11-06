import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

const external = [
  'electron',
  'node-pty',
  'chokidar',
  'ws',

  ...nodeBuiltins,

  // Workspace runtime packages
  '@ag/protocol',
  '@ag/ai-providers',
  '@ag/logger',
  '@ag/worker-ai',
];

export default defineConfig({
  build: {
    target: 'node20',
    outDir: 'dist/main',
    emptyOutDir: true,
    sourcemap: true,

    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },

    rollupOptions: {
      external,
      output: {
        format: 'cjs',
        inlineDynamicImports: true,
      },
    },
  },

  resolve: {
    preserveSymlinks: false,
  },
});
