import { describe, expect, it } from 'vitest';

import { fencedBlock, readReadme, section } from './support/readme.js';
import { runBuiltPackageScript } from './support/run.js';

// Criterion: the README's usage example, executed against the BUILT package,
// produces the output the README shows, character for character.
//
// Roughly half of documentation traffic is now agents lifting a block verbatim,
// so a usage example that drifts from its output becomes wrong generated code.
// This test is what stops that: it reads the example out of README.md rather
// than restating it, so the two cannot diverge without going red.
describe('the README usage example', () => {
  const usage = section(readReadme(), 'Usage');
  const example = fencedBlock(usage, 'js');
  const expectedOutput = fencedBlock(usage, 'text');

  it('runs against the built package and prints exactly what the README shows', () => {
    const run = runBuiltPackageScript('readme-usage.mjs', example);

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(expectedOutput);
  });

  it('prints the same output under a host TZ far from UTC', () => {
    const run = runBuiltPackageScript('readme-usage-tz.mjs', example, {
      env: { TZ: 'Pacific/Kiritimati' },
    });

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(expectedOutput);
  });

  it('imports the package by its published name, not by a relative path', () => {
    expect(example).toContain("from '@cosyte/dates'");
    expect(example).not.toContain('../');
    expect(example).not.toContain('dist/');
  });
});
