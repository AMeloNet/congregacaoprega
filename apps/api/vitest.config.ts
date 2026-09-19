import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    name: 'api-unit',
    testTimeout: 20_000,
  },
});
