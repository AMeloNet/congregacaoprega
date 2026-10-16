import { defineProject } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineProject({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.spec.ts'],
    name: 'database-integration',
  },
});
