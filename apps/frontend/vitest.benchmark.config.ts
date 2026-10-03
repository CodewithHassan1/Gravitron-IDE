import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['benchmarks/benchmark-runner.ts'],
  },
});
