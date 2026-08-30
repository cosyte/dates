import { describe, expect, it } from 'vitest';

import { nanosecondsOf, readFraction } from '../src/fraction.js';

/** The nanoseconds a fraction reads as, or the issue code that refused it. */
function reading(fraction: number): number | string {
  const result = readFraction(fraction);
  return result.ok ? result.nanoseconds : result.issue.code;
}

// The whole package reads a fraction through this one function, so a value the
// validator certifies is one every converter can render. The contract it has to
// hold is narrow and total: a fraction that IS a whole number of nanoseconds
// reads back as exactly that count, and anything else is refused rather than
// rounded.
describe('readFraction, whole nanoseconds read exactly', () => {
  it('round-trips every nanosecond count at both ends of the range', () => {
    const mismatches: number[] = [];
    const probe = (count: number): void => {
      if (nanosecondsOf(count / 1e9) !== count) mismatches.push(count);
    };

    for (let count = 0; count < 50_000; count += 1) probe(count);
    for (let count = 999_950_000; count < 1_000_000_000; count += 1) probe(count);
    // A stride coprime with every power of ten, so it never rides a decade
    // boundary and never repeats a digit pattern.
    for (let count = 0; count < 1_000_000_000; count += 4_567) probe(count);

    expect(mismatches).toEqual([]);
  });

  it('reads the decimal digits rather than scaling, so nothing needs a tolerance', () => {
    expect(reading(0)).toBe(0);
    expect(reading(0.5)).toBe(500_000_000);
    expect(reading(0.25)).toBe(250_000_000);
    expect(reading(0.001)).toBe(1_000_000);
    expect(reading(0.123456789)).toBe(123_456_789);
    expect(reading(0.999999999)).toBe(999_999_999);
  });

  it('reads a value JavaScript prints in exponential form', () => {
    // Below 1e-6, `String(n)` gives `1e-9` rather than `0.000000001`.
    expect(String(1e-9)).toBe('1e-9');
    expect(reading(1e-9)).toBe(1);
    expect(reading(1e-7)).toBe(100);
    expect(reading(1.25e-7)).toBe(125);
    expect(reading(0.000001)).toBe(1_000);
  });

  it('never reads a whole second, which is not a sub-second value at all', () => {
    const counts = [
      0,
      1,
      999_999_998,
      999_999_999,
      ...Array.from({ length: 5_000 }, (_, index) => 999_995_000 + index),
    ];
    for (const count of counts) {
      const nanoseconds = nanosecondsOf(count / 1e9);
      expect(nanoseconds).toBeDefined();
      expect(nanoseconds).toBeLessThan(1_000_000_000);
    }
  });
});

describe('readFraction, detail finer than a nanosecond is refused, never rounded', () => {
  // S0188 impl gate, finding F1. Each of these sits INSIDE `0 <= fraction < 1`
  // and each one's nearest nanosecond is a whole second, so a reader that scales
  // by 1e9 and rounds hands back 1000000000ns and calls it sub-second.
  const NEAR_ONE = [
    0.999999999999, 0.9999999999999, 0.99999999999999, 0.999999999999999, 0.9999999999999999,
  ];

  it.each(NEAR_ONE)('refuses %d rather than reading it as a whole second', (fraction) => {
    expect(reading(fraction)).toBe('finer-than-nanosecond');
    expect(nanosecondsOf(fraction)).toBeUndefined();
  });

  it.each([0.1234567891, 0.0000000005, 1.5e-9, 1e-12, 5e-324, 0.9999999999])(
    'refuses %d, which no nanosecond count can express',
    (fraction) => {
      expect(reading(fraction)).toBe('finer-than-nanosecond');
    },
  );

  it('says what the floor is, so the caller can meet it', () => {
    const result = readFraction(0.9999999999999);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.component).toBe('fraction');
    expect(result.issue.message).toContain('finer than one nanosecond');
    expect(result.issue.message).toContain('will not round away');
    expect(result.issue.message).toContain('nine decimal places');
  });
});

describe('readFraction, a fraction that is not a share of one second', () => {
  it.each([1, 1.5, -0.5, -1e-9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuses %d as out of range',
    (fraction) => {
      expect(reading(fraction)).toBe('out-of-range');
    },
  );

  it('names the range it broke', () => {
    const result = readFraction(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.message).toContain('0 <= fraction < 1');
  });
});
