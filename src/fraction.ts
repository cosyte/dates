import type { ValidationIssue } from "./types.js";

/**
 * Reading a `fraction` as whole nanoseconds, EXACTLY.
 *
 * One function answers "how many nanoseconds is this?" for the whole package, so
 * the validator and every converter cannot disagree about a value: a fraction the
 * validator accepts is one every converter can render, and a fraction any of them
 * refuses is refused by all of them with the same diagnostic.
 *
 * The count is read from the value's own decimal digits rather than computed as
 * `fraction * 1e9`. Binary floating point cannot hold most decimal fractions, so
 * that product misses whole nanoseconds by a hair and any tolerance wide enough
 * to forgive the hair is also wide enough to swallow a real difference. Digits
 * are exact and need no tolerance at all.
 */

/** Temporal's resolution floor, and this package's: nine decimal places. */
const NANOSECOND_DIGITS = 9;

/** The digit at `index` of `text`, or -1 when that character is not a decimal digit. */
function digitAt(text: string, index: number): number {
  const digit = text.charCodeAt(index) - 48;
  return digit >= 0 && digit <= 9 ? digit : -1;
}

/**
 * The whole nanoseconds `fraction` denotes, or `undefined` when it carries detail
 * finer than one nanosecond.
 *
 * The count is read from the digits of the shortest decimal that round-trips to
 * `fraction`, which is what `String(fraction)` prints: that is the value's
 * canonical spelling, what `0.123456789` was written as, and every longer
 * decimal that lands on the same double is the same double. JavaScript prints it
 * in one of two forms in this range, `0.` and the sub-second digits (or `0`
 * alone), and below `1e-6` an exponential form such as `1e-9` or `1.5e-7`. Any
 * other spelling has no reading. The digits are read one character at a time,
 * with no regular expression and no intermediate string, so a reading allocates
 * nothing beyond the printed text itself.
 *
 * `fraction` must already be known finite and in `[0, 1)`; {@link readFraction}
 * is the entry point that establishes both. The result is therefore always in
 * `[0, 999999999]`, never a whole second.
 *
 * @internal Not exported from the package entry point.
 */
export function nanosecondsOf(fraction: number): number | undefined {
  const text = String(fraction);
  const length = text.length;

  // `0`, or `0.` and its digits: the only spellings JavaScript gives a number that
  // starts with a zero.
  if (text.charCodeAt(0) === 48) {
    const places = Math.max(length - 2, 0);
    if (places > NANOSECOND_DIGITS) return undefined;
    let count = 0;
    for (let index = 2; index < length; index += 1) count = count * 10 + digitAt(text, index);
    return count * 10 ** (NANOSECOND_DIGITS - places);
  }

  // One digit, then optionally `.` and more digits, then `e-` and the exponent.
  // Anything else (a negative number, `NaN`, `1.5`, `1e+21`) has no reading.
  const lead = digitAt(text, 0);
  if (lead < 0) return undefined;
  let count = lead;
  let index = text.charCodeAt(1) === 46 ? 2 : 1;
  const restStart = index;
  for (let digit = digitAt(text, index); digit >= 0; digit = digitAt(text, index)) {
    count = count * 10 + digit;
    index += 1;
  }
  if (text.charCodeAt(index) !== 101 || text.charCodeAt(index + 1) !== 45) return undefined;
  const restDigits = index - restStart;
  let exponent = 0;
  for (index += 2; index < length; index += 1) exponent = exponent * 10 + digitAt(text, index);

  // `d.ddde-N` is N - 1 zeros, the lead digit, then the rest, after the point.
  const places = exponent + restDigits;
  return places > NANOSECOND_DIGITS ? undefined : count * 10 ** (NANOSECOND_DIGITS - places);
}

/** A fraction read as whole nanoseconds, or the diagnostic that refuses it. */
export type FractionReading =
  | { readonly ok: true; readonly nanoseconds: number }
  | { readonly ok: false; readonly issue: ValidationIssue };

/**
 * The diagnostic that refuses `fraction`, or `undefined` when it is a whole
 * number of nanoseconds in `[0, 1)`.
 *
 * The validator's check: it builds nothing for a fraction it accepts.
 *
 * @internal Not exported from the package entry point.
 */
export function fractionIssue(fraction: number): ValidationIssue | undefined {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) {
    return {
      component: "fraction",
      code: "out-of-range",
      message: `fraction is a share of one second and must satisfy 0 <= fraction < 1; received the number ${String(fraction)}`,
    };
  }
  if (nanosecondsOf(fraction) === undefined) {
    return {
      component: "fraction",
      code: "finer-than-nanosecond",
      message: `fraction carries detail finer than one nanosecond, which this package will not round away; received the number ${String(fraction)}. One nanosecond is nine decimal places of a second, and it is the finest value Temporal can hold`,
    };
  }
  return undefined;
}

/**
 * Check a `fraction` against the contract and read it as whole nanoseconds.
 *
 * Nothing is rounded. A value carrying detail below one nanosecond is REFUSED,
 * because rounding it away would silently change what the sender said, and this
 * package exists to not do that.
 *
 * @internal Not exported from the package entry point.
 */
export function readFraction(fraction: number): FractionReading {
  const issue = fractionIssue(fraction);
  if (issue !== undefined) return { ok: false, issue };
  // fractionIssue has just read this same fraction and found a count.
  return { ok: true, nanoseconds: nanosecondsOf(fraction) as number };
}
