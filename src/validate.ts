import { DatePartsError } from "./errors.js";
import { fractionIssue, nanosecondsOf } from "./fraction.js";
import { PRECISION_LADDER } from "./types.js";
import type {
  DateParts,
  InvalidPartsResult,
  PartName,
  Precision,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

type IntegerPart = Exclude<PartName, "fraction">;

const INTEGER_RANGES: Readonly<Record<IntegerPart, readonly [number, number]>> = {
  year: [1000, 9999],
  month: [1, 12],
  day: [1, 31],
  hour: [0, 23],
  minute: [0, 59],
  second: [0, 59],
  offsetMinutes: [-1439, 1439],
};

const RANGE_NOTES: Readonly<Partial<Record<IntegerPart, string>>> = {
  month: " (spec-native, January is 1, not 0)",
  offsetMinutes: " (signed minutes from UTC)",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Proleptic Gregorian, applied to every year in range with no exceptions. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  /* v8 ignore next -- only checkCalendarDate calls this, with a month already range-checked to 1 to 12, so the index is always in range */
  return MONTH_LENGTHS[month - 1] ?? 0;
}

function monthName(month: number): string {
  /* v8 ignore next -- only checkCalendarDate calls this, with a month already range-checked to 1 to 12, so the index is always in range */
  return MONTH_NAMES[month - 1] ?? `month ${String(month)}`;
}

/** A short, non-throwing description of a value, for diagnostics. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
    return `the number ${String(value)}`;
  }
  if (typeof value === "string") return "a string";
  if (typeof value === "boolean") return `the boolean ${String(value)}`;
  if (typeof value === "bigint") return "a bigint";
  if (typeof value === "symbol") return "a symbol";
  if (typeof value === "function") return "a function";
  if (Array.isArray(value)) return "an array";
  return "an object";
}

function invalid(issues: readonly ValidationIssue[]): InvalidPartsResult {
  return { valid: false, issues };
}

/**
 * What one component of a candidate parts object came to: `undefined` when it is
 * absent, its number when it is present and within the contract, or the issue
 * that refuses it.
 */
type Reading = number | undefined | ValidationIssue;

/**
 * Read one named component off a candidate parts object and check it on its own.
 *
 * A component can be an accessor, and an accessor can throw. Reading it is
 * therefore guarded, so that a hostile or merely broken object is REPORTED like
 * any other fault rather than raising out of a function whose whole contract is
 * that it answers instead of throwing.
 *
 * Each component is read exactly once, and the components are read in the
 * contract's order, year first and `offsetMinutes` last, so an accessor sees the
 * same reads it always has. A component that is present and in range costs no
 * allocation at all: the number itself is the answer.
 */
function readPart(source: Record<string, unknown>, name: PartName): Reading {
  let raw: unknown;
  try {
    raw = source[name];
  } catch {
    return {
      component: name,
      code: "unreadable",
      message: `${name} could not be read: the property threw when accessed, so this package cannot see what value it holds and will not guess one`,
    };
  }

  // An explicit `undefined` reads as absent, the way an optional property does.
  if (raw === undefined) return undefined;

  if (typeof raw !== "number") {
    return {
      component: name,
      code: "not-a-number",
      message: `${name} must be a number; received ${describe(raw)}`,
    };
  }

  if (!Number.isFinite(raw)) {
    return {
      component: name,
      code: "not-finite",
      message: `${name} must be a finite number; received ${describe(raw)}`,
    };
  }

  if (name === "fraction") return fractionIssue(raw) ?? raw;

  if (!Number.isInteger(raw)) {
    return {
      component: name,
      code: "not-an-integer",
      message: `${name} must be a whole number; received the number ${String(raw)}`,
    };
  }

  const [low, high] = INTEGER_RANGES[name];
  if (raw >= low && raw <= high) return raw;
  return name === "year"
    ? {
        component: "year",
        code: "year-not-four-digits",
        message: `year must be a four-digit year in ${String(low)} to ${String(high)}; received the number ${String(raw)}. This package applies no century window and never interprets a two-digit year`,
      }
    : {
        component: name,
        code: "out-of-range",
        message: `${name} must be an integer in ${String(low)} to ${String(high)}${RANGE_NOTES[name] ?? ""}; received the number ${String(raw)}`,
      };
}

/**
 * A validated value's components, written by {@link inspectParts} on success and
 * read straight back by its caller.
 *
 * Indices 0 to 6 are the precision ladder, 7 is `offsetMinutes`, and 8 is the
 * fraction as whole nanoseconds. An absent component is `NaN`, which no valid
 * component can be. The cells are written only after every accessor of the value
 * has been read, and every caller reads them back before it runs any code that is
 * not this package's, so a parts object whose accessor itself converts another
 * value cannot see or disturb them.
 *
 * @internal
 */
export const held = new Float64Array(9);

/** The index of `offsetMinutes` in {@link held}. */
export const OFFSET = 7;

/** The index of the fraction as whole nanoseconds in {@link held}. */
export const NANOSECONDS = 8;

/** A reading that is a component present and within the contract. */
function isHeld(reading: Reading): reading is number {
  return typeof reading === "number";
}

/** A reading that is a component present at all, valid or not. */
function isPresent(reading: Reading): boolean {
  return reading !== undefined;
}

/**
 * Check a value against the date-parts contract without building a result.
 *
 * On success it writes the components into {@link held} and returns the index of
 * the value's precision on {@link PRECISION_LADDER}. On failure it returns every
 * issue found, in the order {@link validateParts} reports them. It never throws
 * for any argument; it is {@link validateParts} with the result left unbuilt, so
 * a converter that needs only the numbers pays for no objects.
 *
 * @internal
 */
export function inspectParts(value: unknown): number | ValidationIssue[] {
  if (typeof value !== "object" || value === null) {
    return [
      {
        component: "value",
        code: "not-a-parts-object",
        message: `a date-parts value must be an object carrying the components the contract names; received ${describe(value)}`,
      },
    ];
  }

  if (value instanceof Date) {
    return [
      {
        component: "value",
        code: "not-a-parts-object",
        message:
          "a JavaScript Date is an absolute instant, not a date-parts value: it cannot express a year-only or month-only date, and it carries no offset of its own. Pass the parts the parser returned",
      },
    ];
  }

  if (Array.isArray(value)) {
    return [
      {
        component: "value",
        code: "not-a-parts-object",
        message:
          "a date-parts value must be an object with named components; received an array, whose positions this package will not guess at",
      },
    ];
  }

  const source = value as Record<string, unknown>;
  const year = readPart(source, "year");
  const month = readPart(source, "month");
  const day = readPart(source, "day");
  const hour = readPart(source, "hour");
  const minute = readPart(source, "minute");
  const second = readPart(source, "second");
  const fraction = readPart(source, "fraction");
  const offsetMinutes = readPart(source, "offsetMinutes");

  // The least significant component present, valid or not: -1 when none is.
  let deepest = -1;
  if (isPresent(year)) deepest = 0;
  if (isPresent(month)) deepest = 1;
  if (isPresent(day)) deepest = 2;
  if (isPresent(hour)) deepest = 3;
  if (isPresent(minute)) deepest = 4;
  if (isPresent(second)) deepest = 5;
  if (isPresent(fraction)) deepest = 6;

  // Valid when every component from year down to the precision is present and
  // within the contract (none below it is present, by the definition of deepest),
  // an offset is absent or valid on a value with a time of day, and the date is
  // one the calendar has.
  const valid =
    isHeld(year) &&
    (deepest < 1 || isHeld(month)) &&
    (deepest < 2 || isHeld(day)) &&
    (deepest < 3 || isHeld(hour)) &&
    (deepest < 4 || isHeld(minute)) &&
    (deepest < 5 || isHeld(second)) &&
    (deepest < 6 || isHeld(fraction)) &&
    (offsetMinutes === undefined || (isHeld(offsetMinutes) && deepest >= 3)) &&
    !(isHeld(month) && isHeld(day) && day > daysInMonth(year, month));

  if (valid) {
    // Every component down to the precision is present and valid, and none below it is.
    held[0] = year;
    held[1] = deepest >= 1 ? (month as number) : Number.NaN;
    held[2] = deepest >= 2 ? (day as number) : Number.NaN;
    held[3] = deepest >= 3 ? (hour as number) : Number.NaN;
    held[4] = deepest >= 4 ? (minute as number) : Number.NaN;
    held[5] = deepest >= 5 ? (second as number) : Number.NaN;
    held[6] = deepest === 6 ? (fraction as number) : Number.NaN;
    held[OFFSET] = offsetMinutes === undefined ? Number.NaN : offsetMinutes;
    held[NANOSECONDS] = deepest === 6 ? (nanosecondsOf(fraction as number) as number) : Number.NaN;
    return deepest;
  }

  const issues: ValidationIssue[] = [];
  for (const reading of [year, month, day, hour, minute, second, fraction, offsetMinutes]) {
    if (reading !== undefined && !isHeld(reading)) issues.push(reading);
  }

  const readings = [year, month, day, hour, minute, second, fraction];
  if (deepest < 0) {
    issues.push({
      component: "year",
      code: "missing-component",
      message:
        "year is missing: a date-parts value must carry at least a year, and this package never infers one",
    });
  } else {
    const deepestName = PRECISION_LADDER[deepest] as Precision;
    for (let index = 0; index < deepest; index += 1) {
      if (isPresent(readings[index])) continue;
      issues.push({
        component: PRECISION_LADDER[index] as Precision,
        code: "missing-component",
        message: `${PRECISION_LADDER[index] as Precision} is missing while ${deepestName} is present: components run from year downward with no gaps, and this package never infers the one you left out`,
      });
    }
  }

  if (offsetMinutes !== undefined && hour === undefined) {
    issues.push({
      component: "offsetMinutes",
      code: "offset-without-time-of-day",
      message:
        "offsetMinutes is present but the value states no time of day: an offset qualifies a clock time, it cannot be rendered without one, and dropping it silently is not an option this package takes",
    });
  }

  if (isHeld(year) && isHeld(month) && isHeld(day)) checkCalendarDate(year, month, day, issues);

  return issues;
}

/**
 * Check a value against the date-parts contract.
 *
 * Every fault is reported, not only the first, and every diagnostic names the
 * component at fault together with the range or calendar rule it broke. Nothing
 * is coerced, clamped or inferred: a value that does not satisfy the contract
 * comes back invalid rather than corrected.
 *
 * This function never throws, for any argument at all. Hostile input (`null`, a
 * string, a JavaScript `Date`, `NaN`, `Infinity`, a non-integer component, a
 * component that throws when it is read) is reported, not raised.
 *
 * Components are looked up by name, so an object carrying them on its prototype
 * (a class instance with accessors, which is a shape a parser may well hand
 * over) is read the same way a plain object literal is.
 *
 * @example
 * ```ts
 * validateParts({ year: 1988, month: 5, day: 7 });
 * // { valid: true, parts: { year: 1988, month: 5, day: 7 }, precision: 'day' }
 *
 * const result = validateParts({ year: 1988, month: 13, day: 40 });
 * result.valid; // false
 * ```
 */
export function validateParts(value: unknown): ValidationResult {
  const outcome = inspectParts(value);
  if (typeof outcome !== "number") return invalid(outcome);
  return {
    valid: true,
    parts: heldParts(outcome),
    precision: PRECISION_LADDER[outcome] as Precision,
  };
}

/**
 * The parts {@link inspectParts} has just written into {@link held}, as a fresh
 * object carrying the components present, in the contract's order.
 *
 * Each shape is built as one literal, so the object is allocated once at its
 * final size rather than grown a property at a time.
 */
function heldParts(depth: number): DateParts {
  const year = held[0] as number;
  const month = held[1] as number;
  const day = held[2] as number;
  const hour = held[3] as number;
  const minute = held[4] as number;
  const second = held[5] as number;
  const fraction = held[6] as number;
  const offsetMinutes = held[OFFSET] as number;
  if (depth === 0) return { year };
  if (depth === 1) return { year, month };
  if (depth === 2) return { year, month, day };
  if (Number.isNaN(offsetMinutes)) {
    if (depth === 3) return { year, month, day, hour };
    if (depth === 4) return { year, month, day, hour, minute };
    if (depth === 5) return { year, month, day, hour, minute, second };
    return { year, month, day, hour, minute, second, fraction };
  }
  if (depth === 3) return { year, month, day, hour, offsetMinutes };
  if (depth === 4) return { year, month, day, hour, minute, offsetMinutes };
  if (depth === 5) return { year, month, day, hour, minute, second, offsetMinutes };
  return { year, month, day, hour, minute, second, fraction, offsetMinutes };
}

function checkCalendarDate(
  year: number,
  month: number,
  day: number,
  issues: ValidationIssue[],
): void {
  const limit = daysInMonth(year, month);
  if (day <= limit) return;

  const leapNote =
    month === 2
      ? `, because ${String(year)} is ${isLeapYear(year) ? "a" : "not a"} leap year in the proleptic Gregorian calendar`
      : "";
  issues.push({
    component: "day",
    code: "no-such-calendar-date",
    message: `day ${String(day)} does not exist: ${monthName(month)} ${String(year)} has ${String(limit)} days${leapNote}`,
  });
}

/**
 * A type guard over {@link validateParts}, for callers that want a boolean.
 *
 * @example
 * ```ts
 * isValidParts({ year: 2024, month: 2, day: 29 }); // true
 * isValidParts({ year: 2025, month: 2, day: 29 }); // false
 * ```
 */
export function isValidParts(value: unknown): value is DateParts {
  return validateParts(value).valid;
}

/**
 * Validate and return the recognized components, or throw {@link DatePartsError}
 * carrying the same diagnostics {@link validateParts} would have reported.
 *
 * @example
 * ```ts
 * assertValidParts({ year: 1988, month: 5 }); // { year: 1988, month: 5 }
 * assertValidParts({ year: 2025, month: 2, day: 29 }); // throws DatePartsError
 * ```
 */
export function assertValidParts(value: unknown): DateParts {
  const result = validateParts(value);
  if (!result.valid) throw new DatePartsError(result.issues);
  return result.parts;
}

/**
 * The precision of a value: its least significant present component.
 *
 * Throws {@link DatePartsError} for a value that does not satisfy the contract,
 * because an invalid value has no precision to report.
 *
 * @example
 * ```ts
 * precisionOf({ year: 1988 }); // 'year'
 * precisionOf({ year: 1988, month: 5, day: 7, hour: 13 }); // 'hour'
 * ```
 */
export function precisionOf(value: unknown): Precision {
  const result = validateParts(value);
  if (!result.valid) throw new DatePartsError(result.issues);
  return result.precision;
}
