import { afterEach, describe, expect, it } from 'vitest';

import type { ZoneOptions } from '../src/index.js';
import {
  AmbiguousLocalTimeError,
  DatePartsError,
  MissingZoneError,
  PrecisionError,
  Temporal,
  precisionOf,
  toISO,
  toInstant,
  toTemporal,
  toZonedDateTime,
  validateParts,
} from '../src/index.js';
import { runBuiltPackageScript } from './support/run.js';

const MAY_SEVENTH = { year: 1988, month: 5, day: 7 } as const;

// Criterion: a year, month and day with no time components converts to a value
// denoting that calendar date, with no time of day and no zone, introducing
// neither midnight nor an offset.
describe('toTemporal, a calendar date stays a calendar date', () => {
  it('returns a PlainDate for a day-precision value', () => {
    const converted = toTemporal(MAY_SEVENTH);
    expect(converted).toBeInstanceOf(Temporal.PlainDate);
    expect(converted.toString()).toBe('1988-05-07');
  });

  it('introduces no time of day', () => {
    const converted = toTemporal(MAY_SEVENTH) as unknown as Record<string, unknown>;
    expect(converted['hour']).toBeUndefined();
    expect(converted['minute']).toBeUndefined();
    expect(converted['second']).toBeUndefined();
    expect(toTemporal(MAY_SEVENTH).toString()).not.toContain('T');
    expect(toTemporal(MAY_SEVENTH).toString()).not.toContain('00:00');
  });

  it('introduces no zone or offset', () => {
    const converted = toTemporal(MAY_SEVENTH) as unknown as Record<string, unknown>;
    expect(converted['timeZoneId']).toBeUndefined();
    expect(converted['offset']).toBeUndefined();
    expect(toTemporal(MAY_SEVENTH).toString()).not.toContain('Z');
    expect(toTemporal(MAY_SEVENTH).toString()).not.toContain('[');
  });

  it('returns a PlainYearMonth for a month-precision value', () => {
    const converted = toTemporal({ year: 1988, month: 5 });
    expect(converted).toBeInstanceOf(Temporal.PlainYearMonth);
    expect(converted.toString()).toBe('1988-05');
  });

  it('returns a PlainDateTime, with no zone, for a time-of-day value with no offset', () => {
    const converted = toTemporal({ ...MAY_SEVENTH, hour: 13, minute: 45 });
    expect(converted).toBeInstanceOf(Temporal.PlainDateTime);
    expect(converted.toString()).toBe('1988-05-07T13:45:00');
  });

  it('refuses a year-only value rather than inventing a month', () => {
    expect(() => toTemporal({ year: 1988 })).toThrow(PrecisionError);
    expect(() => toTemporal({ year: 1988 })).toThrow(/year-only/);
  });
});

// Criterion: a value whose least significant present component is year or month
// renders a string of exactly that precision.
describe('toISO renders at the value own precision', () => {
  it('renders a year-only value as a year', () => {
    expect(toISO({ year: 1988 })).toBe('1988');
  });

  it('renders a month-only value as a year and month', () => {
    expect(toISO({ year: 1988, month: 5 })).toBe('1988-05');
  });

  it('never pads a partial value out to a day', () => {
    expect(toISO({ year: 1988 })).not.toBe('1988-01-01');
    expect(toISO({ year: 1988, month: 5 })).not.toBe('1988-05-01');
    expect(toISO({ year: 1988, month: 5 })).not.toContain('T');
  });

  it.each([
    [{ ...MAY_SEVENTH }, '1988-05-07'],
    [{ ...MAY_SEVENTH, hour: 13 }, '1988-05-07T13'],
    [{ ...MAY_SEVENTH, hour: 13, minute: 45 }, '1988-05-07T13:45'],
    [{ ...MAY_SEVENTH, hour: 13, minute: 45, second: 6 }, '1988-05-07T13:45:06'],
    [{ ...MAY_SEVENTH, hour: 13, minute: 45, second: 6, fraction: 0.25 }, '1988-05-07T13:45:06.25'],
    [{ ...MAY_SEVENTH, hour: 13, minute: 45, second: 6, fraction: 0 }, '1988-05-07T13:45:06.0'],
    [
      { ...MAY_SEVENTH, hour: 13, minute: 45, second: 6, fraction: 0.123456789 },
      '1988-05-07T13:45:06.123456789',
    ],
    [{ year: 1000, month: 1, day: 1 }, '1000-01-01'],
  ])('renders %j as %s', (parts, expected) => {
    expect(toISO(parts)).toBe(expected);
  });

  it('keeps precision and rendering in agreement', () => {
    expect(precisionOf({ year: 1988 })).toBe('year');
    expect(precisionOf({ year: 1988, month: 5 })).toBe('month');
    expect(precisionOf(MAY_SEVENTH)).toBe('day');
  });
});

