import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { distEntry, packageRoot } from './support/paths.js';
import { oneLineDescription, readReadme, section } from './support/readme.js';
import { runBuiltPackageScript } from './support/run.js';

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string;
  readonly type?: string;
  readonly description?: string;
  readonly engines?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
) as Manifest;

// Criterion: the manifest declares the package identity.
describe('package identity', () => {
  it('declares the settled name, version, licence, module format and engine floor', () => {
    expect(manifest.name).toBe('@cosyte/dates');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.license).toBe('MIT');
    expect(manifest.type).toBe('module');
    expect(manifest.engines?.['node']).toBe('>=22.0.0');
  });

  it('carries a full MIT licence text naming the copyright owner', () => {
    const licence = readFileSync(path.join(packageRoot, 'LICENSE'), 'utf8');
    expect(licence).toContain('MIT License');
    expect(licence).toMatch(/Copyright \(c\) \d{4} Cosyte/);
    expect(licence).toContain('Permission is hereby granted, free of charge');
    expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(licence).toContain('WITHOUT WARRANTY OF ANY KIND');
  });
});

// Criterion: at most one declared runtime dependency, and no runtime dependency
// whose name begins `@cosyte/`. The parsers stay zero-dependency because this
// package exists; it must not turn round and depend back on them.
describe('the runtime dependency ceiling', () => {
  const runtimeNames = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ];

  it('declares at most one runtime dependency', () => {
    expect(runtimeNames.length).toBeLessThanOrEqual(1);
  });

  it('declares no runtime dependency inside the @cosyte scope', () => {
    expect(runtimeNames.filter((name) => name.startsWith('@cosyte/'))).toEqual([]);
  });

  it('keeps the toolchain out of the runtime dependencies', () => {
    for (const name of runtimeNames) {
      expect(name).not.toMatch(/^(tsup|vitest|eslint|typescript|prettier|@types\/)/);
    }
  });
});

