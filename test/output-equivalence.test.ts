/**
 * Output equivalence: head outputs exactly what the base tree output, for every case of the corpus
 * in `test/support/output-corpus.ts`.
 *
 * The base half is committed data (`test/__data__/output-digests.json`), one SHA-256 per case of
 * everything a caller can observe: every validation result and issue, every ISO string, every
 * returned Temporal value with its exact epoch nanoseconds and offset, every error with its class,
 * message, issues and precision, and every property read of a proxied value or options object.
 * `test/support/capture-output-digests.ts` captures it from a base ref with `git archive`; re-run at
 * the same base, the file comes back byte-identical.
 *
 * It exists for changes that make validation or conversion cheaper and are meant to change nothing
 * else. A change that does mean to change an output re-captures the digests at the ref that ships
 * it, and says so.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as head from "../src/index.js";
import { digestOf, outputCorpus, recordOf } from "./support/output-corpus.js";

interface CapturedFile {
  readonly base: string;
  readonly cases: Record<string, string>;
}

const captured = JSON.parse(
  readFileSync(new URL("./__data__/output-digests.json", import.meta.url), "utf8"),
) as CapturedFile;

describe("output equivalence with the base tree", () => {
  const corpus = outputCorpus();

  it("covers the same cases the base digests were captured over", () => {
    expect(corpus.map((c) => c.name).sort()).toEqual(Object.keys(captured.cases).sort());
  });

  it("outputs exactly what the base tree output, for every case", () => {
    const differing = corpus
      .filter((c) => digestOf(recordOf(head, c)) !== captured.cases[c.name])
      .map((c) => c.name);
    expect(differing).toEqual([]);
  });
});
