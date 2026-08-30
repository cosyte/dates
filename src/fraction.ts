import type { ValidationIssue } from './types.js';

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

/** `0`, or `0.` followed by the sub-second digits. */
const PLAIN_DECIMAL = /^0(?:\.(\d+))?$/;

/** JavaScript prints a magnitude below `1e-6` in exponential form: `1e-9`, `1.5e-7`. */
const EXPONENTIAL_DECIMAL = /^(\d)(?:\.(\d+))?e-(\d+)$/;

/**
 * The digits after the decimal point of the shortest decimal that round-trips to
 * `fraction`, or `undefined` if the value has no such form.
 *
 * The shortest round-tripping decimal is the value's canonical spelling: it is
 * what `0.123456789` was written as, and every longer decimal that lands on the
 * same double is the same double.
 */
function fractionDigits(fraction: number): string | undefined {
  const text = String(fraction);

  const plain = PLAIN_DECIMAL.exec(text);
  if (plain !== null) return plain[1] ?? '';

  const exponential = EXPONENTIAL_DECIMAL.exec(text);
  if (exponential === null) return undefined;

  const lead = exponential[1] ?? '';
  const rest = exponential[2] ?? '';
  const exponent = Number(exponential[3]);
  return '0'.repeat(exponent - 1) + lead + rest;
}

/**
 * The whole nanoseconds `fraction` denotes, or `undefined` when it carries detail
 * finer than one nanosecond.
 *
 * `fraction` must already be known finite and in `[0, 1)`; {@link readFraction}
 * is the entry point that establishes both. The result is therefore always in
 * `[0, 999999999]`, never a whole second.
 */
export function nanosecondsOf(fraction: number): number | undefined {
  const digits = fractionDigits(fraction);
  if (digits === undefined || digits.length > NANOSECOND_DIGITS) return undefined;
  return digits === '' ? 0 : Number(digits.padEnd(NANOSECOND_DIGITS, '0'));
}

/** A fraction read as whole nanoseconds, or the diagnostic that refuses it. */
export type FractionReading =
  | { readonly ok: true; readonly nanoseconds: number }
  | { readonly ok: false; readonly issue: ValidationIssue };

/**
 * Check a `fraction` against the contract and read it as whole nanoseconds.
 *
 * Nothing is rounded. A value carrying detail below one nanosecond is REFUSED,
 * because rounding it away would silently change what the sender said, and this
 * package exists to not do that.
 */
export function readFraction(fraction: number): FractionReading {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) {
    return {
      ok: false,
      issue: {
        component: 'fraction',
        code: 'out-of-range',
        message: `fraction is a share of one second and must satisfy 0 <= fraction < 1; received the number ${String(fraction)}`,
      },
    };
  }

  const nanoseconds = nanosecondsOf(fraction);
  if (nanoseconds === undefined) {
    return {
      ok: false,
      issue: {
        component: 'fraction',
        code: 'finer-than-nanosecond',
        message: `fraction carries detail finer than one nanosecond, which this package will not round away; received the number ${String(fraction)}. One nanosecond is nine decimal places of a second, and it is the finest value Temporal can hold`,
      },
    };
  }

  return { ok: true, nanoseconds };
}
