import type { ValidationIssue } from './types.js';

/**
 * A conversion was asked for a value that validation reports invalid.
 *
 * `issues` is the SAME array `validateParts()` returns for that value, so a
 * caller that catches this never has to validate again to learn what was wrong,
 * and a conversion never returns a coerced or clamped stand-in.
 */
export class DatePartsError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`invalid date parts: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'DatePartsError';
    this.issues = issues;
  }
}

/**
 * An absolute instant was asked for, and nothing said which zone the local time
 * is in.
 *
 * This package never falls back to the host timezone, to UTC, or to any other
 * default, because a fallback turns an unknown into a plausible wrong answer.
 */
export class MissingZoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingZoneError';
  }
}

/**
 * The value does not carry enough precision for what was asked, and supplying
 * the missing components would mean inventing them.
 */
export class PrecisionError extends Error {
  /** The precision the value actually has. */
  readonly precision: string;

  constructor(message: string, precision: string) {
    super(message);
    this.name = 'PrecisionError';
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
 */
export class AmbiguousLocalTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousLocalTimeError';
  }
}
