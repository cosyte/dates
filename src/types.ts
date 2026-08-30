/**
 * The date-parts value every `@cosyte/*` parser hands back, and the only shape
 * this package accepts.
 *
 * Two rules make it a contract rather than a bag of numbers.
 *
 * 1. CONTIGUITY. Components are present from the most significant downward with
 *    no gaps. `{ year, month }` is legal; `{ year, day }` is not.
 * 2. PRECISION IS WHAT IS PRESENT. The least significant present component IS
 *    the precision of the value. Nothing here adds a component that was not
 *    supplied, and an absent `offsetMinutes` means the offset is UNKNOWN, which
 *    is not the same as UTC and not the same as the host zone.
 *
 * `month` is SPEC-NATIVE 1-12, not JavaScript's 0-11.
 */
export interface DateParts {
  /** Four digits, 1000-9999. Required. Two-digit years are never interpreted. */
  readonly year?: number;
  /** 1-12, spec-native. January is 1. */
  readonly month?: number;
  /** 1-31, and a day that exists in the given month of the given year. */
  readonly day?: number;
  /** 0-23. */
  readonly hour?: number;
  /** 0-59. */
  readonly minute?: number;
  /** 0-59. Leap seconds are not representable. */
  readonly second?: number;
  /** Sub-second precision as a fraction of one second: `0 <= fraction < 1`. */
  readonly fraction?: number;
  /**
   * Signed minutes from UTC, -1439 to 1439. ABSENT means the offset is unknown.
   * It never means zero, and it is never filled in from the host zone.
   */
  readonly offsetMinutes?: number;
}

/** The precision ladder, most significant first. */
export const PRECISION_LADDER = [
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'second',
  'fraction',
] as const;

/** The least significant component present in a value IS its precision. */
export type Precision = (typeof PRECISION_LADDER)[number];

/** Every component name the contract defines. */
export type PartName = Precision | 'offsetMinutes';

/** What a diagnostic says went wrong. */
export type IssueCode =
  /** The argument is not a date-parts object at all. */
  | 'not-a-parts-object'
  /** A more significant component is absent while a less significant one is present. */
  | 'missing-component'
  /** Reading the component threw, so its value could not be seen at all. */
  | 'unreadable'
  /** The component is present but is not a number. */
  | 'not-a-number'
  /** The component is a number but is `NaN` or infinite. */
  | 'not-finite'
  /** The component must be a whole number and is not. */
  | 'not-an-integer'
  /** The component is outside the range the contract gives it. */
  | 'out-of-range'
  /** The year is not four digits. No century window is ever applied. */
  | 'year-not-four-digits'
  /** The sub-second value carries detail below nanosecond resolution. */
  | 'finer-than-nanosecond'
  /** An offset was given for a value that states no time of day. */
  | 'offset-without-time-of-day'
  /** The components are each in range but together denote no real date. */
  | 'no-such-calendar-date';

/** One thing wrong with one component, named. */
export interface ValidationIssue {
  /** The component at fault, or `'value'` when the argument itself is wrong. */
  readonly component: PartName | 'value';
  readonly code: IssueCode;
  /** Human-readable, names the component and the range or calendar rule broken. */
  readonly message: string;
}

/** A validated value, carrying only the recognised components that were present. */
export interface ValidPartsResult {
  readonly valid: true;
  readonly parts: DateParts;
  readonly precision: Precision;
}

/** An invalid value, with every fault found rather than only the first. */
export interface InvalidPartsResult {
  readonly valid: false;
  readonly issues: readonly ValidationIssue[];
}

export type ValidationResult = ValidPartsResult | InvalidPartsResult;

/**
 * How to place a value that carries no offset of its own onto the timeline.
 *
 * A value that DOES carry `offsetMinutes` is never re-zoned: its own offset is
 * what the sender said, and overriding it here would move the instant.
 */
export interface ZoneOptions {
  /** An IANA time zone identifier, for example `'America/New_York'`. */
  readonly timeZone?: string;
  /** A fixed offset in signed minutes from UTC, -1439 to 1439. */
  readonly offsetMinutes?: number;
}
