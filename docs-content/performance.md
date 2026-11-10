---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/dates and how, what each call does in work, and how to time it on your own machine."
---

# Performance

This page describes what we measure on `@cosyte/dates`, how, and how to time it yourself. The
shared method every Cosyte package follows (throughput, latency percentiles, memory, import time and
bundle size, and how a pull request is compared with `main`) is written down in the performance
standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What we measure

We do not run benchmarks on `@cosyte/dates` yet, and no CI job guards its speed. The performance
standard names what a benchmark measures: throughput, latency at the 50th, 95th, and 99th
percentiles, peak memory, import time, and bundle size. For this package, each of those reads "not
measured" in the section below until a benchmark runs on it.

## What each call does

Every call works on one value and keeps nothing between calls: there is no cache and no shared
state.

- **Validation** (`validateParts`, `isValidParts`, `assertValidParts`, `precisionOf`) reads each of
  the eight named components once and checks it against its range. A `fraction` is also turned into
  its decimal spelling to count its digits. Nothing else is read, whatever else the object carries.
- **`toISO`** validates the value, then builds the string from the components. It makes no Temporal
  object.
- **`toTemporal`** validates the value, then makes one Temporal object.
- **`toZonedDateTime` and `toInstant`** validate the value, check a `timeZone` option by converting a
  fixed instant into it, then convert the local time twice, once with Temporal's "earlier" rule and
  once with its "later" rule, to find a daylight-saving gap or repeat. They do the most work of any
  call here.

Every converter validates its own argument. If you validate a value and then convert it, it is
validated twice. That is what lets a converter refuse an invalid value on its own.

## Import cost

The package has one runtime dependency, `temporal-polyfill`, which it imports as a module and does
not install as a global. Importing `@cosyte/dates` loads that polyfill. The package is marked free
of side effects, so a bundler can leave out the parts of it you do not import.

## What these numbers are not

- **Not a guarantee for your machine.** Absolute times depend on the hardware and its load.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.

## Time it yourself

This program times converting a batch of local times to instants on your machine. It prints the
time and checks only that every value was converted:

```ts runnable
import { toInstant } from "@cosyte/dates";

const values = Array.from({ length: 1000 }, (_, index) => ({
  year: 2026,
  month: 3,
  day: 9,
  hour: index % 24,
  minute: index % 60,
}));

const start = performance.now();
const instants = values.map((value) => toInstant(value, { timeZone: "America/Chicago" }));
const elapsed = performance.now() - start;

console.log(`${String(instants.length)} instants in ${elapsed.toFixed(1)} ms`);
instants.length; // => 1000
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