// Criterion: an explicit offsetMinutes is preserved exactly, normalised neither
// to UTC nor to the host zone.
describe('an explicit offset is preserved exactly', () => {
  const withOffset = { ...MAY_SEVENTH, hour: 13, minute: 45, offsetMinutes: 330 } as const;

  it('renders the exact offset in the ISO string', () => {
    expect(toISO(withOffset)).toBe('1988-05-07T13:45+05:30');
  });

  it('carries the exact offset on the Temporal value', () => {
    const converted = toTemporal(withOffset);
    expect(converted).toBeInstanceOf(Temporal.ZonedDateTime);
    expect((converted as Temporal.ZonedDateTime).offset).toBe('+05:30');
  });

  it('does not normalise the local time to UTC', () => {
    const zoned = toZonedDateTime(withOffset);
    expect(zoned.offset).toBe('+05:30');
    expect(zoned.hour).toBe(13);
    expect(zoned.minute).toBe(45);
    expect(zoned.toInstant().toString()).toBe('1988-05-07T08:15:00Z');
  });

  it.each([
    [-240, '-04:00'],
    [0, '+00:00'],
    [-1439, '-23:59'],
    [1439, '+23:59'],
    [-30, '-00:30'],
  ])('renders offsetMinutes %i as %s', (offsetMinutes, rendered) => {
    expect(toISO({ ...MAY_SEVENTH, hour: 12, offsetMinutes })).toBe(`1988-05-07T12${rendered}`);
  });

  it('uses the value own offset rather than an option, so wire data is never re-zoned', () => {
    const zoned = toZonedDateTime(withOffset, { timeZone: 'America/New_York' });
    expect(zoned.offset).toBe('+05:30');
    expect(zoned.toInstant().toString()).toBe('1988-05-07T08:15:00Z');
  });

  it('treats a present offset of zero as stated, not as unknown', () => {
    expect(toISO({ ...MAY_SEVENTH, hour: 0, offsetMinutes: 0 })).toBe('1988-05-07T00+00:00');
    expect(toISO({ ...MAY_SEVENTH, hour: 0 })).toBe('1988-05-07T00');
  });
});

