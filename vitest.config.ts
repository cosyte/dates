import { cosyteVitest } from "@cosyte/vitest-config";

// The shared Cosyte test setup (@cosyte/vitest-config): v8 coverage over `src/`. This repository
// gates every metric at 100 on top of the shared 90. A threshold only rises: a line no input can
// reach carries an inline `v8 ignore` comment naming its reason, never a lowered number here.
export default cosyteVitest({
  coverageThresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Child processes are spawned by the TZ matrix, the no-output contract and
    // the README example, and a cold build can be slow on a shared runner.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
