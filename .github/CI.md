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
| `.github/workflows/ci.yml` | push to `main`, pull request to `main` | The gate. One job, `verify`: install from the frozen lockfile, build, the typed-exports check (`pnpm run attw`), the runnable examples (`pnpm run examples`), typecheck, lint, format check, the test suite, the suite again under a second host time zone, and the em-dash scan. |
| `.github/workflows/no-emdash.yml` | push to `main`, pull request to `main` (including `edited`) | Repo-local gate. Scans every tracked file, plus the pull request's own title, body and commit messages, for U+2014. |
| `.github/workflows/scorecard.yml` | push to `main`, weekly cron | Thin caller of `cosyte/.github/.github/workflows/scorecard.yml@main`. Supply-chain analysis, SARIF into the Security tab. |
| `.github/workflows/codeql.yml` | push to `main`, pull request to `main`, weekly cron | Thin caller of the org CodeQL reusable at a published reference. |
| `.github/workflows/no-internal-refs.yml` | push to `main`, pull request to `main` | Thin caller of the org public-surface gate (installing variant) at a published reference. Runs `pnpm check:no-internal-refs` over the README, `docs-content/`, the npm description and keywords, and the `src/` doc comments. |
| `.github/workflows/release.yml` | push to `main` | Thin caller of `cosyte/.github/.github/workflows/release.yml@main`: Changesets opens or refreshes the "Version Packages" pull request, and merging that pull request publishes to npm behind the `release` environment. See "The release path" below. |

`ci.yml` is ONE JOB on purpose. The thing that reads this repo's health asks
whether `dates` is green, so the workflow reports a single conclusive status
rather than a matrix of several that have to be combined first. It pins Node to
`22`, the engine floor the package declares, so the gate proves the floor rather
than whatever the runner happens to ship.

The em-dash scan appears in both `ci.yml` and `no-emdash.yml`, and neither
subsumes the other. `no-emdash.yml` carries the `edited` activity type so it
re-checks a pull request's title and body, which under squash merge ARE the
commit message that lands; `ci.yml` scans the tracked files as one rung of the
single status. The file scan is a checkout and one grep, so running it twice
costs nothing worth optimising.

`scorecard.yml` never runs on `pull_request`, and that is a hard constraint
rather than a style choice: `ossf/scorecard-action` validates the ref before it
does anything and exits with "validating options: only default branch is
supported" anywhere else. Measured on this repo's own caller on 2026-08-29 from a
throwaway branch. That workflow's first real run is a merge to `main`, and there
is no way to prove it green beforehand.

One further note on the scorecard caller: it passes `publish-results: false`,
which is the one place it differs from the hl7 and `github-profile` callers. The
reasoning is written out in the workflow file itself.

There is no branch ruleset and no required status check on this repo. See the
last section.

## The release path

`release.yml` calls the same shared pipeline, at the same reference, as every other `@cosyte/*`
package. A push to `main` runs its `version` job, which checks that this repository's `release`
environment is a real human gate (a required reviewer and a deployment branch policy limited to
`main`), runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm attw`, and then:

- with changesets pending under `.changeset/`, opens or refreshes the "Version Packages" pull
  request, which runs `pnpm run version` (`changeset version`, then Prettier over `package.json` and
  the generated `CHANGELOG.md`);
- on the commit that pull request lands, derives the GitHub release notes from the changesets it
  consumed, checks that `CHANGELOG.md` carries a `## <version>` section, and hands the publish to
  the `release` job, which waits in the `release` environment until a reviewer approves it.

The publish itself runs `pnpm run release` (`changeset publish`), then `pnpm pack:docs`, which
writes `dist-artifacts/docs-content.tar.gz` (the pages under `docs-content/`) and
`dist-artifacts/source.tar.gz` (`src/`, `package.json` and `tsconfig.json`) for docs.cosyte.com and
attaches both to the GitHub release.

`attw` runs with `--profile esm-only`, because this package ships no CommonJS build by decision; the
CommonJS resolutions are not ones it promises.

## The org reusables this repo does NOT call yet

Each row names the precondition that unblocks it, and whether that precondition
is now met. None of these is an oversight.

### `cosyte/.github/.github/workflows/ci.yml@main`

**Precondition (a manifest, a lockfile, buildable source and a test suite): MET.
Not adopted anyway, for two reasons that outlive the precondition.**

1. The reusable runs a FIXED ladder and no arbitrary repo script, so it cannot
   run `scripts/check-no-emdash.sh`. The em-dash gate has to live in whichever
   workflow is the gate.
2. Its ladder includes a dual ESM/CJS smoke import of the built entrypoint. This
   package is ESM only by decision and ships no CommonJS build, so that rung
   would be red for a reason no change here should fix.

Adopting it later is a small change and nothing in `ci.yml` blocks it: delete the
steps, add a `uses:`. If that happens, note that the reusable's `run-actionlint`
input defaults to `true`, which is how workflow linting would arrive here, and
that setting it to `false` does not strand a pull request but silently
un-requires the gate (a job skipped by a job-level conditional still emits its
check run, concluding `skipped`, which GitHub treats as successful). That is
recorded in the reusable itself and repeated here because it is the kind of thing
a caller gets wrong once.

### The drift-check reusable

**Precondition: `dates` is added to `config/drift-manifest.json` as a target, and
the baseline it would be checked against is the one this repo is meant to meet.**

The manifest names 13 targets today (hl7, mllp, dicom, x12, ccda, ncpdp, fhir,
astm, terminology, transform, cli, deid, synth) and `dates` is not one of them. A
SECOND, LIGHTER baseline is intended for the repos outside those 13, this one
included, and drift-check runs advisory during the migration before it flips to
gating. So the baseline this repo will be measured against does not exist yet.

## Adding a branch ruleset

**Precondition: the workflow whose context you want to require has completed at
least one run on `main`.**

A required status check naming a context that has never been reported blocks
every pull request indefinitely and shows no reason. `ci.yml` and
`no-emdash.yml` each become a sound candidate after their first run on `main`.
One caveat carried over from the em-dash gate itself: require the workflow, and
understand that its PR-text half is pull-request only. On a push to `main` that
step is skipped by design, because by then the message is already written.
