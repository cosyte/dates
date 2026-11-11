# CI in this repo, and what is deliberately not here yet

`@cosyte/dates` carries a package: a manifest, a lockfile, `src/`, `test/` and a
build. What follows is which gates run against it, and which org reusables it
still does not call and why.

The org keeps its pipeline in `cosyte/.github` and every repo's workflow is
normally a thin caller. The question for this repo is never "what should CI do"
but "which callers can this tree actually satisfy". Registering a caller a repo
cannot satisfy lands a gate that is RED ON ARRIVAL, which is strictly worse than
no gate: it blocks the very pull requests that would fix it.

## What runs today

| workflow | trigger | what it is |
|---|---|---|
| `.github/workflows/ci.yml` | push to `main`, pull request to `main`, nightly cron (05:49 UTC), manual dispatch | The gate. One job, `verify`, run on Node 22, 24 and 26, each on Linux, Windows and macOS: install from the frozen lockfile, build, the typed-exports check (`pnpm run attw`), the runnable examples (`pnpm run examples`), typecheck, lint, format check, the test suite, the 100% coverage gate (`pnpm run test:coverage`), and the suite again under two host time zones; on the Linux legs also the PHI scan (`pnpm run phi-scan`), the em and en dash gate, the README, CLAUDE.md card and catalog checks, and the process wiring check (`pnpm run check:process`), which read the same committed bytes on every system. Build, typecheck, lint, format and test run through `cosyte-process` from `@cosyte/process`, which owns the tool versions. Beside it: `actionlint` lints every workflow file with rhysd/actionlint's release binary at the version and SHA-256 the shared CI pins; `bun` and `deno` run the suite under Bun and under Deno; `coverage-ratchet` holds coverage to `quality-floor.json` with `cosyte-ratchet`, and on a pull request every changed line coverage counts; `mutation`, on a pull request only, mutates the changed source files with `stryker.config.mjs` and requires every mutant in the changed lines killed; `scaling-gate` runs `pnpm test:perf`; `bench-compare`, on a pull request only, is advisory and never fails. |
| `.github/workflows/weekly-mutation.yml` | weekly cron (Sunday 06:43 UTC), manual dispatch | Thin caller of the org weekly mutation reusable: `pnpm mutate:full` split across four shards, the merged score held to the mutation floor in `quality-floor.json`, the report kept in the `mutation-report` artifact. It never commits; a floor is raised by a pull request. |
| `.github/workflows/nightly-properties.yml` | nightly cron (04:29 UTC), manual dispatch | Thin caller of the org nightly properties reusable: `pnpm test:property` with `COSYTE_PROPERTY_RUNS=10000`, each failure's replay seed and path kept in the summary and the `property-run` artifact. |
| `.github/workflows/no-emdash.yml` | push to `main`, pull request to `main` (including `edited`) | Two repo-local jobs running the shared gate (`pnpm check:no-emdash`, `cosyte-no-emdash`) for U+2014 and U+2013 in every encoded form. `no-emdash` scans every tracked file and file name; `no-emdash-messages`, on a pull request only, scans its title, body and commit messages. |
| `.github/workflows/scorecard.yml` | push to `main`, weekly cron | Thin caller of the org Scorecard reusable at a published reference. Supply-chain analysis, SARIF into the Security tab. |
| `.github/workflows/codeql.yml` | push to `main`, pull request to `main`, weekly cron | Thin caller of the org CodeQL reusable at a published reference. |
| `.github/workflows/no-internal-refs.yml` | push to `main`, pull request to `main` | Thin caller of the org public-surface gate (installing variant) at a published reference. Runs `pnpm check:no-internal-refs` over the README, `docs-content/`, the npm description and keywords, and the `src/` doc comments. |
| `.github/workflows/pr-title.yml` | pull request to `main` (including `edited`) | Thin caller of the org pull request title check at a published reference: the title, which a squash merge makes the commit, follows Conventional Commits. Its context is `pr-title / conventional-commits`. |
| `.github/workflows/release.yml` | push to `main` | Thin caller of the org release reusable at a published reference: Changesets opens or refreshes the "Version Packages" pull request, and merging that pull request publishes to npm behind the `release` environment. See "The release path" below. |

