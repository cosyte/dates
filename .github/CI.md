# CI in this repo, and what is deliberately not here yet

`@cosyte/dates` is pre-launch. Its tracked tree is `LICENSE`, `README.md`, this
directory and `scripts/check-no-emdash.sh`. There is no package manifest, no
lockfile, no source directory and no test directory, and adding one is a
separate, deliberate piece of work rather than a side effect of wiring CI.

That single fact decides everything below. The org keeps its pipeline in
`cosyte/.github` and every repo's workflow is a thin caller, so the question for
this repo is never "what should CI do" but "which callers can this tree
actually satisfy today". Registering a caller a repo cannot satisfy lands a gate
that is RED ON ARRIVAL, which is strictly worse than no gate: it blocks the very
pull requests that would fix it.

## What runs today

| workflow | trigger | what it is |
|---|---|---|
| `.github/workflows/no-emdash.yml` | push to `main`, pull request to `main` (including `edited`) | Repo-local gate. Scans every tracked file, plus the pull request's own title, body and commit messages, for U+2014. |
| `.github/workflows/scorecard.yml` | push to `main`, weekly cron | Thin caller of `cosyte/.github/.github/workflows/scorecard.yml@main`. Supply-chain analysis, SARIF into the Security tab. |

Only `no-emdash.yml` emits a check run on a pull request. `scorecard.yml` never
runs on `pull_request`, and that is a hard constraint rather than a style
choice: `ossf/scorecard-action` validates the ref before it does anything and
exits with "validating options: only default branch is supported" anywhere else.
Measured on this repo's own caller on 2026-08-29 from a throwaway branch. So
that workflow's first real run is the merge to `main`, and there is no way to
prove it green beforehand.

Two notes on the pair, because both are the kind of thing a later reader
otherwise has to rediscover:

- The em-dash gate is NOT a reusable anywhere in the org. `github-profile`'s own
  copy has no `workflow_call` trigger, and hl7, pathways, claude-containers and
  knowledgebase each carry a repo-local copy. So "delegate it to the shared
  pipeline" is not an available move; a repo-local copy is the pattern, not a
  deviation from it. This one is ported from hl7 with the vendored-bytes
  exclusion dropped, since this repo vendors nothing.
- The scorecard caller passes `publish-results: false`, which is the one place
  it differs from the hl7 and `github-profile` callers. The reasoning is written
  out in the workflow file itself.

There is no branch ruleset and no required status check on this repo, also
deliberately. Requiring a context whose workflow has never completed on `main`
strands every pull request with nothing saying why. See the worklist below.

## The org reusables this repo does NOT call yet

Each row names the precondition that unblocks it. None of these is an oversight,
and none should be added until its precondition is met, because each one is red
on arrival on today's tree.

### `cosyte/.github/.github/workflows/ci.yml@main`

**Precondition: this repo has a package manifest, a lockfile, buildable source
and a test suite.**

The reusable's `verify` job runs a fixed ladder against all four: a
frozen-lockfile dependency install, a typecheck, a lint, a format check, a test
run, a gating coverage run, a build, an `attw` check and a dual ESM/CJS smoke
import of the built entrypoint. A repo with no manifest fails at the first rung
and never reaches the rest. There is no input that turns the ladder off; the
inputs it does take (`node-versions`, `os`, `run-phi-scan`, `run-actionlint`,
`run-prepublish-manifest-lint`, `run-prepublish-install`) all assume a package
is there to run against.

Note when this is wired: the reusable's `run-actionlint` input defaults to
`true`, which is how workflow linting arrives in this repo. It is worth knowing
that setting it to `false` does not strand a pull request, it silently
un-requires the gate (a job skipped by a job-level conditional still emits its
check run, concluding `skipped`, which GitHub treats as successful). That is
recorded in the reusable itself and is repeated here because it is the kind of
thing a caller gets wrong once.

### `cosyte/.github/.github/workflows/codeql.yml@main`

**Precondition: this repo contains analyzable JavaScript or TypeScript source.**

The reusable's default `languages` is `["javascript-typescript"]`. CodeQL run
against a tree of markdown extracts no database and the job fails rather than
passing vacuously. Wire it in the same change that lands `src/`.

When it is wired, the caller needs `security-events: write`, `contents: read`
and `actions: read`, because a called workflow can only downgrade the caller's
token. And there is a repo-wide invariant to respect on the other side: every
`github/codeql-action/*` pin in `cosyte/.github` moves together in one commit,
which includes the `upload-sarif` used by the scorecard reusable this repo
already calls.

### The release reusable (`release.yml` in `cosyte/.github`)

**Precondition: this package is publishable, which means a manifest, a version,
a build that produces the published artifact, and a decision that it should go
to the registry at all.**

`dates` publishes nothing today, and `README.md` says so ("Not yet published").
Wiring a release path before there is anything to release is how a broken
`0.0.1` reaches a registry permanently, which the org has already paid for once.

### The drift-check reusable

**Precondition: `dates` is added to `config/drift-manifest.json` as a target,
and the baseline it would be checked against is the one this repo is meant to
meet.**

The manifest names 13 targets today (hl7, mllp, dicom, x12, ccda, ncpdp, fhir,
astm, terminology, transform, cli, deid, synth) and `dates` is not one of them.
It also pins things this repo has nothing to satisfy yet: a `pnpm@10` package
manager prefix, a minimum Node engine major, and a `tsconfig` that extends the
shared base. Two further points from the umbrella decision record of 2026-08-29:
a SECOND, LIGHTER baseline is intended for the repos outside those 13 (this one
included), and drift-check runs advisory during the migration before it flips to
gating. So the honest answer is that the baseline this repo will be measured
against does not exist yet.

## Adding a branch ruleset

**Precondition: the workflow whose context you want to require has completed at
least one run on `main`.**

A required status check naming a context that has never been reported blocks
every pull request indefinitely and shows no reason. `no-emdash.yml` becomes a
sound candidate after its first run on `main`. One caveat carried over from the
gate itself: require the workflow, and understand that its PR-text half is
pull-request only. On a push to `main` that step is skipped by design, because
by then the message is already written.
