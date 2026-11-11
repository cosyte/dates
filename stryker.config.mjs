import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/dates, on the shared StrykerJS config: per-test coverage, static
// mutants ignored, the JSON report at reports/mutation/mutation.json, and no score threshold of its
// own (quality-floor.json decides).
//
//   pnpm mutate:full                           every source file; its score is the floor's
//   pnpm mutate changed --base origin/main     only the source files a change touched
//   pnpm quality:mutation [--base origin/main] the score against quality-floor.json
//
// The files mutated are the shared default: every `.ts` file under `src/` but declarations and
// barrels. `src/index.ts` holds nothing but re-exports, so the shared config reads it as a barrel
// and leaves it out.
export default cosyteStryker({
  // The suite without the build and the files that read it (see that file).
  vitestConfig: "vitest.mutation.config.ts",
});
