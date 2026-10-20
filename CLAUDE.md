# @cosyte/dates

A small TypeScript library, published to npm as `@cosyte/dates`, that validates and converts the
date parts the `@cosyte/*` parsers return. It is tooling beside the parsers, not a parser: ESM only,
Node 22 or later, one runtime dependency (`temporal-polyfill`). Code is in `src/`, tests in `test/`,
runnable programs in `examples/`, and the docs.cosyte.com pages in `docs-content/`.

## Gate

A PR is green when four required checks pass: `verify` (`.github/workflows/ci.yml`), `no-emdash`,
`no-internal-refs / public-surface` and `codeql / analyze (javascript-typescript)`.
`.github/CI.md` explains each one. From the repo root, in `verify`'s order:

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run attw
pnpm run examples
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test
pnpm run test:tz
bash scripts/check-no-emdash.sh
pnpm check:no-internal-refs
```

`pnpm` must be the version `packageManager` in `package.json` pins, as in CI. Where the global
`pnpm` is another version, `corepack pnpm` is not enough (attw's nested `pnpm pack` finds the
global one): run `corepack enable pnpm --install-directory <dir>` and put `<dir>` first on `PATH`.

CI runs `verify` on Node 22, the engine floor. The `no-emdash` check also scans the PR title,
body and commit messages, which become the squash commit. CodeQL runs only in CI. A change under
`src/` adds a changeset (`pnpm changeset`; `.changeset/README.md` says which bump).

## Hazard

The values this package handles carry PHI: dates of birth, admission times, result times. A wrong
conversion does not fail. It moves a date of birth by a day or puts one clinical event before
another, and nothing throws. That is why nothing here adds a component the value did not state,
falls back to the host zone or to UTC, or rounds: where a conversion would have to guess, it refuses
with a named error. `pnpm run test:tz` runs the suite under two host zones to prove the host zone
changes nothing.

## Rules

- Read a `fraction` only through `src/fraction.ts`, from its decimal digits, never as
  `fraction * 1e9`: that rendered 0.999999999999 s as `.1` with nothing thrown (PR #4).
- Decide a skipped or repeated local time by comparing the zone's `earlier` and `later` results,
  never by relabelling a thrown error: a fixed-offset zone was told it had a transition (PR #4).
- Never set `version` in `package.json` or a `## <version>` in `CHANGELOG.md` by hand; changesets
  and the release write both. A hand-set 0.1.0 could never publish (PR #7).
- Keep `.cosyte-release-tooling/**` in the `eslint.config.js` ignores: the release workflow checks
  shared tooling out inside the tree, and `pnpm run lint` linting it failed a release run on main
  (PR #7).
- Never add `pull_request:` to `.github/workflows/scorecard.yml`: the action refuses any ref but
  the default branch (measured 2026-08-29, `.github/CI.md`).
