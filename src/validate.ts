import { DatePartsError } from './errors.js';
import { readFraction } from './fraction.js';
import { PRECISION_LADDER } from './types.js';
import type {
  DateParts,
  InvalidPartsResult,
  PartName,
  Precision,
  ValidationIssue,
  ValidationResult,
} from './types.js';

const ALL_PARTS: readonly PartName[] = [...PRECISION_LADDER, 'offsetMinutes'];

type IntegerPart = Exclude<PartName, 'fraction'>;

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
  month: ' (spec-native, January is 1, not 0)',
  offsetMinutes: ' (signed minutes from UTC)',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Proleptic Gregorian, applied to every year in range with no exceptions. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] ?? 0;
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `month ${String(month)}`;
}

/** A short, non-throwing description of a value, for diagnostics. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return `the number ${String(value)}`;
  }
  if (typeof value === 'string') return 'a string';
  if (typeof value === 'boolean') return `the boolean ${String(value)}`;
  if (typeof value === 'bigint') return 'a bigint';
  if (typeof value === 'symbol') return 'a symbol';
  if (typeof value === 'function') return 'a function';
  if (Array.isArray(value)) return 'an array';
  return 'an object';
}

function invalid(issues: readonly ValidationIssue[]): InvalidPartsResult {
  return { valid: false, issues };
}

/**
 * Read one named component off a candidate parts object.
 *
 * A component can be an accessor, and an accessor can throw. Reading it is
 * therefore guarded, so that a hostile or merely broken object is REPORTED like
 * any other fault rather than raising out of a function whose whole contract is
 * that it answers instead of throwing.
 */
