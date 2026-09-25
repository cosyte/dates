#!/usr/bin/env node
/**
 * scripts/check-no-internal-refs.mjs
 *
 * No internal project bookkeeping on a public surface. Anything a consumer reads (the README, the
 * pages under `docs-content/` that docs.cosyte.com publishes, the npm description and keywords, and
 * the doc comments that compile into the shipped type declarations) says what the software does
 * and what changed. Item identifiers, phase and wave language, ADR numbers, internal repository
 * paths and traceability markers belong in the commit, the pull request and the changeset.
 *
 * THIS FILE IS A CALLER, NOT A SCANNER. The detection rules, the self-test floor, the enumeration,
 * the completeness refusals, the tarball drift tripwire and the hit report all live in
 * `@cosyte/script-utils/internal-refs`, pinned to an exact version in package.json and shared with
 * the other `@cosyte/*` packages. A rule fix is a publish of that package and a version bump here,
 * never a local edit. What this file owns is the axis set that is this repository's own: the
 * prefixes, the standards designations that must never be flagged, the public surface, what the
 * tarball already accounts for, and that the source doc-comment pass runs.
 *
 * AFTER-INSTALL AND FAIL-CLOSED. The shared implementation is reached by package specifier, so the
 * gate runs after `pnpm install`. An install that failed, or an implementation that cannot be
 * reached, exits non-zero and never prints the OK line. There is no fallback scanner behind the
 * import.
 *
 * Run it locally with `pnpm check:no-internal-refs`.
 */

import process from 'node:process';

/**
 * Known project and programme prefixes. The keying is on these, never on the `WORD-N` shape: a
 * shape rule would also flag reference material a reader needs, such as `ISO-8601`, `RFC-3339` or
 * an HL7 field like `PID-7`. The cost is that a new programme means adding its prefix here.
 */
const PROJECT_PREFIXES = [
  'PARSERS-PUBLIC',
  'DOCS-CONTENT',
  'KNOWLEDGEBASE',
  'TERMINOLOGY',
  'PATHWAYS',
  'TRANSFORM',
  'WEBSITE',
  'STAGING',
  'SUPPLY',
  'NCPDP',
  'ASSETS',
  'EMDASH',
  'README',
  'CONFIG',
  'DICOM',
  'SYNTH',
  'DEID',
  'CCDA',
  'ASTM',
  'MLLP',
  'FHIR',
  'CREW',
  'DOCS',
  'PERF',
  'SYNC',
  'VERSION',
  'PUBLIC',
  'HL7',
  'X12',
  'IAC',
  'CLI',
  'KB',
  'PW',
  'PUB',
  'CI',
  'REAL',
  'TERM',
  'PKG',
  'WF',
  'VERIFY',
];

/**
 * Standards designations that collide with the prefix list, excluded explicitly. Several prefixes
 * above are also the names of the standards whose dates this package handles, and a reader needs
 * `HL7-V2`, `FHIR-R4` or `X12-837P` in the documentation. There is no shape that separates those
 * from our own identifiers, so the separation is this reviewable list.
 */
const STANDARDS_DESIGNATIONS = [
  'HL7-(?:V2|V3|CDA|FHIR|OMG|\\d{3,4}[A-Z]?)',
  'FHIR-R\\d[A-Z]?',
  'DICOM-(?:SR|RT|SEG|DIR|PS\\d)',
  'NCPDP-(?:SCRIPT|TELECOM|D\\.\\d)',
  'X12-\\d{3}[A-Z]?',
  'X12-\\d{6}',
  'CCDA-R\\d(?:\\.\\d)?',
  'ASTM-E\\d+',
];

/**
 * The public surface:
 *
 *   README.md      the repository's front page, and shipped inside the npm tarball
 *   LICENSE        shipped inside the npm tarball
 *   docs-content/  every tracked file, including sidebars.json: the pages docs.cosyte.com publishes
 *
 * The npm-visible metadata (`description` and `keywords`) is scanned by the engine as well.
 */
