import { describe, expect, it } from 'vitest';

import type { ValidationIssue } from '../src/index.js';
import { DatePartsError, precisionOf, toISO, validateParts } from '../src/index.js';

function issuesOf(value: unknown): readonly ValidationIssue[] {
  const result = validateParts(value);
  if (result.valid)
    throw new Error(`expected ${JSON.stringify(value)} to be invalid, it was valid`);
  return result.issues;
}

function issueFor(value: unknown, component: string): ValidationIssue {
  const issue = issuesOf(value).find((candidate) => candidate.component === component);
  if (issue === undefined) {
    throw new Error(
      `expected an issue naming "${component}", got ${JSON.stringify(issuesOf(value))}`,
    );
  }
  return issue;
}

// Criterion: a real proleptic Gregorian date is valid; one that does not exist is
// invalid, with a diagnostic naming the offending component and the range or
// calendar rule it broke.
describe('validateParts, real and impossible dates', () => {
  it.each([
    ['a leap day in a leap year', { year: 2024, month: 2, day: 29 }],
    ['a leap day in a 400-year leap year', { year: 2000, month: 2, day: 29 }],
    ['the last day of a common February', { year: 1900, month: 2, day: 28 }],
    ['the first representable date', { year: 1000, month: 1, day: 1 }],
    ['the last representable date', { year: 9999, month: 12, day: 31 }],
    ['a full timestamp', { year: 2023, month: 12, day: 31, hour: 23, minute: 59, second: 59 }],
    [
      'a sub-second timestamp',
      { year: 2023, month: 6, day: 1, hour: 0, minute: 0, second: 0, fraction: 0.5 },
    ],
    ['a year alone', { year: 1988 }],
    ['a year and month', { year: 1988, month: 5 }],
    [
      'an offset with a time of day',
      { year: 1988, month: 5, day: 7, hour: 9, offsetMinutes: -300 },
    ],
  ])('reports %s valid', (_label, parts) => {
    expect(validateParts(parts)).toMatchObject({ valid: true });
  });

  it('rejects month 13, naming the component and its range', () => {
    const issue = issueFor({ year: 1988, month: 13 }, 'month');
    expect(issue.code).toBe('out-of-range');
    expect(issue.message).toContain('month');
    expect(issue.message).toContain('1-12');
  });

  it('rejects day 0, naming the component and its range', () => {
    const issue = issueFor({ year: 1988, month: 5, day: 0 }, 'day');
    expect(issue.code).toBe('out-of-range');
    expect(issue.message).toContain('day');
    expect(issue.message).toContain('1-31');
  });

  it('rejects 2025-02-29, naming the calendar rule it broke', () => {
    const issue = issueFor({ year: 2025, month: 2, day: 29 }, 'day');
    expect(issue.code).toBe('no-such-calendar-date');
    expect(issue.message).toBe(
      'day 29 does not exist: February 2025 has 28 days, because 2025 is not a leap year in the proleptic Gregorian calendar',
    );
  });

  it('rejects hour 24, naming the component and its range', () => {
    const issue = issueFor({ year: 1988, month: 5, day: 7, hour: 24 }, 'hour');
    expect(issue.code).toBe('out-of-range');
    expect(issue.message).toContain('hour');
    expect(issue.message).toContain('0-23');
  });

  it('applies the century rule of the proleptic Gregorian calendar', () => {
    expect(validateParts({ year: 1900, month: 2, day: 29 })).toMatchObject({ valid: false });
    expect(validateParts({ year: 2100, month: 2, day: 29 })).toMatchObject({ valid: false });
    expect(validateParts({ year: 2000, month: 2, day: 29 })).toMatchObject({ valid: true });
  });

  it('rejects a 31st in a 30-day month', () => {
    const issue = issueFor({ year: 2025, month: 9, day: 31 }, 'day');
    expect(issue.code).toBe('no-such-calendar-date');
    expect(issue.message).toBe('day 31 does not exist: September 2025 has 30 days');
  });

  it('rejects minute 60 and second 60, naming each range', () => {
    expect(
      issueFor({ year: 2025, month: 1, day: 1, hour: 0, minute: 60 }, 'minute').message,
    ).toContain('0-59');
    expect(
      issueFor({ year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 60 }, 'second').message,
    ).toContain('0-59');
  });

  it('rejects an offsetMinutes outside -1439 to 1439', () => {
    const issue = issueFor(
      { year: 2025, month: 1, day: 1, hour: 0, offsetMinutes: 1440 },
      'offsetMinutes',
    );
    expect(issue.code).toBe('out-of-range');
    expect(issue.message).toContain('-1439');
    expect(issue.message).toContain('1439');
  });

  it('rejects a fraction that is not a share of one second', () => {
    expect(
      issueFor(
        { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0, fraction: 1 },
        'fraction',
      ).code,
    ).toBe('out-of-range');
    expect(
      issueFor(
        { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0, fraction: -0.5 },
        'fraction',
      ).code,
    ).toBe('out-of-range');
  });
});

