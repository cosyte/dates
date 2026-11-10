import type { ValidationIssue } from "./types.js";

/**
 * A conversion was asked for a value that validation reports invalid.
 *
 * `issues` is the SAME array `validateParts()` returns for that value, so a
 * caller that catches this never has to validate again to learn what was wrong,
 * and a conversion never returns a coerced or clamped stand-in.
 *
 * @example
 * ```ts
 * try {
 *   toISO({ year: 2025, month: 2, day: 29 });
 * } catch (error) {
 *   if (error instanceof DatePartsError) error.issues[0]?.code; // 'no-such-calendar-date'
 * }
 * ```
 */
export class DatePartsError extends Error {
  /** Every fault `validateParts()` found in the value, in the order it found them. */
  readonly issues: readonly ValidationIssue[];

  /** @param issues - Every fault `validateParts()` found in the value. */
  constructor(issues: readonly ValidationIssue[]) {
    super(`invalid date parts: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "DatePartsError";
    this.issues = issues;
  }
}

/**
 * An absolute instant was asked for, and nothing said which zone the local time
 * is in.
 *
 * This package never falls back to the host timezone, to UTC, or to any other
 * default, because a fallback turns an unknown into a plausible wrong answer.
 *
 * @example
 * ```ts
 * toInstant({ year: 2026, month: 3, day: 9, hour: 8, minute: 5 }); // throws MissingZoneError
 * ```
 */
export class MissingZoneError extends Error {
  /** @param message - What was asked for, and how to say which zone applies. */
  constructor(message: string) {
    super(message);
    this.name = "MissingZoneError";
  }
}

/**
 * The value does not carry enough precision for what was asked, and supplying
 * the missing components would mean inventing them.
 *
 * @example
 * ```ts
 * try {
 *   toTemporal({ year: 1988 });
 * } catch (error) {
 *   if (error instanceof PrecisionError) error.precision; // 'year'
 * }
 * ```
 */
export class PrecisionError extends Error {
  /** The precision the value actually has. */
  readonly precision: string;

  /**
   * @param message - What was asked for, and which components it needs.
   * @param precision - The precision the value actually has.
   */
  constructor(message: string, precision: string) {
    super(message);
    this.name = "PrecisionError";
    this.precision = precision;
  }
}

/**
 * A local time was placed in a named zone where it does not exist, or exists
 * twice.
 *
 * Both cases are resolved by REFUSING rather than by picking. A daylight-saving
 * transition is exactly where a silent choice shifts a clinical timeline by an
 * hour, so the caller is told and decides.
 *
 * @example
 * ```ts
 * const local = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
 * toInstant(local, { timeZone: "America/New_York" });
 * // throws AmbiguousLocalTimeError: 2026-11-01T01:30:00 happens twice in America/New_York ...
 * ```
 */
export class AmbiguousLocalTimeError extends Error {
  /** @param message - The local time, the zone, and the candidate offsets where there are two. */
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousLocalTimeError";
  }
}
