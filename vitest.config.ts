import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    // 30s: Phase 5 introduced @clerk/nextjs, @sentry/nextjs, and Drizzle.
    // Their dynamic import cost can exceed the 5s default when the parallel
    // worker pool is saturated. Each test still completes in milliseconds;
    // the budget is for cold module loads only.
    testTimeout: 30000,
    coverage: {
      include: ['app/api/**', 'lib/**', 'hooks/**', 'components/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    },
  },
});