// Criterion: a component present while a more significant one is absent is
// invalid, the diagnostic names the missing component, and nothing is inferred.
describe('validateParts, contiguity', () => {
  it('rejects a day with no month, naming month', () => {
    const issue = issueFor({ year: 1988, day: 7 }, 'month');
    expect(issue.code).toBe('missing-component');
    expect(issue.message).toContain('month is missing');
  });

  it('rejects a month with no year, naming year', () => {
    const issue = issueFor({ month: 5, day: 7 }, 'year');
    expect(issue.code).toBe('missing-component');
    expect(issue.message).toContain('year is missing');
  });

  it('rejects a minute with no hour, naming hour', () => {
    const issue = issueFor({ year: 1988, month: 5, day: 7, minute: 45 }, 'hour');
    expect(issue.code).toBe('missing-component');
    expect(issue.message).toContain('hour is missing');
  });

  it('rejects a fraction with no second, naming second', () => {
    const issue = issueFor(
      { year: 1988, month: 5, day: 7, hour: 1, minute: 2, fraction: 0.5 },
      'second',
    );
    expect(issue.code).toBe('missing-component');
  });

  it('rejects an empty object, naming the missing year', () => {
    const issue = issueFor({}, 'year');
    expect(issue.code).toBe('missing-component');
    expect(issue.message).toContain('at least a year');
  });

  it('rejects an offset with no time of day, because dropping it would be silent', () => {
    const issue = issueFor({ year: 1988, month: 5, day: 7, offsetMinutes: 0 }, 'offsetMinutes');
    expect(issue.code).toBe('offset-without-time-of-day');
  });

  it('infers nothing: an invalid result carries no parts to read', () => {
    const result = validateParts({ year: 1988, day: 7 });
    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty('parts');
    expect(result).not.toHaveProperty('precision');
  });

  it('treats an explicit undefined as absent rather than as a gap', () => {
    expect(validateParts({ year: 1988, month: 5, day: undefined })).toMatchObject({
      valid: true,
      precision: 'month',
    });
  });
});

// Criterion: a year that is not four digits is invalid, and no code path applies
// a century window or any other two-digit-year interpretation.
describe('validateParts, four-digit years only', () => {
  it('rejects every year below 1000, exhaustively', () => {
    const accepted: number[] = [];
    for (let year = -50; year < 1000; year += 1) {
      const result = validateParts({ year });
      if (result.valid) accepted.push(year);
      else if (year >= 0 && !result.issues.some((issue) => issue.code === 'year-not-four-digits')) {
        throw new Error(`year ${String(year)} was rejected for the wrong reason`);
      }
    }
    expect(accepted).toEqual([]);
  });

  it('rejects every year above 9999 in the range that could be mistaken for one', () => {
    const accepted: number[] = [];
    for (let year = 10000; year <= 10100; year += 1) {
      if (validateParts({ year }).valid) accepted.push(year);
    }
    expect(accepted).toEqual([]);
  });

  it('names the refusal rather than picking a century', () => {
    const issue = issueFor({ year: 88, month: 5, day: 7 }, 'year');
    expect(issue.code).toBe('year-not-four-digits');
    expect(issue.message).toContain('four-digit year in 1000-9999');
    expect(issue.message).toContain('never interprets a two-digit year');
    expect(issue.message).not.toContain('1988');
    expect(issue.message).not.toContain('2088');
  });

  it('never widens a two-digit year on any conversion path', () => {
    for (const year of [0, 5, 25, 49, 50, 68, 69, 88, 99]) {
      const parts = { year, month: 5, day: 7 };
      expect(() => toISO(parts)).toThrow(DatePartsError);
      expect(() => precisionOf(parts)).toThrow(DatePartsError);
      expect(validateParts(parts).valid).toBe(false);
    }
  });
});

// Criterion: something that is not a parts object at all is reported invalid with
// a diagnostic, and never raises an unhandled exception.
describe('validateParts, hostile input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', '1988-05-07'],
    ['an empty string', ''],
    ['a number', 19880507],
    ['a boolean', true],
    ['an array', [1988, 5, 7]],
    ['a function', (): void => undefined],
    ['a symbol', Symbol('nope')],
    ['a bigint', 10n],
    ['a Map', new Map()],
    ['a JavaScript Date', new Date(0)],
    ['a NaN year', { year: Number.NaN }],
    ['an Infinity year', { year: Number.POSITIVE_INFINITY }],
    ['a -Infinity year', { year: Number.NEGATIVE_INFINITY }],
    ['a non-integer year', { year: 1988.5 }],
    ['a non-integer month', { year: 1988, month: 5.5 }],
    ['a string month', { year: 1988, month: '05' }],
    ['a null month', { year: 1988, month: null }],
    [
      'a NaN fraction',
      { year: 1988, month: 5, day: 7, hour: 1, minute: 1, second: 1, fraction: Number.NaN },
    ],
  ])('reports %s invalid without throwing', (_label, value) => {
    const result = validateParts(value);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.issues.length).toBeGreaterThan(0);
    for (const issue of result.issues) {
      expect(issue.message.length).toBeGreaterThan(0);
      expect(typeof issue.component).toBe('string');
      expect(typeof issue.code).toBe('string');
    }
  });

  it('says what a JavaScript Date is, rather than complaining about a missing year', () => {
    const issue = issueFor(new Date(0), 'value');
    expect(issue.code).toBe('not-a-parts-object');
    expect(issue.message).toContain('absolute instant');
  });

  it('rejects a fraction finer than a nanosecond rather than rounding it away', () => {
    const base = { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    expect(issueFor({ ...base, fraction: 0.1234567891 }, 'fraction').code).toBe(
      'finer-than-nanosecond',
    );
    expect(issueFor({ ...base, fraction: 1e-12 }, 'fraction').code).toBe('finer-than-nanosecond');
    expect(validateParts({ ...base, fraction: 0.123456789 })).toMatchObject({ valid: true });
  });

  it('reports every fault, not only the first', () => {
    const issues = issuesOf({ year: 88, month: 13, day: 40, hour: 25 });
    expect(issues.map((issue) => issue.component).sort()).toEqual(['day', 'hour', 'month', 'year']);
  });

  it('ignores components the contract does not name rather than refusing the value', () => {
    const result = validateParts({ year: 1988, month: 5, day: 7, timezoneName: 'CST' });
    expect(result).toMatchObject({ valid: true, precision: 'day' });
    if (!result.valid) return;
    expect(Object.keys(result.parts)).toEqual(['year', 'month', 'day']);
  });
});
