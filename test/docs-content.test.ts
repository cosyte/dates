import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { docSnippetSuite, extractRunnableSnippets } from "@cosyte/vitest-config/snippets";

import * as api from "../src/index.js";
import { toISO, validateParts } from "../src/index.js";
import { distEntry, packageRoot as root } from "./support/paths.js";
import { fencedBlock, readReadme, section } from "./support/readme.js";
import { READS_BUILD } from "./support/runtime.js";

/**
 * The docs.cosyte.com pages in `docs-content/`, held to the code they describe.
 *
 * - Every TypeScript and JavaScript sample on a hand-written page runs, through the shared sample
 *   runner, against the BUILT package (`dist/index.js`, which `test/global-setup.ts` builds and
 *   which is what an installer loads).
 * - Every sample also compiles against the package's types, with the repository's strict settings:
 *   the runner strips types without checking them.
 * - Every link between pages resolves, heading anchor included, and so does every link into the
 *   generated reference under `docs-content/api/`.
 * - No page carries a value shaped like real contact or identity data: `pnpm phi-scan` does not read
 *   Markdown.
 * - The two reference pages list exactly what the source defines.
 * - The Quickstart page opens with the README's usage program and its output.
 *
 * The generated `api/` pages are not passed to the runner: their `@example` blocks are fragments
 * written for an editor's tooltip, and `cosyte-docs-reference --check` holds them to the source.
 */
const docsDir = join(root, "docs-content");
const apiDir = join(docsDir, "api");

/**
 * The built entry point with forward slashes: the runner writes it into a sample's `from "..."`,
 * where a Windows backslash would be read as an escape. Unchanged on Linux and macOS.
 */
const resolve = (specifier: string): string | undefined =>
  specifier === "@cosyte/dates" ? distEntry.replaceAll("\\", "/") : undefined;

/** The hand-written pages: every `.md` file at the top of `docs-content/`, not the generated `api/`. */
const pages = readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => join(docsDir, name));

/** A page's text, by its file name. */
const page = (name: string): string => readFileSync(join(docsDir, name), "utf8");

/** A page's name relative to `docs-content/`, for a failure message. */
const shortName = (path: string): string => path.slice(docsDir.length + 1);

/**
 * `every` runs each TypeScript and JavaScript sample whether or not it is tagged `runnable`, and
 * lists a `no-run` sample as skipped with its reason. It reaches the runner through a variable
 * rather than a literal so the line compiles against a `@cosyte/vitest-config` that predates the
 * option; such a runner ignores it and runs the `runnable` blocks, which is every sample here that
 * can run, as the test below holds.
 */
const suiteOptions = { files: pages, every: true, resolve };
// The samples run against the build, so not under Deno, where there is none (see
// `support/runtime.ts`); they still compile against the types below.
if (READS_BUILD) docSnippetSuite(suiteOptions);

/** One fenced block of a page: its language, the words after it, its body, and its line. */
interface Fence {
  readonly lang: string;
  readonly tags: readonly string[];
  readonly body: string;
  readonly line: number;
}

/** Every fenced block in a page, in order. */
function fences(markdown: string): Fence[] {
  const lines = markdown.split(/\r?\n/);
  const found: Fence[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lines[i] ?? "");
    if (open === null) continue;
    const [, indent = "", marker = "", info = ""] = open;
    const words = info.trim().split(/\s+/).filter(Boolean);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const line = lines[j] ?? "";
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close !== null && (close[1] ?? "").startsWith(marker[0] ?? "`")) break;
      body.push(line.startsWith(indent) ? line.slice(indent.length) : line);
    }
    found.push({ lang: words[0] ?? "", tags: words.slice(1), body: body.join("\n"), line: i + 1 });
    i = j;
  }
  return found;
}

