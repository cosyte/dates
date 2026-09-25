#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, run as a CALLER of the shared body in
 * `@cosyte/script-utils/attw`, pinned to an exact version in package.json. Nothing of the gate
 * lives here.
 *
 * Why a wrapper at all: `attw` prints "This package does not contain types." and EXITS 0, so a
 * tarball that lost its declarations passes the bare CLI. The shared body refuses that, checks that
 * every artifact `package.json` promises exists before it runs, and refuses the options that would
 * hide the output it reads. Its nets and the measurements behind them are documented once, in the
 * docblock at the top of `node_modules/@cosyte/script-utils/attw.js`.
 *
 * `package.json` passes `--profile esm-only`, because this package is ESM only by decision: it
 * ships no CommonJS build, so the `node10` and `node16` CommonJS resolutions are not ones it
 * promises. Every ESM resolution is still graded.
 *
 * What this file owns:
 *
 *   - `callerUrl: import.meta.url`. The gate runs `../node_modules/.bin/attw` resolved from this
 *     file, so the binary it runs is this package's own `@arethetypeswrong/cli`.
 *   - Failing closed. If the shared body cannot be imported, the reason goes to stderr and the exit
 *     is 1. There is no local copy of the gate behind the import.
 */

import process from 'node:process';

const SPECIFIER = '@cosyte/script-utils/attw';

let runAttwGate;
try {
  ({ runAttwGate } = await import(SPECIFIER));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `\nx attw gate: could not load ${SPECIFIER}, so nothing was checked.\n` +
      `  ${reason}\n` +
      `  Install dependencies first (pnpm install). There is no local copy of the gate\n` +
      `  behind this import, deliberately.\n`,
  );
  process.exit(1);
}

process.exit(runAttwGate({ callerUrl: import.meta.url }));
