// The time a value of each operation takes at its smallest and largest batch, then a CPU profile
// and a sampled heap profile of the hottest paths, with the top functions of each:
//   pnpm build && pnpm bench:profile [--out <dir>] [--summary <file.md>]
//
// Each workload is warmed, then profiled on its own for about two seconds through the inspector
// (node:inspector/promises), so a function's share is a share of that workload alone. With
// --enable-source-maps and the build's source map beside it, a function in this package is named by
// its src/ file and line; one in temporal-polyfill by its built file. `--out` keeps every
// .cpuprofile and .heapprofile for a profiler's own view (Chrome DevTools, speedscope). The inputs
// are the bench's own, from bench/shapes.mjs: synthetic, built in code.

import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { findSourceMap } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ZONE, bytesOf, hasMonth, hasTime, values } from "./shapes.mjs";

const PROFILE_MS = 2_000;
const WARMUP_MS = 500;
const TOP = 10;
const SAMPLES = 9;
const SAMPLE_MS = 100;

function args(argv) {
  const out = { target: argv[0], dir: undefined, summary: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--summary") out.summary = argv[++i];
  }
  return out;
}

/** Run `pass` until `ms` have gone by; returns how many passes ran. */
function runFor(pass, ms) {
  const end = performance.now() + ms;
  let passes = 0;
  let sink = 0;
  while (performance.now() < end) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return passes;
}

/** Milliseconds a pass, one sample: whole passes until at least `SAMPLE_MS` have gone by. */
function sample(pass) {
  const start = performance.now();
  let passes = 0;
  let sink = 0;
  while (performance.now() - start < SAMPLE_MS) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return (performance.now() - start) / passes;
}