Every caller of a `cosyte/.github` reusable names a published reference, a
`workflows-*` release. The weekly mutation and nightly properties callers name a
later one than the rest, because the earlier one holds neither workflow; moving
the others to it is a change of its own, since its `release.yml` gates a publish
on the weekly mutation result.

`ci.yml`'s gate is ONE JOB, `verify`, run once per supported Node line: `22`, the
engine floor the package declares, so the gate proves the floor rather than
whatever the runner happens to ship, then `24` and `26`, the other lines every
@cosyte/\* library tests. The Linux Node 22 leg is still reported as `verify`;
the other Linux legs as `verify (node 24)` and `verify (node 26)`, and the
Windows and macOS legs as `verify (windows-latest, node 22)` and so on. The
ruleset requires the three Linux legs (see the last section).

Beside it, `ci.yml`'s `actionlint` job lints every tracked workflow file once, by
the steps of the shared CI's `actionlint` job, which every other @cosyte/\*
library runs as `ci / actionlint`. It downloads rhysd/actionlint's own
release binary at one version and checks it against one SHA-256 before unpacking
it, so the pair moves with the shared job's, by hand: Dependabot cannot see it.
Never reviewdog/action-actionlint, which from v1.75.0 installs actionlint by
piping a fork's script to bash. Its context, `actionlint`, is required.

The em-dash scan appears in both `ci.yml` and `no-emdash.yml`, and neither
subsumes the other. `no-emdash.yml` carries the `edited` activity type so it
re-checks a pull request's title and body, which under squash merge ARE the
commit message that lands; `ci.yml` scans the tracked files as one rung of the
single status. The file scan takes seconds once the dependencies are installed,
so running it twice costs nothing worth optimizing.

`scorecard.yml` never runs on `pull_request`, and that is a hard constraint
rather than a style choice: `ossf/scorecard-action` validates the ref before it
does anything and exits with "validating options: only default branch is
supported" anywhere else. Measured on this repo's own caller on 2026-08-29 from a
throwaway branch. That workflow's first real run is a merge to `main`, and there
is no way to prove it green beforehand.

One further note on the scorecard caller: it passes `publish-results: false`,
which is the one place it differs from the hl7 and `github-profile` callers. The
reasoning is written out in the workflow file itself.

`ci.yml` also runs every night at 05:49 UTC (cron `49 5 * * *`), on the latest
commit of `main`, so a `main` that goes red without a push (a dependency, a
runner image, a date that expired, a shared workflow) is found the next morning
rather than on the next pull request. Each repo has its own minute so the nightly
runs do not all start together, and none is on the hour, because GitHub delays
scheduled runs at high load, which includes the start of every hour. The `verify` job
reads nothing from a pull request, so a scheduled run is the same ladder a push
runs. It shares the push runs' concurrency group, so a push to `main` that lands
during a nightly run cancels it and the push run tests the newer commit.
`workflow_dispatch` starts the same run by hand on any branch:
`gh workflow run ci.yml -R cosyte/dates --ref <branch>`.

`main` has a branch ruleset, `ci-required-checks` (since 2026-10-08). See the
last section.

## The release path

`release.yml` calls the same shared pipeline, at the same reference, as every other `@cosyte/*`
package. A push to `main` runs its `version` job, which checks that this repository's `release`
environment is a real human gate (a required reviewer and a deployment branch policy limited to
`main`), runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm attw`, and then:

- with changesets pending under `.changeset/`, opens or refreshes the "Version Packages" pull
  request, which runs `pnpm run version` (`changeset version`, then `cosyte-process format`, which
  formats `package.json` and the generated `CHANGELOG.md` with the shared Prettier);
- on the commit that pull request lands, derives the GitHub release notes from the changesets it
  consumed, checks that `CHANGELOG.md` carries a `## <version>` section, and hands the publish to
  the `release` job, which waits in the `release` environment until a reviewer approves it.

