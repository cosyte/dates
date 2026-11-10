/**
 * The scaling gate for converting a batch of values, from `@cosyte/test-utils/perf`, run by
 * `pnpm test:perf` and never under coverage (see `vitest.perf.config.ts`).
 *
 * It asks one question: does the cost grow faster than the input? On the count axis, 4 times the
 * batches; on the size axis, batches 4 times longer. Each ratio must stay inside the band the shared
 * contract fixes. It does not see a constant-factor slowdown: a conversion 10% slower everywhere
 * passes, and always will. The base against head comparison on a pull request
 * (`bench/dates.bench.mjs`) is the instrument for that.
 *
 * The operation is `toISO` over every value of a batch, which validates each value first, so the
 * gate covers both. The self-check proves these fixtures are large enough for the gate to fail: the
 * same conversion reached quadratically (each value looked up in a cache of the values before it
 * that is searched from its start, rather than keyed) must clear the ceiling at exactly these
 * sizes. Every value is synthetic, built in code by the bench's own `bench/shapes.mjs`.
 */

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { SHAPE_COUNT, values, type BenchValue } from "../../bench/shapes.mjs";
import { toISO } from "../../src/index.js";

type Batch = readonly BenchValue[];

/** The conversion under test: every value of the batch to its ISO 8601 text, kept. */
function convert(batch: Batch): string[] {
  return batch.map((v) => toISO(v.parts));
}

/**
 * The same conversion, reached the wrong way: each value is looked up in a cache of the values
 * converted before it, and the cache is a list searched from its first entry, so the cost grows
 * with the square of the batch length. It returns exactly what `convert` returns, which the
 * self-check confirms before it times anything.
 */
function convertQuadratic(batch: Batch): string[] {
  const seen: { readonly text: string; readonly iso: string }[] = [];
  const out: string[] = [];
  for (const v of batch) {
    let hit: string | undefined;
    for (const entry of seen) {
      if (entry.text === v.text) {
        hit = entry.iso;
        break;
      }
    }
    const iso = hit ?? toISO(v.parts);
    if (hit === undefined) seen.push({ text: v.text, iso });
    out.push(iso);
  }
  return out;
}

/** Both phases, and the self-check, use exactly these fixtures. */
const options: ScalingGateOptions<Batch, string[]> = {
  name: "@cosyte/dates toISO over a batch",
  parse: convert,
  weigh: (out) => out.length,
  // A batch of one value of each shape, as a message carries them: its length does not depend on
  // the index.
  count: { n: 250, generate: (i) => values(i * SHAPE_COUNT, SHAPE_COUNT) },
  size: { inputs: 5, size: 1_000, generate: (i, size) => values(i * size * 4, size) },
};

describe("the scaling gate: toISO over a batch", () => {
  it("has not acquired a complexity regression on either axis", () => {
    const report = scalingGate(options);
    // A skip is not a pass: a gate that could not measure says so here, rather than reading green.
    expect(report.count.status, report.count.diagnostic).toBe("measured");
    expect(report.size.status, report.size.diagnostic).toBe("measured");
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(options, { regressedParse: convertQuadratic });
    expect(report.margin).toBeGreaterThan(1);
  });
});
