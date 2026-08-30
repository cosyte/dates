import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { distEntry, packageRoot } from './support/paths.js';

function newestSourceTime(directory: string): number {
  let newest = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const time = entry.isDirectory() ? newestSourceTime(full) : statSync(full).mtimeMs;
    if (time > newest) newest = time;
  }
  return newest;
}

/**
 * Build once, before any test file runs.
 *
 * Three of the suites run the BUILT package in a child process (the README
 * example, the no-output contract, the cross-process TZ matrix), so `dist/` has
 * to exist and has to match `src/`. Building here rather than in each suite is
 * what keeps `pnpm run test` self-sufficient without several workers racing to
 * write the same output directory.
 */
export default function setup(): void {
  const sources = [path.join(packageRoot, 'src'), path.join(packageRoot, 'package.json')];
  const newest = Math.max(
    ...sources.map((entry) =>
      statSync(entry).isDirectory() ? newestSourceTime(entry) : statSync(entry).mtimeMs,
    ),
  );

  if (existsSync(distEntry) && statSync(distEntry).mtimeMs >= newest) return;

  execFileSync(path.join(packageRoot, 'node_modules', '.bin', 'tsup'), [], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
}