function median(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The median milliseconds a pass of `pass`, warmed, one workload at a time. */
function msPerPass(pass) {
  runFor(pass, WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) samples.push(sample(pass));
  return median(samples);
}

function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Where a call frame is: its src/ file and line through the source map when there is one. */
function locate(frame) {
  const line = frame.lineNumber;
  if (frame.url === "") return "(native)";
  let where = frame.url;
  try {
    const path = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
    const map = findSourceMap(path);
    const entry = map?.findEntry(line, frame.columnNumber);
    if (entry !== undefined && entry.originalSource !== undefined) {
      const source = entry.originalSource.replace(/^.*?(src\/)/, "$1");
      return `${source}:${String(entry.originalLine + 1)}`;
    }
    where = path.replace(/^.*?(dist\/|bench\/|temporal-polyfill\/|node_modules\/)/, "$1");
  } catch {
    // An unparseable URL keeps its own text.
  }
  return `${where}:${String(line + 1)}`;
}

function key(frame) {
  return `${frame.functionName === "" ? "(anonymous)" : frame.functionName} ${locate(frame)}`;
}

function isProfilerFrame(frame) {
  return (
    frame.url.startsWith("node:inspector") ||
    frame.functionName === "(program)" ||
    frame.functionName === "(idle)"
  );
}

/** Self time by function, from a CPU profile: the share of samples each one was on top. */
function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const k = key(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + dt);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

/**
 * Total time by function, from a CPU profile: the share of samples each one was anywhere on the
 * stack. Self time spreads the polyfill's work over many small functions; this says which of this
 * package's calls it was done for.
 */
function topTotalTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const totalOf = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const seen = new Set();
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const frame = byId.get(id).callFrame;
      if (frame.url === "" || !frame.url.includes("/dist/")) continue;
      const k = key(frame);
      if (seen.has(k)) continue;
      seen.add(k);
      totalOf.set(k, (totalOf.get(k) ?? 0) + dt);
    }
  }
  return [...totalOf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

/** Bytes allocated by function, from a sampled heap profile (sampled, so an estimate). */
function topAllocations(profile) {
  const self = new Map();
  let total = 0;
  const walk = (node) => {
    if (!isProfilerFrame(node.callFrame) && node.selfSize > 0) {
      const k = key(node.callFrame);
      self.set(k, (self.get(k) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  return {
    total,
    top: [...self.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([name, bytes]) => ({ name, share: total === 0 ? 0 : bytes / total })),
  };
}

function cell(entry, value) {
  return entry === undefined ? "" : value(entry);
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.target === undefined) {
    process.stderr.write(
      "usage: node bench/profile.mjs <dist/index.js> [--out <dir>] [--summary <file.md>]\n",
    );
    return 2;
  }
  const dates = await import(pathToFileURL(resolve(options.target)).href);

  /** `count` values of the mix that `keep` accepts. */
  const pick = (keep, count) => {
    const out = [];
    for (let i = 0; out.length < count; i++) {
      const [v] = values(i, 1);
      if (keep(v)) out.push(v);
    }
    return out;
  };
  const all = () => true;
  const zoned = { timeZone: ZONE };
  const ownOffset = (v) => hasTime(v) && v.parts.offsetMinutes !== undefined;
  const noOffset = (v) => hasTime(v) && v.parts.offsetMinutes === undefined;

  // Each operation at the smallest and the largest batch bench/dates.bench.mjs reads.
  const operations = [
    {
      name: "validateParts",
      keep: all,
      call: (v) => dates.validateParts(v.parts),
      sizes: [64, 65_536],
    },
    { name: "toISO", keep: all, call: (v) => dates.toISO(v.parts), sizes: [64, 65_536] },
    {
      name: "toTemporal",
      keep: hasMonth,
      call: (v) => dates.toTemporal(v.parts),
      sizes: [64, 8_192],
    },
    {
      name: "toInstant, own offset",
      keep: ownOffset,
      call: (v) => dates.toInstant(v.parts),
      sizes: [16, 2_048],
    },
    {
      name: `toInstant, ${ZONE}`,
      keep: noOffset,
      call: (v) => dates.toInstant(v.parts, zoned),
      sizes: [16, 2_048],
    },
  ];

  const lines = [
    "### Time a value, smallest and largest batch",
    "",
    `Node ${process.version}. Each batch warmed, then the median of ${String(SAMPLES)} samples of at least ${String(SAMPLE_MS)} ms of whole passes, one batch at a time, in one process. A pass converts every value of the batch and keeps the results.`,
    "",
    "| Operation | Smallest | Largest | us a value, smallest | us a value, largest | Bytes/s, smallest | Bytes/s, largest | Kept |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const op of operations) {
    const rows = op.sizes.map((count) => {
      const batch = pick(op.keep, count);
      const ms = msPerPass(() => batch.map(op.call).length);
      return { count, us: (ms * 1000) / count, rate: bytesOf(batch) / (ms / 1000) };
    });
    const [small, large] = rows;
    lines.push(
      `| ${op.name} | ${small.count.toLocaleString("en-US")} | ${large.count.toLocaleString("en-US")} | ${small.us.toFixed(2)} | ${large.us.toFixed(2)} | ${mib(small.rate)}/s | ${mib(large.rate)}/s | ${((large.rate / small.rate) * 100).toFixed(0)}% |`,
    );
  }

  // The workloads profiled: each operation over a batch of the mix it accepts, a few thousand values.
  const workloads = operations.map((op) => {
    const batch = pick(op.keep, op.name.startsWith("toInstant") ? 512 : 4_096);
    return {
      name: `${op.name}: ${batch.length.toLocaleString("en-US")} values`,
      values: batch.length,
      pass: () => batch.map(op.call).length,
    };
  });

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("HeapProfiler.enable");
  if (options.dir !== undefined) mkdirSync(options.dir, { recursive: true });

  lines.push(
    "",
    "### CPU and heap profile of the hottest paths",
    "",
    `Node ${process.version}. Each workload warmed for ${String(WARMUP_MS)} ms, then profiled alone for ${String(PROFILE_MS)} ms: self time and total time (this package's functions only) from a CPU profile sampled every 100 us, and allocation from a sampled heap profile (an estimate, collected objects included).`,
  );
  for (const [index, w] of workloads.entries()) {
    runFor(w.pass, WARMUP_MS);
    // The heap sampler starts first and stops last, so the CPU profile holds the workload and not
    // the sampler's own start and stop. It keeps what a collection freed, so a function is charged
    // for everything it allocated, not only for what was still alive at the end.
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 16_384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    await session.post("Profiler.start");
    const passes = runFor(w.pass, PROFILE_MS);
    const { profile: cpu } = await session.post("Profiler.stop");
    const { profile: heap } = await session.post("HeapProfiler.stopSampling");
    if (options.dir !== undefined) {
      writeFileSync(resolve(options.dir, `${String(index + 1)}.cpuprofile`), JSON.stringify(cpu));
      writeFileSync(resolve(options.dir, `${String(index + 1)}.heapprofile`), JSON.stringify(heap));
    }
    const cpuTop = topSelfTime(cpu);
    const ownTop = topTotalTime(cpu);
    const heapTop = topAllocations(heap);
    const perValue = heapTop.total / (passes * w.values);
    lines.push(
      "",
      `#### ${String(index + 1)}. ${w.name}`,
      "",
      `${String(passes)} passes in ${String(PROFILE_MS)} ms, ${((PROFILE_MS * 1000) / (passes * w.values)).toFixed(2)} us a value under the profiler; about ${perValue.toFixed(0)} bytes allocated a value (sampled).`,
      "",
      "| Self time | Function | Total time | This package's function | Allocated | Function |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (let i = 0; i < TOP; i++) {
      const c = cpuTop[i];
      const o = ownTop[i];
      const h = heapTop.top[i];
      const share = (e) => `${(e.share * 100).toFixed(1)}%`;
      const name = (e) => `\`${e.name}\``;
      lines.push(
        `| ${cell(c, share)} | ${cell(c, name)} | ${cell(o, share)} | ${cell(o, name)} | ${cell(h, share)} | ${cell(h, name)} |`,
      );
    }
  }
  session.disconnect();
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.summary !== undefined) writeFileSync(options.summary, text);
  return 0;
}

process.exitCode = await main();
