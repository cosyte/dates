import { describe, expect, it } from "vitest";

import { nanosecondsOf, readFraction } from "../src/fraction.js";

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
describe("readFraction, whole nanoseconds read exactly", () => {
  it("round-trips every nanosecond count at both ends of the range", () => {
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

  it("reads the decimal digits rather than scaling, so nothing needs a tolerance", () => {
    expect(reading(0)).toBe(0);
    expect(reading(0.5)).toBe(500_000_000);
    expect(reading(0.25)).toBe(250_000_000);
    expect(reading(0.001)).toBe(1_000_000);
    expect(reading(0.123456789)).toBe(123_456_789);
    expect(reading(0.999999999)).toBe(999_999_999);
  });

  it("reads a value JavaScript prints in exponential form", () => {
    // Below 1e-6, `String(n)` gives `1e-9` rather than `0.000000001`.
    expect(String(1e-9)).toBe("1e-9");
    expect(reading(1e-9)).toBe(1);
    expect(reading(1e-7)).toBe(100);
    expect(reading(1.25e-7)).toBe(125);
    expect(reading(0.000001)).toBe(1_000);
  });

  it("never reads a whole second, which is not a sub-second value at all", () => {
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

describe("readFraction, detail finer than a nanosecond is refused, never rounded", () => {
  // S0188 impl gate, finding F1. Each of these sits INSIDE `0 <= fraction < 1`
  // and each one's nearest nanosecond is a whole second, so a reader that scales
  // by 1e9 and rounds hands back 1000000000ns and calls it sub-second.
  const NEAR_ONE = [
    0.999999999999, 0.9999999999999, 0.99999999999999, 0.999999999999999, 0.9999999999999999,
  ];

  it.each(NEAR_ONE)("refuses %d rather than reading it as a whole second", (fraction) => {
    expect(reading(fraction)).toBe("finer-than-nanosecond");
    expect(nanosecondsOf(fraction)).toBeUndefined();
  });

  it.each([0.1234567891, 0.0000000005, 1.5e-9, 1e-12, 5e-324, 0.9999999999])(
    "refuses %d, which no nanosecond count can express",
    (fraction) => {
      expect(reading(fraction)).toBe("finer-than-nanosecond");
    },
  );

  it("says what the floor is, so the caller can meet it", () => {
    const result = readFraction(0.9999999999999);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.component).toBe("fraction");
    expect(result.issue.message).toContain("finer than one nanosecond");
    expect(result.issue.message).toContain("will not round away");
    expect(result.issue.message).toContain("nine decimal places");
  });
});

describe("readFraction, a fraction that is not a share of one second", () => {
  it.each([1, 1.5, -0.5, -1e-9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "refuses %d as out of range",
    (fraction) => {
      expect(reading(fraction)).toBe("out-of-range");
    },
  );

  it("reads no nanoseconds from a value with no decimal spelling at all", () => {
    expect(nanosecondsOf(Number.NaN)).toBeUndefined();
  });

  it("names the range it broke", () => {
    const result = readFraction(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.message).toContain("0 <= fraction < 1");
  });
});

/**
 * The reading this package shipped before it scanned characters: the same digits, matched by
 * regular expressions. The scan must agree with it on every number.
 */
function referenceNanoseconds(fraction: number): number | undefined {
  const text = String(fraction);
  const plain = /^0(?:\.(\d+))?$/.exec(text);
  let digits: string | undefined;
  if (plain !== null) {
    digits = plain[1] ?? "";
  } else {
    const exponential = /^(\d)(?:\.(\d+))?e-(\d+)$/.exec(text);
    if (exponential === null) return undefined;
    digits =
      "0".repeat(Number(exponential[3]) - 1) + (exponential[1] ?? "") + (exponential[2] ?? "");
  }
  if (digits.length > 9) return undefined;
  return digits === "" ? 0 : Number(digits.padEnd(9, "0"));
}

describe("nanosecondsOf, the character scan reads what the regular expressions read", () => {
  it("agrees on every spelling a number can have", () => {
    const probes = [
      0,
      -0,
      1,
      1.5,
      123,
      123.456,
      -0.5,
      1e21,
      1.5e21,
      1e-7,
      1.5e-7,
      9.99e-7,
      1e-9,
      5e-9,
      1.5e-9,
      2.5e-10,
      5e-324,
      Number.EPSILON,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0.1 + 0.2,
      1 / 3,
    ];
    // A fixed sequence of doubles in [0, 1): whole nanoseconds, finer decimals, and raw bits.
    let state = 12_345;
    const next = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    for (let i = 0; i < 20_000; i += 1) {
      probes.push((next() % 1_000_000_000) / 1e9);
      probes.push((next() % 10_000_000_000) / 1e10);
      probes.push(next() / 2 ** 32);
      probes.push((next() % 1000) * 10 ** -(next() % 12));
    }
    const differing = probes.filter(
      (fraction) => !Object.is(nanosecondsOf(fraction), referenceNanoseconds(fraction)),
    );
    expect(differing).toEqual([]);
  });
});