const SURFACE_PATHS = ['README.md', 'LICENSE', 'docs-content'];

/**
 * What the tarball ships that the surface list does not cover, named so that a later addition to
 * `files` trips the drift tripwire instead of passing silently.
 *
 *   CHANGELOG.md  written by the release from the changesets, which the shared release tooling
 *                 already refuses when they carry internal identifiers
 *   dist          untracked build output; its source is gated instead, by the doc-comment pass
 */
const ACCOUNTED_TARBALL_FILES = ['CHANGELOG.md', 'dist'];

/**
 * The source doc-comment pass, on: doc-comment blocks in `src/` compile into `dist/index.d.ts`,
 * which is what a consumer's editor shows on hover. Line comments do not reach `dist` and are not
 * read.
 */
const SOURCE_DOC_COMMENTS = { enabled: true, paths: ['src/*.ts', 'src/**/*.ts'] };

/**
 * This package's own reference material, added to the engine's self-test floor. Each negative is a
 * date and time form a reader of these docs needs, so a later engine release that widened a rule
 * into the `WORD-N` shape reds here instead of deleting it from the documentation. Samples add to
 * the engine's own; nothing here can remove one.
 */
const EXTRA_SAMPLES = {
  'internal-identifier': {
    positives: ['Item HL7-N is done, and CCDA-P7 with it'],
    negatives: [
      'ISO-8601 dates and RFC-3339 timestamps, the HL7 v2 DTM and TS types, PID-7 date of birth, OBR-7 observation time, HL7-V2 and FHIR-R4, the IANA zone America/New_York, an offset written UTC-05:00 or +05:30, a year of 1988 and a date of 1988-05-07',
    ],
  },
  'phase-or-wave': {
    positives: [
      'Phase 5b closes it (Phase W, Phase-L and the thirteenth slice landed earlier, in wave 2)',
    ],
    negatives: [
      'A daylight-saving transition, the phase of the moon, and a clock that stays in phase with the source system',
    ],
  },
  'adr-reference': {
    positives: ['Decided in ADR 0015 and restated in ADR-0021'],
    negatives: ['A year such as 2024 alone is a value, not a decision record'],
  },
  'internal-jargon': {
    positives: ['This slice adds the helper and the final slice removes it'],
    negatives: ['text.slice(0, 4) and value.slice(5, 7) are TypeScript'],
  },
  'internal-repo-path': {
    positives: ['Roadmap operations/roadmaps/dates.md and documentation/decisions/0015-x.md'],
    negatives: [
      'Conversion is documented in the README, and documentation for the API is generated',
    ],
  },
  'traceability-marker': {
    positives: ['Repeating [S-DTM], and Open-question #12 resolves the direction'],
    negatives: ['A character range like [S-Z], and open questions about the feed'],
  },
};

/**
 * Fail closed on an unreachable implementation: an import that cannot resolve is a run with no
 * verdict, never a clean tree.
 */
let runInternalRefsScan;
try {
  ({ runInternalRefsScan } = await import('@cosyte/script-utils/internal-refs'));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      'ERROR: check-no-internal-refs - could not reach the shared implementation',
      '       @cosyte/script-utils/internal-refs, so this run has no verdict on the tree.',
      `       ${reason}`,
      '       Install dependencies first (pnpm install --frozen-lockfile). There is no',
      '       fallback scanner behind this import, deliberately.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

process.exit(
  runInternalRefsScan({
    projectPrefixes: PROJECT_PREFIXES,
    standardsDesignations: STANDARDS_DESIGNATIONS,
    surfacePaths: SURFACE_PATHS,
    accountedTarballFiles: ACCOUNTED_TARBALL_FILES,
    sourceDocComments: SOURCE_DOC_COMMENTS,
    extraSamples: EXTRA_SAMPLES,
  }),
);
