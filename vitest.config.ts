import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Child processes are spawned by the TZ matrix, the no-output contract and
    // the README example, and a cold build can be slow on a shared runner.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
