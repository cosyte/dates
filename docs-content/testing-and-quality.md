---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/dates: unit tests, runs under several host time zones, package contract tests, executed docs, coverage, and what each misses."
---

# Testing and quality

This page describes how we test `@cosyte/dates`, what each technique catches, and what it cannot.
The rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure that matters most here is a quiet one: a conversion that returns a plausible date a day
or an hour off, with nothing thrown. Most of what follows is aimed at that.

## What we run, and what each technique catches

| Technique                        | What it catches                                                                                                                                                                                                                                                                                                                                                                    | What it cannot catch                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit tests                       | each documented behavior and each refusal of validation and conversion, with exact expected output rather than a shape: every year from -50 to 999 refused, the century rule of the leap year, a skipped and a repeated local time, and every nanosecond count at both ends of the `fraction` range read back exactly                                                              | an input nobody thought to write down                                                                       |
| Hostile input                    | a validator that throws instead of answering: `null`, strings, a JavaScript `Date`, arrays, `NaN`, a getter that throws, a proxy whose every read throws, and components carried on a prototype                                                                                                                                                                                    | an object shape the tests do not build                                                                      |
| Host time zones                  | a result that depends on the machine's zone: the same values are converted in one process under four host zones and in two processes started under different `TZ` values, and the whole suite runs again under `UTC` and under `Pacific/Kiritimati`, fourteen hours ahead                                                                                                          | a host zone outside those runs                                                                              |
| Package contract                 | a package that writes or reaches out: every public function is called, on its happy paths and its refusals, in a child process that must leave stdout, stderr, and its working directory empty; the build must import no filesystem, process, or network module and never call `console`; the package must keep at most one runtime dependency                                     | behavior on a runtime other than Node.js                                                                    |
| Executed docs                    | an example that drifts from the code: the README's usage program runs against the built package and must print exactly the output the README shows, under two host zones; each program in `examples/` checks its own output; and every TypeScript sample on these pages is compiled against the package's types and run against the built package, with its `// =>` values checked | prose that is wrong beside a sample that is right                                                           |
| Coverage gate                    | code no test runs: lines, branches, functions, and statements, each held to a floor that only rises; a line no input can reach carries a comment that says why                                                                                                                                                                                                                     | a test that runs code without checking what it returns                                                      |
| Type checks                      | declarations a consumer cannot resolve: the package is type-checked with strict settings, and its published types are checked for each ES module resolution Node.js and bundlers use                                                                                                                                                                                               | a type that is right but documents the wrong thing                                                          |
| Static analysis                  | a known pattern of bug or vulnerability, through lint rules and CodeQL                                                                                                                                                                                                                                                                                                             | a wrong conversion that is valid code                                                                       |
| PHI scan                         | a realistic patient identifier in a committed file                                                                                                                                                                                                                                                                                                                                 | anything in Markdown, which it does not read; it finds a value after it is written, it does not prevent one |
| Mutation testing                 | a test that runs code but would not notice it changing                                                                                                                                                                                                                                                                                                                             | not yet run on this package; the numbers below say "not measured" until it is                               |
| Property-based tests and fuzzing | an input shape no one wrote down                                                                                                                                                                                                                                                                                                                                                   | not yet run on this package                                                                                 |

## How each one runs

- **Unit tests, hostile input, host time zones, package contract, and executed docs** run in one
  Vitest suite on every pull request, on every push to `main`, and nightly, on Node.js 22, 24, and 26. The suite builds the package first, so the README program, the contract tests, and the doc
  samples run against the build a reader installs.
- **The second host-zone run** repeats the whole suite under two `TZ` values in the same jobs.
- **The coverage gate** runs with the suite, and a floor that is not met fails the pull request.
- **Type checks, lint, the PHI scan, and the examples** run in the same jobs. CodeQL runs as its own
  job on every pull request.
- **The docs test** that runs the samples on these pages also checks that every link between the
  pages reaches a page and a heading, that the reference pages list exactly what the source defines,
  and that no page carries an SSN, phone number, or email address outside the ranges reserved for
  examples, since the PHI scan does not read Markdown.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test              # the suite: unit tests, host zones, package contract, executed docs
pnpm test:coverage     # the same suite with the coverage gate
pnpm test:tz           # the suite under TZ=UTC, then under TZ=Pacific/Kiritimati
pnpm build && pnpm examples
pnpm phi-scan
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
