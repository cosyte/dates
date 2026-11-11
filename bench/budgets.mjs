// The performance budgets, read from a reading that `pnpm bench:reading --out <file>` wrote:
//   pnpm bench:budgets bench-results/reading.json [--summary <file.md>]
//
// The budgets, each a proposal until the package's numbers show it can be held:
// - peak heap under 20 times the input for a dense shape. Here that is a batch of many values, and
//   the input is the wire text the values were read from;
// - peak heap under 3 times the input for a large opaque payload. This package handles no payload
//   (every value is a handful of numbers), so the table says so rather than reading a number;
// - a cold import under 15 ms;
// - throughput, in bytes a second, not falling by more than half from a benchmark's smallest size to
//   its largest.
// It also prints allocations per value, the number a fix to the per-call work moves.
// It prints Markdown and always exits 0 when it could read the reading: the budgets are advisory,
// and a finding is a number to act on, not a red check. It exits 2 when it cannot read it.

import { readFileSync, writeFileSync } from "node:fs";

import { readResults } from "@cosyte/bench";

const DENSE_PEAK_MULTIPLE = 20;
const COLD_IMPORT_MS = 15;
const THROUGHPUT_KEPT = 0.5;

function isBatch(c) {
  return c.benchmark.endsWith(": batch");
}

/** Values one call handles: the batch size from the label, or 1. */
function valuesPerCall(c) {
  if (!isBatch(c)) return 1;
  return Number(c.size.replace(/[^0-9]/g, ""));
}

/** A case's bytes a second, or why there is none. */
function bytesPerSecond(c) {
  if (c.throughput.status !== "measured") return `skipped (${c.throughput.reason})`;
  return c.throughput.bytesPerSecond ?? "no byte count";
}

function size(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes.toFixed(0)} B`;
}

function main(argv) {
  const file = argv[0];
  if (file === undefined) {
    process.stderr.write("usage: node bench/budgets.mjs <reading.json> [--summary <file.md>]\n");
    return 2;
  }
  const summaryAt = argv.indexOf("--summary");
  const summary = summaryAt === -1 ? undefined : argv[summaryAt + 1];
  let doc;
  try {
    doc = readResults(readFileSync(file, "utf8"));
  } catch (error) {
    process.stderr.write(
      `could not read ${file}: ${error instanceof Error ? error.name : "error"}\n`,
    );
    return 2;
  }
  if (doc.kind !== "reading") {
    process.stderr.write(`${file} is a ${doc.kind}, not a reading\n`);
    return 2;
  }
  const { cases, importCost } = doc.reading;
  const lines = [
    "### Budgets",
    "",
    `Peak heap is one call's peak above the settled heap, over the bytes of wire text that call's values were read from. The budget is ${String(DENSE_PEAK_MULTIPLE)} times for a dense shape, a batch; a one-value call is shown beside it, and is not held to it. The budget of 3 times for a large opaque payload does not apply: no value this package handles carries one.`,
    "",
    "| Benchmark | Size | Input | Peak heap | Multiple | Budget | Within | Allocated a value |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of cases) {
    if (c.bytesPerPass === null) continue;
    const perInput = c.bytesPerPass / c.inputsPerPass;
    const alloc =
      c.allocations !== null && c.allocations.status === "measured"
        ? size(c.allocations.heapBytesPerOp / valuesPerCall(c))
        : "not measured";
    if (c.peak === null || c.peak.status !== "measured") {
      lines.push(
        `| ${c.benchmark} | ${c.size} | ${size(perInput)} | not measured | n/a | n/a | not measured | ${alloc} |`,
      );
      continue;
    }
    const multiple = c.peak.peakHeapBytes / perInput;
    const held = isBatch(c);
    lines.push(
      `| ${c.benchmark} | ${c.size} | ${size(perInput)} | ${size(c.peak.peakHeapBytes)} | ${multiple.toFixed(1)}x | ${held ? `${String(DENSE_PEAK_MULTIPLE)}x` : "none"} | ${held ? (multiple < DENSE_PEAK_MULTIPLE ? "yes" : "**no**") : "n/a"} | ${alloc} |`,
    );
  }

  lines.push(
    "",
    `Throughput from a benchmark's smallest size to its largest; the budget keeps at least ${String(THROUGHPUT_KEPT * 100)}% of it.`,
    "",
    "| Benchmark | Smallest | Largest | Bytes/s, smallest | Bytes/s, largest | Kept | Within |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  const byBenchmark = new Map();
  for (const c of cases) {
    const list = byBenchmark.get(c.benchmark) ?? [];
    list.push(c);
    byBenchmark.set(c.benchmark, list);
  }
  for (const [benchmark, list] of byBenchmark) {
    if (list.length < 2) continue;
    const first = list[0];
    // The largest size whose throughput was measured. A size whose single call is longer than a
    // warmup batch may not settle (`warmup-unstable`): the row then reads the largest size that did,
    // and bench/profile.mjs times the largest size the simpler way.
    const measured = list.filter((c) => typeof bytesPerSecond(c) === "number");
    const last = measured.length > 1 ? measured[measured.length - 1] : list[list.length - 1];
    const small = bytesPerSecond(first);
    const large = bytesPerSecond(last);
    if (typeof small === "string" || typeof large === "string") {
      // A skip is not a pass: the row says what could not be measured.
      const cell = (v) => (typeof v === "string" ? v : `${size(v)}/s`);
      lines.push(
        `| ${benchmark} | ${first.size} | ${last.size} | ${cell(small)} | ${cell(large)} | n/a | not measured |`,
      );
      continue;
    }
    const kept = large / small;
    lines.push(
      `| ${benchmark} | ${first.size} | ${last.size} | ${size(small)}/s | ${size(large)}/s | ${(kept * 100).toFixed(0)}% | ${kept >= THROUGHPUT_KEPT ? "yes" : "**no**"} |`,
    );
  }

  lines.push("");
  if (importCost === null) {
    lines.push("Cold import: not measured in this reading.");
  } else {
    const own = importCost.medianMs - importCost.emptyMedianMs;
    lines.push(
      `Cold import: median ${importCost.medianMs.toFixed(2)} ms, ${own.toFixed(2)} ms above an empty module's ${importCost.emptyMedianMs.toFixed(2)} ms; budget ${String(COLD_IMPORT_MS)} ms: ${importCost.medianMs < COLD_IMPORT_MS ? "within" : "**over**"}. Loaded ${String(importCost.files.length)} file(s), ${size(importCost.totalBytes)}, ${size(importCost.totalGzipBytes)} gzipped.`,
    );
  }
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (summary !== undefined) writeFileSync(summary, text);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
