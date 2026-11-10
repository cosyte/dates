// Benchmarks for @cosyte/dates, on @cosyte/bench, against the built entry a consumer imports.
//
// A reading of this build (throughput, latency p50/p95/p99, allocations, peak heap, a long run for
// leaks, and the cold import with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --out bench-results/reading.json
// One benchmark or one case only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --only "toISO: batch"
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.js --head dist/index.js
// The budgets, and the single-run numbers and CPU and heap profile of the hottest paths:
//   pnpm bench:budgets bench-results/reading.json
//   pnpm bench:profile
// On a pull request CI runs the comparison in its bench-compare job, and the bench-reading workflow
// takes a reading and a profile on a GitHub-hosted runner. Both are advisory: they post their
// numbers and fail nothing.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds. Every value is synthetic and built in code by bench/shapes.mjs: no file is read.
//
// Each operation is measured two ways. "One value" is what a parser does for one field: the input
// is one date-parts value, and a pass is 256 of them, one call each. "Batch" is what a caller does
// with a message, a file or a feed: the input is a list of values in the mix real traffic has, and
// the call converts every one of them and keeps the results, as a caller does. The byte count of a
// case is the length of the wire text its values were read from.

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import { bytesOf, hasMonth, hasTime, values, zoneFor } from "./shapes.mjs";

/** Values a "one value" pass calls the operation on, one call each. */
const ONE_VALUE_INPUTS = 256;

/**
 * The operations. `keep` says which values of the mix the operation accepts: `toTemporal` refuses
 * a year-only value and `toInstant` a value with no time of day, by design, so neither is handed one.
 * `batches` are the batch sizes, smallest first: a message's worth, a file's worth, and a feed's
 * worth that only a reading measures (`compare: false`), because a pull request's comparison runs
 * every case 24 times in fresh processes and its budget is 600 seconds.
 *
 * `toInstant` is the slowest call by two orders of magnitude (see the profile), so its sizes are
 * smaller: a call over 2,048 values takes about as long as `toISO` over 65,536.
 */
const OPERATIONS = [
  {
    name: "validateParts",
    keep: () => true,
    call: (dates) => (x) => dates.validateParts(x.parts),
    batches: [64, 1_024, 16_384, 65_536],
  },
  {
    name: "toISO",
    keep: () => true,
    call: (dates) => (x) => dates.toISO(x.parts),
    batches: [64, 1_024, 16_384, 65_536],
  },
  {
    name: "toTemporal",
    keep: hasMonth,
    call: (dates) => (x) => dates.toTemporal(x.parts),
    batches: [64, 1_024, 8_192],
  },
  {
    // A value's own offset wins; a value without one is placed in the feed's zone.
    name: "toInstant",
    keep: hasTime,
    call: (dates) => (x) => dates.toInstant(x.parts, x.options),
    batches: [16, 256, 2_048],
  },
];

/** `count` values of the mix the operation accepts, each with the options its call takes. */
function inputsFor(op, start, count) {
  const out = [];
  for (let i = start; out.length < count; i += 1) {
    const [v] = values(i, 1);
    if (op.keep(v)) out.push({ parts: v.parts, options: zoneFor(v), text: v.text });
  }
  return out;
}

function label(count) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "value" : "values"}`;
}

const benchmarks = [];
for (const op of OPERATIONS) {
  benchmarks.push(
    defineBenchmark({
      name: `${op.name}: one value`,
      sizes: [
        {
          label: label(1),
          build: () => {
            const inputs = inputsFor(op, 0, ONE_VALUE_INPUTS);
            return { inputs, bytes: bytesOf(inputs) };
          },
        },
      ],
      bind: op.call,
    }),
    defineBenchmark({
      name: `${op.name}: batch`,
      sizes: op.batches.map((count, index) => ({
        label: label(count),
        // Only the smallest batch is compared on a pull request; a reading measures every size.
        compare: index === 0,
        build: () => {
          // Two batches, so a pass is not one list repeated, from different starts in the mix.
          const inputs = [inputsFor(op, 0, count), inputsFor(op, count * 7 + 3, count)];
          return { inputs, bytes: inputs.reduce((n, list) => n + bytesOf(list), 0) };
        },
      })),
      bind: (dates) => {
        const one = op.call(dates);
        return (list) => list.map(one);
      },
      weigh: (results) => results.length,
    }),
  );
}

export default defineSuite({ name: "@cosyte/dates", benchmarks });