/** A page with its fenced blocks blanked out, so prose checks do not read code. */
function prose(markdown: string): string {
  let inFence = false;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/** The fence languages that make a block a code sample, as the docs-content standard names them. */
const SAMPLE_LANGS: ReadonlySet<string> = new Set([
  "ts",
  "typescript",
  "tsx",
  "js",
  "javascript",
  "mjs",
]);

/** Every sample on every hand-written page. */
const samples = pages.flatMap((path) =>
  fences(readFileSync(path, "utf8"))
    .filter((fence) => SAMPLE_LANGS.has(fence.lang))
    .map((fence) => ({ ...fence, page: shortName(path) })),
);

/** The TypeScript errors in a set of samples, compiled with the repository's own settings. */
function compileErrors(sources: ReadonlyMap<string, string>): string[] {
  const configPath = join(root, "tsconfig.json");
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    { noEmit: true, moduleDetection: ts.ModuleDetectionKind.Force },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  if (parsed === undefined) throw new Error(`${configPath} could not be read`);

  const host = ts.createCompilerHost(parsed.options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, onError, create) => {
    const text = sources.get(file);
    return text === undefined
      ? getSourceFile(file, language, onError, create)
      : ts.createSourceFile(file, text, language, true);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => sources.has(file) || fileExists(file);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => sources.get(file) ?? readFile(file);

  const program = ts.createProgram([...sources.keys()], parsed.options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file !== undefined && sources.has(d.file.fileName))
    .map((d) => {
      const at = d.file?.getLineAndCharacterOfPosition(d.start ?? 0).line ?? 0;
      const text = ts.flattenDiagnosticMessageText(d.messageText, " ");
      return `${d.file?.fileName ?? ""}:${String(at + 1)} TS${String(d.code)} ${text}`;
    });
}

/**
 * Where a sample is compiled: a file that is never written, beside the tests. With forward
 * slashes, as TypeScript names every file it asks the host for, so the map of sources is found on
 * Windows too.
 */
const sampleFile = (pageName: string, line: number): string =>
  join(root, "test", `.docs-sample-${pageName.replace(/\.md$/, "")}-${String(line)}.ts`).replaceAll(
    "\\",
    "/",
  );

describe("every sample on a hand-written page", () => {
  it("runs, or names in its fence why it cannot", () => {
    const unaccounted: string[] = [];
    for (const sample of samples) {
      const noRun = sample.tags.indexOf("no-run");
      const reason = noRun === -1 ? "" : sample.tags.slice(noRun + 1).join(" ");
      if (sample.tags.includes("runnable") ? noRun !== -1 : reason === "") {
        unaccounted.push(`${sample.page}:${String(sample.line)}`);
      }
    }
    expect(samples.length).toBeGreaterThan(25);
    expect(unaccounted).toEqual([]);
  });

  it(
    "compiles against the package's types, with the repository's strict settings",
    { timeout: 120_000 },
    () => {
      const sources = new Map(samples.map((s) => [sampleFile(s.page, s.line), s.body]));
      expect(sources.size).toBe(samples.length);
      expect(compileErrors(sources)).toEqual([]);
    },
  );

  it(
    "fails to compile when a sample misuses the types, so the check above can fail",
    { timeout: 120_000 },
    () => {
      const wrong = 'import { toISO } from "@cosyte/dates";\ntoISO({ year: 1988 }).getTime();\n';
      const errors = compileErrors(new Map([[sampleFile("self-test", 1), wrong]]));
      expect(errors).toEqual([expect.stringContaining("TS2339")]);
    },
  );
});

/**
 * The anchor the docs site gives a heading, as github-slugger computes it: lower-cased, every
 * character that is not a letter, a digit, `_`, a space or a hyphen dropped (code ticks and
 * parentheses included), and each space made a hyphen. A repeated one is numbered from `-1`.
 */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const result = new Set<string>();
  for (const line of prose(markdown).split("\n")) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading === null) continue;
    const base = (heading[1] ?? "")
      .replace(/\\(.)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_ -]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return result;
}

