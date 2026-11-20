import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'packages/**/test/**/*.test.{ts,mjs}'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
