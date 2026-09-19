import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.tsx'],
    name: 'web-unit',
    setupFiles: ['./src/test-setup.ts'],
  },
});