// Criterion: an absolute instant asked of a value with no offsetMinutes and no
// explicit zone fails with an error naming the missing zone, and never falls
// back to the host timezone, to UTC, or to any default.
describe('an absolute instant needs a zone somebody stated', () => {
  const noOffset = { ...MAY_SEVENTH, hour: 13, minute: 45 } as const;

  it('refuses toInstant with no zone, naming what is missing', () => {
    expect(() => toInstant(noOffset)).toThrow(MissingZoneError);
    try {
      toInstant(noOffset);
      throw new Error('toInstant returned a value where it should have refused');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('offsetMinutes');
      expect(message).toContain('zone');
      expect(message).toContain('host time zone');
      expect(message).toContain('UTC');
    }
  });

  it('refuses toZonedDateTime with no zone', () => {
    expect(() => toZonedDateTime(noOffset)).toThrow(MissingZoneError);
  });

  it('refuses an empty options object just as firmly as no options', () => {
    expect(() => toInstant(noOffset, {})).toThrow(MissingZoneError);
    // A JavaScript caller can hand over an explicit undefined that the types
    // forbid. It must read as "no zone stated", not as a zone.
    expect(() => toInstant(noOffset, { timeZone: undefined } as unknown as ZoneOptions)).toThrow(
      MissingZoneError,
    );
    expect(() =>
      toInstant(noOffset, { offsetMinutes: undefined } as unknown as ZoneOptions),
    ).toThrow(MissingZoneError);
  });

  it('converts once a zone is stated', () => {
    expect(toInstant(noOffset, { timeZone: 'America/New_York' }).toString()).toBe(
      '1988-05-07T17:45:00Z',
    );
    expect(toInstant(noOffset, { offsetMinutes: 330 }).toString()).toBe('1988-05-07T08:15:00Z');
  });

  it('refuses an instant from a value with no time of day, rather than choosing midnight', () => {
    expect(() => toInstant(MAY_SEVENTH, { timeZone: 'UTC' })).toThrow(PrecisionError);
    expect(() => toInstant({ year: 1988, month: 5 }, { timeZone: 'UTC' })).toThrow(PrecisionError);
    expect(() => toInstant(MAY_SEVENTH, { timeZone: 'UTC' })).toThrow(/time of day/);
  });

  it('refuses an unknown time zone identifier', () => {
    expect(() => toInstant(noOffset, { timeZone: 'Mars/Olympus_Mons' })).toThrow(RangeError);
  });

  it('refuses two answers to the zone question', () => {
    expect(() => toInstant(noOffset, { timeZone: 'UTC', offsetMinutes: 0 })).toThrow(TypeError);
  });

  it('refuses a local time a named zone skips or repeats', () => {
    const springForward = { year: 2024, month: 3, day: 10, hour: 2, minute: 30 };
    const fallBack = { year: 2024, month: 11, day: 3, hour: 1, minute: 30 };
    expect(() => toInstant(springForward, { timeZone: 'America/New_York' })).toThrow(
      AmbiguousLocalTimeError,
    );
    expect(() => toInstant(fallBack, { timeZone: 'America/New_York' })).toThrow(
      AmbiguousLocalTimeError,
    );
    expect(toInstant(fallBack, { offsetMinutes: -240 }).toString()).toBe('2024-11-03T05:30:00Z');
  });
});

// Criterion: the same conversion, taking no explicit zone argument, produces
// identical results under two different host TZ settings.
describe('the host time zone changes nothing', () => {
  const HOST_ZONES = ['UTC', 'Pacific/Kiritimati', 'America/Anchorage', 'Asia/Kolkata'] as const;

  /** Every zone-free conversion this package offers, rendered as one string. */
  function battery(): string {
    const withOffset = { ...MAY_SEVENTH, hour: 13, minute: 45, second: 6, offsetMinutes: 330 };
    const noOffset = { ...MAY_SEVENTH, hour: 13, minute: 45 };
    let refusal = 'no refusal, which is itself a failure';
    try {
      toInstant(noOffset);
    } catch (error) {
      refusal = (error as Error).name;
    }
    return JSON.stringify({
      yearOnly: toISO({ year: 1988 }),
      monthOnly: toISO({ year: 1988, month: 5 }),
      dayOnly: toISO(MAY_SEVENTH),
      withOffset: toISO(withOffset),
      plainDate: toTemporal(MAY_SEVENTH).toString(),
      plainDateTime: toTemporal(noOffset).toString(),
      zoned: toTemporal(withOffset).toString(),
      instantFromOwnOffset: toInstant(withOffset).toString(),
      precision: precisionOf({ year: 1988, month: 5 }),
      leapDay: JSON.stringify(validateParts({ year: 2025, month: 2, day: 29 })),
      refusalWithoutZone: refusal,
    });
  }

  const originalTz = process.env['TZ'];
  afterEach(() => {
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
  });

  it('produces identical results in-process under four host zones', () => {
    const observedHostZones: string[] = [];
    const results: string[] = [];

    for (const zone of HOST_ZONES) {
      process.env['TZ'] = zone;
      observedHostZones.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
      results.push(battery());
    }

    // Guard against a vacuous pass: if the host zone never actually moved, the
    // comparison below proves nothing at all.
    expect(new Set(observedHostZones).size).toBe(HOST_ZONES.length);
    expect(new Set(results).size).toBe(1);
  });

  it('produces identical results across two processes started under different TZ values', () => {
    const script = `
import { toISO, toTemporal, toInstant, precisionOf } from '@cosyte/dates';
const withOffset = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
const noOffset = { year: 1988, month: 5, day: 7, hour: 13, minute: 45 };
let refusal = 'none';
try { toInstant(noOffset); } catch (error) { refusal = error.name; }
process.stdout.write(JSON.stringify({
  host: Intl.DateTimeFormat().resolvedOptions().timeZone,
  yearOnly: toISO({ year: 1988 }),
  dayOnly: toISO({ year: 1988, month: 5, day: 7 }),
  withOffset: toISO(withOffset),
  plainDate: toTemporal({ year: 1988, month: 5, day: 7 }).toString(),
  zoned: toTemporal(withOffset).toString(),
  instant: toInstant(withOffset).toString(),
  precision: precisionOf({ year: 1988, month: 5 }),
  refusal,
}));
`;

    const utc = runBuiltPackageScript('tz-utc.mjs', script, { env: { TZ: 'UTC' } });
    const kiritimati = runBuiltPackageScript('tz-kiritimati.mjs', script, {
      env: { TZ: 'Pacific/Kiritimati' },
    });

    expect(utc.stderr).toBe('');
    expect(kiritimati.stderr).toBe('');

    const fromUtc = JSON.parse(utc.stdout) as Record<string, string>;
    const fromKiritimati = JSON.parse(kiritimati.stdout) as Record<string, string>;

    // The two processes really did run under different host zones.
    expect(fromUtc['host']).toBe('UTC');
    expect(fromKiritimati['host']).toBe('Pacific/Kiritimati');

    delete fromUtc['host'];
    delete fromKiritimati['host'];
    expect(fromUtc).toEqual(fromKiritimati);
    expect(fromUtc['refusal']).toBe('MissingZoneError');
  });
});