/** What is wrong with one link target on a page, or null when it resolves. */
function linkFault(from: string, target: string): string | null {
  if (/^https:\/\//.test(target)) return null;
  if (target.startsWith("#")) {
    return anchors(page(from)).has(target.slice(1)) ? null : "names no heading on this page";
  }
  const shaped = /^\.\/((?:api\/(?:[^/#.][^/#]*\/)*)?[^/#]+\.md)(?:#(.+))?$/.exec(target);
  if (shaped === null) return "is not written as ./<page>.md, ./api/<page>.md or #<anchor>";
  const file = join(docsDir, shaped[1] ?? "");
  if (!existsSync(file)) return "resolves to no page";
  const anchor = shaped[2];
  if (anchor !== undefined && !anchors(readFileSync(file, "utf8")).has(anchor)) {
    return "names no heading on that page";
  }
  return null;
}

describe("every link on a hand-written page", () => {
  it("resolves to a page, and to a heading on it when it names one", () => {
    const broken: string[] = [];
    let checked = 0;
    for (const path of pages) {
      const name = shortName(path);
      for (const match of prose(readFileSync(path, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1] ?? "";
        checked += 1;
        const fault = linkFault(name, target);
        if (fault !== null) broken.push(`${name}: ${target} ${fault}`);
      }
    }
    expect(checked).toBeGreaterThan(60);
    expect(broken).toEqual([]);
  });

  it("reaches the generated reference, and refuses a target that does not resolve", () => {
    expect(existsSync(join(apiDir, "README.md"))).toBe(true);
    expect(linkFault("intro.md", "./api/README.md#toinstant")).toBeNull();
    expect(linkFault("intro.md", "./api/README.md#precision_ladder")).toBeNull();
    expect(linkFault("intro.md", "./api/README.md#no-such-export")).not.toBeNull();
    expect(linkFault("intro.md", "./no-such-page.md")).not.toBeNull();
    expect(linkFault("intro.md", "./quickstart")).not.toBeNull();
    expect(linkFault("intro.md", "#no-such-heading")).not.toBeNull();
  });
});

/** A dashed SSN; only the 900 series is invalid, so any other area could be a real number. */
const SSN = /\b(\d{3})-\d{2}-\d{4}\b/g;
/** A full NANP phone number; only `555-0100` to `555-0199` is reserved for fiction. */
const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}-)(\d{3})-(\d{4})\b/g;
/** An email address. */
const EMAIL = /[\w.+-]+@((?:[\w-]+\.)+[a-z]{2,})\b/gi;
/** The domains reserved for examples and testing (RFC 2606, RFC 6761). */
const RESERVED_DOMAIN = /^(?:example\.(?:com|net|org)|.*\.(?:test|example|invalid|localhost))$/i;

/** Every value on a page shaped like real contact or identity data. */
function sampleDataFindings(name: string, text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(SSN)) {
    if (!(m[1] ?? "").startsWith("9")) found.push(`${name}: SSN ${m[0]}`);
  }
  for (const m of text.matchAll(PHONE)) {
    if (m[1] !== "555" || !(m[2] ?? "").startsWith("01")) found.push(`${name}: phone ${m[0]}`);
  }
  for (const m of text.matchAll(EMAIL)) {
    if (!RESERVED_DOMAIN.test(m[1] ?? "")) found.push(`${name}: email ${m[0]}`);
  }
  return found;
}

describe("the sample data on the pages", () => {
  it("holds no SSN, phone number or email address outside the reserved ranges", () => {
    const found = pages.flatMap((path) =>
      sampleDataFindings(shortName(path), readFileSync(path, "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("would refuse a value outside them", () => {
    // The refused values are assembled at run time so this file holds no literal the repository's
    // own PHI scan would flag; each is shaped like real data on purpose, and none is anyone's.
    const dash = (...parts: string[]): string => parts.join("-");
    expect(sampleDataFindings("x", dash("123", "45", "6789"))).toHaveLength(1);
    expect(sampleDataFindings("x", "(212) 555-1212")).toHaveLength(1);
    expect(sampleDataFindings("x", ["someone", "mail.invalid-domain.org"].join("@"))).toHaveLength(
      1,
    );
    expect(
      sampleDataFindings("x", `${dash("987", "00", "4320")} (528) 555-0105 a@example.org`),
    ).toEqual([]);
  });
});

/** The rows of the first Markdown table after a heading, each split into its trimmed cells. */
function tableAfter(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(`\n${heading}\n`);
  expect(start, `no "${heading}" heading`).toBeGreaterThan(-1);
  const rows: string[][] = [];
  for (const line of markdown.slice(start + heading.length + 2).split("\n")) {
    if (!line.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    rows.push(
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  }
  // Drop the header row and the divider.
  return rows.slice(2);
}

/** A cell's code span, without its ticks. */
const code = (cell: string | undefined): string => /^`([^`]+)`/.exec(cell ?? "")?.[1] ?? "";

/** The string members of the `IssueCode` union, read from the source. */
function issueCodes(): string[] {
  const source = readFileSync(join(root, "src", "types.ts"), "utf8");
  const start = source.indexOf("export type IssueCode =");
  const end = source.indexOf(";", start);
  return [...source.slice(start, end).matchAll(/\|\s*"([a-z-]+)"/g)].map((m) => m[1] ?? "");
}

describe("the errors and issue codes page", () => {
  const text = page("errors-and-issue-codes.md");

  it("lists exactly the issue codes the source defines", () => {
    const listed = tableAfter(text, "## Issue codes").map((row) => code(row[0]));
    expect(issueCodes()).toHaveLength(11);
    expect([...listed].sort()).toEqual(issueCodes().sort());
  });

  it("lists every exported error class, and the two built-ins, each with a heading", () => {
    const exported = Object.entries(api)
      .filter(([, value]) => typeof value === "function" && value.prototype instanceof Error)
      .map(([name]) => name);
    expect(exported).toHaveLength(4);
    const expected = [...exported, "RangeError", "TypeError"].sort();
    const listed = tableAfter(text, "## Errors").map((row) => code(row[0]));
    expect([...listed].sort()).toEqual(expected);
    const headed = [...text.matchAll(/^### `([A-Za-z]+)`$/gm)].map((m) => m[1]);
    expect([...headed].sort()).toEqual(expected);
  });
});

describe("the date-parts contract page", () => {
  const text = page("date-parts-contract.md");

  it("gives each integer component the range validation enforces, at both ends", () => {
    const rows = tableAfter(text, "## Components");
    expect(rows.map((row) => code(row[0]))).toEqual([...api.PRECISION_LADDER, "offsetMinutes"]);
    // A full value at second precision with an offset, in January, so every bound has a context
    // in which it is valid: 31 January exists.
    const base = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0, offsetMinutes: 0 };
    for (const row of rows) {
      const name = code(row[0]);
      if (name === "fraction") continue;
      const range = /^(-?\d+) to (-?\d+)$/.exec(row[1] ?? "");
      expect(range, `${name}: ${row[1] ?? ""}`).not.toBeNull();
      const [low, high] = [Number(range?.[1]), Number(range?.[2])];
      expect(validateParts({ ...base, [name]: low }).valid, `${name} ${String(low)}`).toBe(true);
      expect(validateParts({ ...base, [name]: high }).valid, `${name} ${String(high)}`).toBe(true);
      expect(validateParts({ ...base, [name]: low - 1 }).valid).toBe(false);
      expect(validateParts({ ...base, [name]: high + 1 }).valid).toBe(false);
    }
  });

  it("gives fraction the range validation enforces", () => {
    const second = { year: 2000, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    expect(validateParts({ ...second, fraction: 0 }).valid).toBe(true);
    expect(validateParts({ ...second, fraction: 0.999999999 }).valid).toBe(true);
    expect(validateParts({ ...second, fraction: 1 }).valid).toBe(false);
    expect(validateParts({ ...second, fraction: -0.1 }).valid).toBe(false);
  });

  it("shows what toISO renders for each example value", () => {
    const rows = tableAfter(text, "## What `toISO` renders");
    expect(rows.length).toBeGreaterThanOrEqual(api.PRECISION_LADDER.length);
    for (const row of rows) {
      // `{ year: 1988, month: 5 }` read as JSON once its keys are quoted.
      const value: unknown = JSON.parse(code(row[1]).replace(/(\w+):/g, '"$1":'));
      expect(api.precisionOf(value)).toBe(code(row[0]));
      expect(toISO(value)).toBe(code(row[2]));
    }
  });
});

/**
 * The README's usage program is what a reader runs from npm, and the Quickstart page is what the
 * same reader runs from the docs site. Two first programs that disagree send a reader two ways at
 * once, so the page must open with the README's program and its output, byte for byte.
 * `test/readme.test.ts` runs the README's program and compares its output; the sweep above runs the
 * page's.
 */
describe("the Quickstart page opens with the README's usage program", () => {
  const usage = section(readReadme(), "Usage");
  const quickstart = page("quickstart.md");

  it("carries the README's program as its first runnable block", () => {
    const first = extractRunnableSnippets(quickstart)[0]?.code;
    expect(first).toBe(fencedBlock(usage, "js").replace(/\n$/, ""));
  });

  it("shows the output the README shows", () => {
    const output = fences(quickstart).find((fence) => fence.lang === "text")?.body;
    expect(output).toBe(fencedBlock(usage, "text").replace(/\n$/, ""));
  });
});
