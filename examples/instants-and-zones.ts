/**
 * Turn a timestamp into an absolute instant only when its zone is known. A value that states its
 * offset keeps it; a value that does not needs the caller to say which zone applies; and a local
 * time a daylight-saving transition skips or repeats is refused rather than resolved by a guess.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/instants-and-zones.ts
 *
 * Every value here is synthetic. The output does not depend on the host time zone. The example
 * checks its own output and exits non-zero on a mismatch.
 */

import assert from 'node:assert/strict';

import {
  AmbiguousLocalTimeError,
  MissingZoneError,
  toInstant,
  toZonedDateTime,
} from '@cosyte/dates';

// The sender stated +05:30, so that offset is used as sent.
const collected = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
const instant = toInstant(collected).toString();
console.log('stated offset:', instant);
assert.equal(instant, '1988-05-07T08:15:00Z');

// No offset on the wire: nothing guesses one, not the host zone and not UTC.
const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };
try {
  toInstant(local);
  assert.fail('toInstant guessed a zone for a value with no offset');
} catch (error) {
  assert.ok(error instanceof MissingZoneError);
  console.log('no zone given:', error.name);
}

// The caller knows the sender's zone and says so.
const inNewYork = toInstant(local, { timeZone: 'America/New_York' }).toString();
const zoned = toZonedDateTime(local, { timeZone: 'America/New_York' }).toString();
console.log('in America/New_York:', inNewYork, '|', zoned);
assert.equal(inNewYork, '2026-03-09T12:05:00Z');
assert.equal(zoned, '2026-03-09T08:05:00-04:00[America/New_York]');

// 01:30 happens twice on 1 November 2026 in New York. Refused, not picked.
const repeated = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
try {
  toInstant(repeated, { timeZone: 'America/New_York' });
  assert.fail('toInstant picked one side of a daylight-saving transition');
} catch (error) {
  assert.ok(error instanceof AmbiguousLocalTimeError);
  console.log('repeated local time:', error.name);
}

// Saying which of the two offsets was meant settles it.
const resolved = toInstant(repeated, { offsetMinutes: -240 }).toString();
console.log('with offset -04:00:', resolved);
assert.equal(resolved, '2026-11-01T05:30:00Z');

console.log('instants-and-zones: ok');
