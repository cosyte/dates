import type { ViteUserConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

import shared from "./vitest.config.js";

const config = shared as ViteUserConfig;

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts` without the build and without the files that read the built package.
 *
 * StrykerJS mutates `src/` inside a sandbox and switches each mutant on in the test process. The
 * files left out below run `dist/index.js`, in a child process or as the import of a docs sample,
 * so a mutant in `src/` never reaches the code they check, and building `dist/` from the
 * instrumented sources would only slow every run. What they prove (the README program, the
 * no-output contract, the docs samples, two processes under two host zones) is proved by
 * `pnpm test` on every pull request.
 */
const mutation: ViteUserConfig = {
  ...config,
  test: {
    ...config.test,
    globalSetup: [],
    exclude: [
      ...configDefaults.exclude,
      "test/docs-content.test.ts",
      "test/host-zone-processes.test.ts",
      "test/package-contract.test.ts",
      "test/readme.test.ts",
    ],
  },
};

export default mutation;