// Criterion: a conversion asked for a value validation reports invalid fails with
// that same diagnostic, and returns no coerced, clamped or partial value.
describe('a conversion refuses what validation refuses, with the same diagnostic', () => {
  const invalidValues: readonly unknown[] = [
    { year: 2025, month: 2, day: 29 },
    { year: 1988, month: 13 },
    { year: 88, month: 5, day: 7 },
    { year: 1988, day: 7 },
    { year: 1988, month: 5, day: 7, hour: 24 },
    { year: 1988, month: 5, day: 7, offsetMinutes: 60 },
    null,
    'not parts',
    new Date(0),
    { year: Number.NaN },
  ];

  it.each(invalidValues.map((value, index) => [index, value]))(
    'case %i: every conversion throws DatePartsError carrying the validator issues',
    (_index, value) => {
      const result = validateParts(value);
      expect(result.valid).toBe(false);
      if (result.valid) return;

      for (const convert of [
        () => toISO(value),
        () => toTemporal(value),
        () => toZonedDateTime(value, { timeZone: 'UTC' }),
        () => toInstant(value, { timeZone: 'UTC' }),
      ]) {
        let thrown: unknown;
        try {
          const returned = convert();
          throw new Error(`conversion returned ${String(returned)} instead of refusing`);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(DatePartsError);
        expect((thrown as DatePartsError).issues).toEqual(result.issues);
      }
    },
  );

  it('clamps nothing: an out-of-range day is not pulled back to the last of the month', () => {
    expect(() => toISO({ year: 2025, month: 2, day: 29 })).toThrow(DatePartsError);
    expect(() => toISO({ year: 2025, month: 2, day: 31 })).toThrow(DatePartsError);
    expect(() => toISO({ year: 1988, month: 5, day: 7, hour: 24 })).toThrow(DatePartsError);
  });

  it('reports the validator diagnostic verbatim in the thrown message', () => {
    const value = { year: 2025, month: 2, day: 29 };
    const result = validateParts(value);
    if (result.valid) throw new Error('expected an invalid value');
    expect(() => toISO(value)).toThrow(result.issues[0]?.message ?? 'unreachable');
  });
});
