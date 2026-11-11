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
  stryker: {
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms), 10 of 800 mutants timed out
    // on the first measured run (2026-11-11), and a mutant near that line can be a timeout on one
    // run and a survivor on the next, which moves a full score the ratchet compares exactly. A
    // wider margin lets a slow mutant that still finishes finish every time, so only a mutant
    // that never ends times out, and the weekly score does not move on the runner's load.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});