The publish itself runs `pnpm run release` (`changeset publish`), then `pnpm pack:docs`, which
writes `dist-artifacts/docs-content.tar.gz` (the pages under `docs-content/`) and
`dist-artifacts/source.tar.gz` (`src/`, `package.json` and `tsconfig.json`) for docs.cosyte.com and
attaches both to the GitHub release.

`attw` runs with attw's `esm-only` profile, which `scripts/attw.exclude` selects (`node10` and
`node16-cjs`), because this package ships no CommonJS build by decision; the CommonJS resolutions
are not ones it promises. The gate itself is `cosyte-attw` from `@cosyte/script-utils`.

## The org reusables this repo does NOT call yet

Each row names the precondition that unblocks it, and whether that precondition
is now met. None of these is an oversight.

### The shared `ci.yml`

**Precondition (a manifest, a lockfile, buildable source and a test suite): MET.
Not adopted anyway, for two reasons that outlive the precondition.**

1. The reusable runs a FIXED ladder and no arbitrary repo script, so it cannot
   run this repository's dash gate, PHI scan or document checks. They have to
   live in whichever workflow is the gate.
2. Its ladder includes a dual ESM/CJS smoke import of the built entrypoint. This
   package is ESM only by decision and ships no CommonJS build, so that rung
   would be red for a reason no change here should fix.

So the testing standard's jobs the reusable runs behind its inputs (`os`,
`run-bun`, `run-deno`, `run-coverage-ratchet`, `run-mutation`) run in `ci.yml`
as jobs of its own, with the reusable's steps.

Adopting it later is a small change and nothing in `ci.yml` blocks it: delete the
steps and the local `actionlint` job, add a `uses:`. If that happens, note that the
reusable's `run-actionlint` input defaults to `true`, which is how workflow linting
would then arrive here (as `ci / actionlint`), and that setting it to `false` does
not strand a pull request but silently un-requires the gate (a job skipped by a
job-level conditional still emits its check run, concluding `skipped`, which GitHub
treats as successful). That is recorded in the reusable itself and repeated here
because it is the kind of thing a caller gets wrong once.

### The drift-check reusable

**Precondition: `dates` is added to `config/drift-manifest.json` as a target, and
the baseline it would be checked against is the one this repo is meant to meet.**

The manifest names 13 targets today (hl7, mllp, dicom, x12, ccda, ncpdp, fhir,
astm, terminology, transform, cli, deid, synth) and `dates` is not one of them. A
SECOND, LIGHTER baseline is intended for the repos outside those 13, this one
included, and drift-check runs advisory during the migration before it flips to
gating. So the baseline this repo will be measured against does not exist yet.

## The branch ruleset

Since 2026-10-08 a branch ruleset, `ci-required-checks`, applies to `main` (the
default branch). It requires eight status checks; the org ruleset
`baseline-branch-protection` requires a pull request, linear history, no deletion
and no force push:

| required check | from |
|---|---|
| `verify` | `.github/workflows/ci.yml`, the Node 22 leg |
| `verify (node 24)` | `.github/workflows/ci.yml`, the Node 24 leg |
| `verify (node 26)` | `.github/workflows/ci.yml`, the Node 26 leg |
| `actionlint` | `.github/workflows/ci.yml` |
| `no-emdash` | `.github/workflows/no-emdash.yml`, the tracked-file job |
| `no-internal-refs / public-surface` | `.github/workflows/no-internal-refs.yml` |
| `codeql / analyze (javascript-typescript)` | `.github/workflows/codeql.yml` |
| `pr-title / conventional-commits` | `.github/workflows/pr-title.yml` |

Read both with `gh api repos/cosyte/dates/rules/branches/main`. Job names are the
required contexts, so renaming or dropping one of these jobs strands every pull
request.

**Adding a check to it has one precondition: the workflow whose context you want
to require has completed at least one run on `main`.** A required status check
naming a context that has never been reported blocks every pull request
indefinitely and shows no reason. One caveat from the em-dash gate itself: only
its tracked-file job, `no-emdash`, is required. Its `no-emdash-messages` job,
which scans a pull request's title, body and commit messages, must never be:
Dependabot pastes upstream release notes, dashes included, into a pull request
body. That job runs on pull requests only, because on a push to `main` the
message is already written.
