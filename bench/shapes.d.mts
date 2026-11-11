// Types for bench/shapes.mjs, so the TypeScript scaling gate (test/perf/scaling-gate.perf.ts) can
// import the bench's own values.

import type { DateParts, ZoneOptions } from "../src/index.js";

/** One value of the mix: the date parts a parser returns, and the wire text it read them from. */
export interface BenchValue {
  readonly parts: DateParts;
  readonly text: string;
}

/** The zone a value with a time of day and no offset of its own is placed in. */
export declare const ZONE: string;

/** How many shapes the mix has: a batch of this many values holds each of them once. */
export declare const SHAPE_COUNT: number;

/** The `index`-th value of the mix. */
export declare function value(index: number): BenchValue;

/** `count` values of the mix, starting at `start`. */
export declare function values(start: number, count: number): BenchValue[];

/** The bytes of the wire text the values were read from. */
export declare function bytesOf(list: readonly BenchValue[]): number;

/** Whether a value states a month. */
export declare function hasMonth(v: BenchValue): boolean;

/** Whether a value states a time of day. */
export declare function hasTime(v: BenchValue): boolean;

/** The options `toInstant` takes for a value: none with its own offset, `ZONE` without. */
export declare function zoneFor(v: BenchValue): ZoneOptions | undefined;
