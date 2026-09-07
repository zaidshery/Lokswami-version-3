import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': process.cwd(),
      'server-only': path.resolve(process.cwd(), 'tests/mocks/server-only.ts'),
    },
  },
  test: {
    // Bound jsdom processes so local and CI runs do not exhaust memory on high-core hosts.
    maxWorkers: 4,
    environment: 'jsdom',
    globals: true,
    setupFiles: './setupTests.ts',
    include: ['tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**', '.next-dev/**'],
  },
});
