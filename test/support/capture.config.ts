import { defineConfig } from "vitest/config";

/**
 * The output-digest capture's own Vitest run, never part of `pnpm test`:
 * `pnpm exec vitest run --config test/support/capture.config.ts`. See
 * `test/support/capture-output-digests.ts`.
 */
export default defineConfig({
  test: {
    root: new URL("../..", import.meta.url).pathname,
    include: ["test/support/capture-output-digests.ts"],
    testTimeout: 300_000,
  },
});