// Criterion: any public entry point exercised with a date value writes nothing to
// stdout, stderr or disk, so a PHI-bearing value never leaves the process here.
describe('the package writes nothing', () => {
  const workingDirectory = mkdtempSync(path.join(os.tmpdir(), 'cosyte-dates-no-write-'));

  afterAll(() => {
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  const script = `
import * as api from '@cosyte/dates';

const parts = {
  year: 1988, month: 5, day: 7,
  hour: 13, minute: 45, second: 6, fraction: 0.25,
  offsetMinutes: 330,
};
const hostile = [
  null, undefined, 'not parts', 12345, new Date(0), [1988, 5, 7],
  { year: 88, month: 13, day: 40 },
  { year: 2025, month: 2, day: 29 },
  { year: Number.NaN },
  { year: 1988, day: 7 },
];

// Named entry points, happy path.
api.validateParts(parts);
api.isValidParts(parts);
api.assertValidParts(parts);
api.precisionOf(parts);
api.toISO(parts);
api.toTemporal(parts);
api.toZonedDateTime(parts);
api.toInstant(parts);

// Every exported callable, over the same value and over hostile input, so an
// entry point added later is exercised here without anyone remembering to.
for (const exported of Object.values(api)) {
  if (typeof exported !== 'function') continue;
  for (const value of [parts, ...hostile]) {
    try { exported(value); } catch { /* refusing is the point; it must still print nothing */ }
  }
}

// Every refusal path this package has, taken deliberately.
const refusals = [
  () => api.toTemporal({ year: 1988 }),
  () => api.toInstant({ year: 1988, month: 5, day: 7, hour: 1 }),
  () => api.toInstant({ year: 1988, month: 5, day: 7 }, { timeZone: 'UTC' }),
  () => api.toInstant({ year: 2024, month: 3, day: 10, hour: 2, minute: 30 }, { timeZone: 'America/New_York' }),
  () => api.toInstant({ year: 1988, month: 5, day: 7, hour: 1 }, { timeZone: 'Mars/Olympus_Mons' }),
  () => api.toISO({ year: 2025, month: 2, day: 29 }),
];
for (const refusal of refusals) {
  try { refusal(); } catch { /* expected */ }
}
`;

  it('writes nothing to stdout or stderr, on happy paths and on every refusal', () => {
    const before = readdirSync(workingDirectory, { recursive: true });
    const run = runBuiltPackageScript('no-output.mjs', script, { cwd: workingDirectory });
    const after = readdirSync(workingDirectory, { recursive: true });

    expect(run.stderr).toBe('');
    expect(run.stdout).toBe('');
    expect(run.status).toBe(0);
    expect(after).toEqual(before);
    expect(after).toEqual([]);
  });

  it('imports nothing that could write: no filesystem, process or network module', () => {
    const built = readFileSync(distEntry, 'utf8');
    for (const forbidden of [
      'node:fs',
      'node:child_process',
      'node:http',
      'node:https',
      'node:net',
      'node:dgram',
      'node:worker_threads',
      'node:os',
      'node:path',
    ]) {
      expect(built).not.toContain(forbidden);
    }
    expect(built).not.toMatch(/\brequire\(['"](fs|child_process|net|http)['"]\)/);
    expect(built).not.toMatch(/\bconsole\s*\./);
    expect(built).not.toMatch(/process\s*\.\s*std(out|err)/);
  });
});

// Criterion: the manifest description and the README's one-line description are
// identical. The template makes the README the source of truth for both.
describe('the description has one source of truth', () => {
  it('matches the README one-line description exactly', () => {
    expect(manifest.description).toBe(oneLineDescription(readReadme()));
  });

  it('is a single line of real prose, not a placeholder', () => {
    expect(manifest.description).toBeDefined();
    expect(manifest.description).not.toContain('\n');
    expect((manifest.description ?? '').length).toBeGreaterThan(40);
    expect(manifest.description).not.toMatch(/pre-launch/i);
  });
});

// Criterion: the README carries every section the template marks REQUIRED, and
// its Status section makes the 0.1.0 claim in the template's words.
describe('the README against the house template', () => {
  const readme = readReadme();

  it('opens with the banner, the title and the tagline, in that order', () => {
    const lines = readme.split('\n');
    expect(lines[0]).toBe('<a href="https://cosyte.com">');
    expect(readme).toContain('cosyte-lockup-tile-on-dark-1200x300.png');
    expect(readme).toContain('cosyte-lockup-tile-on-light-1200x300.png');

    const titleIndex = lines.findIndex((line) => line.startsWith('# '));
    const taglineIndex = lines.findIndex((line) => line.startsWith('> '));
    expect(lines[titleIndex]).toBe('# @cosyte/dates');
    expect(taglineIndex).toBeGreaterThan(titleIndex);
    expect((lines[taglineIndex] ?? '').length).toBeLessThan(120);
  });

  it('carries the house set of four badges, in order', () => {
    const badges = readme
      .split('\n')
      .filter((line) => line.startsWith('[!['))
      .map((line) => /^\[!\[([^\]]*)\]/.exec(line)?.[1] ?? '');
    expect(badges).toEqual(['npm version', 'CI', 'License: MIT', 'Node']);
  });

  it.each([
    'Why this exists',
    'Status',
    'Install',
    'Usage',
    'PHI and safety',
    'Contributing',
    'License',
  ])('carries the REQUIRED section "%s"', (heading) => {
    expect(section(readme, heading).trim().length).toBeGreaterThan(0);
  });

  it('ends with the License section, naming the licence and the owner', () => {
    const headings = readme.split('\n').filter((line) => line.startsWith('## '));
    expect(headings.at(-1)).toBe('## License');
    expect(section(readme, 'License')).toContain('MIT');
    expect(section(readme, 'License')).toContain('Cosyte');
  });

  it('makes the 0.1.0 claim in the template words and names what is not covered', () => {
    const status = section(readme, 'Status');
    expect(status).toContain('0.1.0');
    // The template's own words, allowing only the sentence-initial capital.
    expect(status).toMatch(/the public API is settled and safe to depend on/i);
    expect(status).toContain('Not covered at 0.1.0');
    expect(status).toMatch(/two-digit years/i);
    expect(status).not.toMatch(/^\s*\*\*Pre-launch\.\*\*\s*$/m);
  });

  it('says what it does with PHI and what the consumer still owns', () => {
    const phi = section(readme, 'PHI and safety');
    expect(phi).toMatch(/writes nothing/i);
    expect(phi).toMatch(/retains nothing/i);
    expect(phi).toMatch(/consumer still owns/i);
  });

  it('states the install surface: manager, engine floor and module format', () => {
    const install = section(readme, 'Install');
    expect(install).toContain('pnpm add @cosyte/dates');
    expect(install).toContain('>=22.0.0');
    expect(install).toContain('ESM');
  });
});
