import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { packageRoot, scratchDir } from './paths.js';

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
}

/**
 * Write a script into the package's scratch directory and run it with the same
 * Node that is running the tests.
 *
 * The script lives inside the package so `import '@cosyte/dates'` resolves to
 * the BUILT entry point through Node's package self-reference. The working
 * directory is a separate argument, so a caller can hand it an empty scratch
 * directory and then check that nothing was written there.
 */
export function runBuiltPackageScript(
  fileName: string,
  source: string,
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): RunResult {
  mkdirSync(scratchDir, { recursive: true });
  const file = path.join(scratchDir, fileName);
  writeFileSync(file, source, 'utf8');

  const result = spawnSync(process.execPath, [file], {
    cwd: options.cwd ?? packageRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}
