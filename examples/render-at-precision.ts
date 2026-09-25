/**
 * Render and convert a value at the precision it arrived with. A year stays a year: nothing adds a
 * month, a day or a midnight the value did not state.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/render-at-precision.ts
 *
 * Every value here is synthetic. The example checks its own output and exits non-zero on a
 * mismatch.
 */

import assert from 'node:assert/strict';

import { PrecisionError, Temporal, precisionOf, toISO, toTemporal } from '@cosyte/dates';
import type { DateParts } from '@cosyte/dates';

const rows: ReadonlyArray<{ value: DateParts; iso: string; precision: string }> = [
  { value: { year: 1988 }, iso: '1988', precision: 'year' },
  { value: { year: 1988, month: 5 }, iso: '1988-05', precision: 'month' },
  { value: { year: 1988, month: 5, day: 7 }, iso: '1988-05-07', precision: 'day' },
  {
    value: { year: 1988, month: 5, day: 7, hour: 13, minute: 45 },
    iso: '1988-05-07T13:45',
    precision: 'minute',
  },
  {
    value: {
      year: 1988,
      month: 5,
      day: 7,
      hour: 13,
      minute: 45,
      second: 6,
      fraction: 0.25,
      offsetMinutes: 330,
    },
    iso: '1988-05-07T13:45:06.25+05:30',
    precision: 'fraction',
  },
];

for (const row of rows) {
  const iso = toISO(row.value);
  const precision = precisionOf(row.value);
  console.log(iso.padEnd(30), precision);
  assert.equal(iso, row.iso);
  assert.equal(precision, row.precision);
}

// toTemporal returns the narrowest Temporal type that carries everything the value states.
const month = toTemporal({ year: 1988, month: 5 });
const day = toTemporal({ year: 1988, month: 5, day: 7 });
const local = toTemporal({ year: 1988, month: 5, day: 7, hour: 13, minute: 45 });
const zoned = toTemporal({
  year: 1988,
  month: 5,
  day: 7,
  hour: 13,
  minute: 45,
  offsetMinutes: 330,
});
console.log([month, day, local, zoned].map((value) => value.constructor.name).join(' '));
assert.ok(month instanceof Temporal.PlainYearMonth);
assert.ok(day instanceof Temporal.PlainDate);
assert.ok(local instanceof Temporal.PlainDateTime);
assert.ok(zoned instanceof Temporal.ZonedDateTime);

// Temporal has no year-only type, so a year is refused rather than given an invented month.
try {
  toTemporal({ year: 1988 });
  assert.fail('toTemporal invented a month for a year-only value');
} catch (error) {
  assert.ok(error instanceof PrecisionError);
  console.log('year-only toTemporal refused:', error.name, `(precision ${error.precision})`);
  assert.equal(error.precision, 'year');
}

console.log('render-at-precision: ok');
