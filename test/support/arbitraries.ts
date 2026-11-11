import fc from "fast-check";

import type { DateParts } from "../../src/index.js";
import { PRECISION_LADDER, Temporal } from "../../src/index.js";

/**
 * The generators the property suites in `test/property/` draw from. Every value is random and
 * synthetic: a date part here is a number in a range, never a date taken from a record.
 */

/** A generated valid value, with what it states beside it, so a property can check against it. */
export interface GeneratedParts {
  readonly parts: DateParts;
  /** How many components of the precision ladder it states, 1 (year) to 7 (fraction). */
  readonly depth: number;
  /** The decimal digits of its fraction, as written, when it states one. */
  readonly fractionDigits?: string;
}

/** The decimal digits of a fraction of a second, 1 to 9 of them, the last never 0. */
const fractionDigits = fc
  .tuple(
    fc.array(fc.constantFrom(..."0123456789"), { maxLength: 8 }),
    fc.constantFrom(..."123456789"),
  )
  .map(([head, last]) => `${head.join("")}${last}`);

/**
 * A valid value at any precision: a year from 1000 to 9999, a calendar date that exists, a time of
 * day, and an offset only when it states an hour, as the contract asks.
 *
 * @param options The shape asked for.
 * @param options.offset Whether a value that states an hour carries an offset: `"never"`,
 *   `"always"`, or `"maybe"` (the default).
 * @param options.minDepth The fewest components it states, 1 (year) to 7 (fraction).
 * @returns The generator.
 */
export function validParts(
  options: { readonly offset?: "never" | "always" | "maybe"; readonly minDepth?: number } = {},
): fc.Arbitrary<GeneratedParts> {
  const offset = options.offset ?? "maybe";
  return fc
    .record({
      depth: fc.integer({ min: options.minDepth ?? 1, max: PRECISION_LADDER.length }),
      year: fc.integer({ min: 1000, max: 9999 }),
      month: fc.integer({ min: 1, max: 12 }),
      // Scaled to the month below, so every generated date exists.
      dayFraction: fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
      fraction: fractionDigits,
      withOffset: offset === "maybe" ? fc.boolean() : fc.constant(offset === "always"),
      offsetMinutes: fc.integer({ min: -1439, max: 1439 }),
    })
    .map((g) => {
      const daysInMonth = new Temporal.PlainYearMonth(g.year, g.month).daysInMonth;
      const day = 1 + Math.floor(g.dayFraction * daysInMonth);
      const stated: Record<string, number> = { year: g.year };
      if (g.depth >= 2) stated["month"] = g.month;
      if (g.depth >= 3) stated["day"] = day;
      if (g.depth >= 4) stated["hour"] = g.hour;
      if (g.depth >= 5) stated["minute"] = g.minute;
      if (g.depth >= 6) stated["second"] = g.second;
      if (g.depth >= 7) stated["fraction"] = Number(`0.${g.fraction}`);
      if (g.depth >= 4 && g.withOffset) stated["offsetMinutes"] = g.offsetMinutes;
      return {
        parts: stated,
        depth: g.depth,
        ...(g.depth >= 7 ? { fractionDigits: g.fraction } : {}),
      };
    });
}

/** Local times either side of a daylight-saving transition, where a named zone can be ambiguous. */
const NEAR_TRANSITIONS: readonly (readonly [string, number, number, number])[] = [
  ["America/New_York", 2024, 3, 10],
  ["America/New_York", 2024, 11, 3],
  ["Europe/London", 2024, 3, 31],
  ["Europe/London", 2024, 10, 27],
  ["Australia/Lord_Howe", 2024, 4, 7],
  ["Australia/Lord_Howe", 2024, 10, 6],
];

/** The zones a named-zone property draws from, with UTC and a zone with no transition. */
export const ZONES: readonly string[] = [
  "UTC",
  "Asia/Kolkata",
  ...new Set(NEAR_TRANSITIONS.map(([zone]) => zone)),
];

/**
 * A value that states at least an hour and no offset, with a named zone: half the time a random
 * date, half the time an hour on the day a zone changes its clocks, so the skipped and repeated
 * local times a property must refuse turn up in every run.
 */
export const localTimeInZone: fc.Arbitrary<{
  readonly generated: GeneratedParts;
  readonly timeZone: string;
}> = fc.oneof(
  fc.record({
    generated: validParts({ offset: "never", minDepth: 4 }),
    timeZone: fc.constantFrom(...ZONES),
  }),
  fc
    .record({
      transition: fc.constantFrom(...NEAR_TRANSITIONS),
      hour: fc.integer({ min: 0, max: 3 }),
      minute: fc.integer({ min: 0, max: 59 }),
    })
    .map(({ transition: [timeZone, year, month, day], hour, minute }) => ({
      generated: { parts: { year, month, day, hour, minute }, depth: 5 },
      timeZone,
    })),
);

/**
 * Anything a caller might pass: valid values, values with components out of range or of the wrong
 * type, objects with stray keys, and values that are not objects at all.
 */
export const anyValue: fc.Arbitrary<unknown> = fc.oneof(
  validParts().map((g) => g.parts),
  fc.record(
    {
      year: fc.oneof(fc.integer({ min: -100, max: 12_000 }), fc.double(), fc.string()),
      month: fc.oneof(fc.integer({ min: -1, max: 14 }), fc.double()),
      day: fc.integer({ min: -1, max: 33 }),
      hour: fc.integer({ min: -1, max: 25 }),
      minute: fc.integer({ min: -1, max: 61 }),
      second: fc.integer({ min: -1, max: 61 }),
      fraction: fc.oneof(fc.double(), fc.constant(1e-10), fc.constant(0.5)),
      offsetMinutes: fc.oneof(fc.integer({ min: -1500, max: 1500 }), fc.double()),
    },
    { requiredKeys: [] },
  ),
  fc.anything(),
);
