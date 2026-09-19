import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    projects: [
      './apps/api/vitest.config.ts',
      './apps/web/vitest.config.ts',
      './packages/database/vitest.config.ts',
    ],
  },
});