function readComponent(
  source: Record<string, unknown>,
  name: PartName,
):
  | { readonly ok: true; readonly raw: unknown }
  | { readonly ok: false; readonly issue: ValidationIssue } {
  try {
    return { ok: true, raw: source[name] };
  } catch {
    return {
      ok: false,
      issue: {
        component: name,
        code: 'unreadable',
        message: `${name} could not be read: the property threw when accessed, so this package cannot see what value it holds and will not guess one`,
      },
    };
  }
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
 */
export function validateParts(value: unknown): ValidationResult {
  if (typeof value !== 'object' || value === null) {
    return invalid([
      {
        component: 'value',
        code: 'not-a-parts-object',
        message: `a date-parts value must be an object carrying the components the contract names; received ${describe(value)}`,
      },
    ]);
  }

  if (value instanceof Date) {
    return invalid([
      {
        component: 'value',
        code: 'not-a-parts-object',
        message:
          'a JavaScript Date is an absolute instant, not a date-parts value: it cannot express a year-only or month-only date, and it carries no offset of its own. Pass the parts the parser returned',
      },
    ]);
  }

  if (Array.isArray(value)) {
    return invalid([
      {
        component: 'value',
        code: 'not-a-parts-object',
        message:
          'a date-parts value must be an object with named components; received an array, whose positions this package will not guess at',
      },
    ]);
  }

  const source = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const present = new Set<PartName>();
  const values: Partial<Record<PartName, number>> = {};

  for (const name of ALL_PARTS) {
    const read = readComponent(source, name);
    if (!read.ok) {
      present.add(name);
      issues.push(read.issue);
      continue;
    }

    const raw = read.raw;
    // An explicit `undefined` reads as absent, the way an optional property does.
    if (raw === undefined) continue;
    present.add(name);

    if (typeof raw !== 'number') {
      issues.push({
        component: name,
        code: 'not-a-number',
        message: `${name} must be a number; received ${describe(raw)}`,
      });
      continue;
    }

    if (!Number.isFinite(raw)) {
      issues.push({
        component: name,
        code: 'not-finite',
        message: `${name} must be a finite number; received ${describe(raw)}`,
      });
      continue;
    }

    if (name === 'fraction') {
      const reading = readFraction(raw);
      if (reading.ok) values.fraction = raw;
      else issues.push(reading.issue);
      continue;
    }

    if (!Number.isInteger(raw)) {
      issues.push({
        component: name,
        code: 'not-an-integer',
        message: `${name} must be a whole number; received the number ${String(raw)}`,
      });
      continue;
    }

    const [low, high] = INTEGER_RANGES[name];
    if (raw < low || raw > high) {
      issues.push(
        name === 'year'
          ? {
              component: 'year',
              code: 'year-not-four-digits',
              message: `year must be a four-digit year in ${String(low)}-${String(high)}; received the number ${String(raw)}. This package applies no century window and never interprets a two-digit year`,
            }
          : {
              component: name,
              code: 'out-of-range',
              message: `${name} must be an integer in ${String(low)}-${String(high)}${RANGE_NOTES[name] ?? ''}; received the number ${String(raw)}`,
            },
      );
      continue;
    }

    values[name] = raw;
  }

  checkContiguity(present, issues);
  checkOffsetHasTimeOfDay(present, issues);
  checkCalendarDate(values, issues);

  if (issues.length > 0) return invalid(issues);

  const parts: { -readonly [K in keyof DateParts]?: number } = {};
  for (const name of ALL_PARTS) {
    const held = values[name];
    if (held !== undefined) parts[name] = held;
  }

  return { valid: true, parts, precision: deepestPresent(present) as Precision };
}

function deepestPresent(present: ReadonlySet<PartName>): Precision | undefined {
  let deepest: Precision | undefined;
  for (const name of PRECISION_LADDER) {
    if (present.has(name)) deepest = name;
  }
  return deepest;
}

function checkContiguity(present: ReadonlySet<PartName>, issues: ValidationIssue[]): void {
  const deepest = deepestPresent(present);

  if (deepest === undefined) {
    issues.push({
      component: 'year',
      code: 'missing-component',
      message:
        'year is missing: a date-parts value must carry at least a year, and this package never infers one',
    });
    return;
  }

  const deepestIndex = PRECISION_LADDER.indexOf(deepest);
  for (let index = 0; index < deepestIndex; index += 1) {
    const name = PRECISION_LADDER[index];
    if (name === undefined || present.has(name)) continue;
    issues.push({
      component: name,
      code: 'missing-component',
      message: `${name} is missing while ${deepest} is present: components run from year downward with no gaps, and this package never infers the one you left out`,
    });
  }
}

function checkOffsetHasTimeOfDay(present: ReadonlySet<PartName>, issues: ValidationIssue[]): void {
  if (!present.has('offsetMinutes') || present.has('hour')) return;
  issues.push({
    component: 'offsetMinutes',
    code: 'offset-without-time-of-day',
    message:
      'offsetMinutes is present but the value states no time of day: an offset qualifies a clock time, it cannot be rendered without one, and dropping it silently is not an option this package takes',
  });
}

function checkCalendarDate(
  values: Partial<Record<PartName, number>>,
  issues: ValidationIssue[],
): void {
  const { year, month, day } = values;
  if (year === undefined || month === undefined || day === undefined) return;

  const limit = daysInMonth(year, month);
  if (day <= limit) return;

  const leapNote =
    month === 2
      ? `, because ${String(year)} is ${isLeapYear(year) ? 'a' : 'not a'} leap year in the proleptic Gregorian calendar`
      : '';
  issues.push({
    component: 'day',
    code: 'no-such-calendar-date',
    message: `day ${String(day)} does not exist: ${monthName(month)} ${String(year)} has ${String(limit)} days${leapNote}`,
  });
}

/** A type guard over {@link validateParts}, for callers that want a boolean. */
export function isValidParts(value: unknown): value is DateParts {
  return validateParts(value).valid;
}

/**
 * Validate and return the recognised components, or throw {@link DatePartsError}
 * carrying the same diagnostics {@link validateParts} would have reported.
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
 */
export function precisionOf(value: unknown): Precision {
  const result = validateParts(value);
  if (!result.valid) throw new DatePartsError(result.issues);
  return result.precision;
}
