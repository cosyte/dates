/**
 * Validate a date-parts value before trusting it. Every fault is reported, each naming the
 * component and the rule it broke, and a value that passes comes back with its precision.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/validate-parts.ts
 *
 * Every value here is synthetic. The example checks its own output and exits non-zero on a
 * mismatch.
 */

import assert from 'node:assert/strict';

import { assertValidParts, DatePartsError, isValidParts, validateParts } from '@cosyte/dates';

// A leap day that exists: valid, at day precision.
const admitted = validateParts({ year: 2024, month: 2, day: 29 });
assert.ok(admitted.valid);
console.log('2024-02-29 valid:', admitted.valid, '| precision:', admitted.precision);
assert.equal(admitted.precision, 'day');

// Three faults in one value, all reported rather than only the first.
const broken = validateParts({ year: 88, month: 13, day: 40 });
assert.ok(!broken.valid);
const faults = broken.issues.map((issue) => `${issue.component}:${issue.code}`);
console.log('faults:', faults.join(', '));
assert.deepEqual(faults, ['year:year-not-four-digits', 'month:out-of-range', 'day:out-of-range']);

// A day that does not exist is refused, never rolled over into March.
const input: unknown = { year: 2025, month: 2, day: 29 };
console.log('2025-02-29 valid:', isValidParts(input));
assert.equal(isValidParts(input), false);

try {
  assertValidParts(input);
  assert.fail('assertValidParts accepted a date that does not exist');
} catch (error) {
  assert.ok(error instanceof DatePartsError);
  console.log('refused:', error.issues[0]?.code);
  assert.equal(error.issues[0]?.code, 'no-such-calendar-date');
}

console.log('validate-parts: ok');
