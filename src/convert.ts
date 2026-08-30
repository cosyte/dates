import { Temporal } from 'temporal-polyfill';

import {
  AmbiguousLocalTimeError,
  DatePartsError,
  MissingZoneError,
  PrecisionError,
} from './errors.js';
import { readFraction } from './fraction.js';
import { PRECISION_LADDER } from './types.js';
import type { DateParts, Precision, ZoneOptions } from './types.js';
import { validateParts } from './validate.js';

/** The narrowest Temporal type that carries everything a value states, and nothing more. */
export type TemporalValue =
  Temporal.PlainYearMonth | Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime;

interface Checked {
  readonly parts: DateParts;
  readonly precision: Precision;
}

function check(value: unknown): Checked {
  const result = validateParts(value);
  if (!result.valid) throw new DatePartsError(result.issues);
  return { parts: result.parts, precision: result.precision };
}

function atLeast(precision: Precision, floor: Precision): boolean {
  return PRECISION_LADDER.indexOf(precision) >= PRECISION_LADDER.indexOf(floor);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Signed minutes rendered as `+HH:MM` or `-HH:MM`.
 *
 * A present offset of zero renders `+00:00` rather than `Z`, so the ISO string
 * says the same thing the parts do: an offset was stated, and it was zero. An
 * ABSENT offset renders nothing at all, because unknown is not UTC.
 */
function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.trunc(absolute / 60), 2)}:${pad(absolute % 60, 2)}`;
}

/**
 * The whole nanoseconds a fraction denotes.
 *
 * Every converter reads a fraction through the SAME function the validator uses,
 * so a value the validator has just certified can never reach a converter that
 * disagrees with it. A fraction the reader refuses is refused here with the
 * validator's own diagnostic rather than by leaking whatever Temporal makes of
 * a nonsense field.
 *
 * @throws {DatePartsError} if the fraction is not a whole number of nanoseconds.
 */
function nanosecondsOf(fraction: number): number {
  const reading = readFraction(fraction);
  if (!reading.ok) throw new DatePartsError([reading.issue]);
  return reading.nanoseconds;
}

/** Sub-second digits, trimmed of trailing zeros but never to nothing. */
function formatFraction(fraction: number): string {
  const digits = pad(nanosecondsOf(fraction), 9).replace(/0+$/, '');
  return `.${digits === '' ? '0' : digits}`;
}

function subSecondFields(fraction: number | undefined): {
  millisecond?: number;
  microsecond?: number;
  nanosecond?: number;
} {
  if (fraction === undefined) return {};
  const nanoseconds = nanosecondsOf(fraction);
  return {
    millisecond: Math.floor(nanoseconds / 1e6),
    microsecond: Math.floor((nanoseconds % 1e6) / 1e3),
    nanosecond: nanoseconds % 1e3,
  };
}

/**
 * Render a value as an ISO 8601 string AT ITS OWN PRECISION.
 *
 * A year-only value renders `1988`; a month-only value renders `1988-05`. No
 * component the value did not state is ever added, so nothing here turns a year
 * of birth into the first of January.
 *
 * The result is a pure function of the parts. It does not read the host clock or
 * the host time zone, so it is identical under every `TZ`.
 *
 * @throws {DatePartsError} if the value does not satisfy the contract.
 */
export function toISO(value: unknown): string {
  const { parts, precision } = check(value);
  const suffix = parts.offsetMinutes === undefined ? '' : formatOffset(parts.offsetMinutes);

  let out = pad(parts.year ?? 0, 4);
  if (precision === 'year') return out;

  out += `-${pad(parts.month ?? 0, 2)}`;
  if (precision === 'month') return out;

  out += `-${pad(parts.day ?? 0, 2)}`;
  if (precision === 'day') return out;

  out += `T${pad(parts.hour ?? 0, 2)}`;
  if (precision === 'hour') return out + suffix;

  out += `:${pad(parts.minute ?? 0, 2)}`;
  if (precision === 'minute') return out + suffix;

  out += `:${pad(parts.second ?? 0, 2)}`;
  if (precision === 'second') return out + suffix;

  out += formatFraction(parts.fraction ?? 0);
  return out + suffix;
}

/**
 * Convert to the narrowest Temporal type that carries everything the value
 * states, and nothing it does not.
 *
 * | precision of the value | result |
 * |---|---|
 * | `month` | `Temporal.PlainYearMonth` |
 * | `day` | `Temporal.PlainDate`, with no time of day and no zone |
 * | `hour` and finer, no offset | `Temporal.PlainDateTime`, with no zone |
 * | `hour` and finer, with `offsetMinutes` | `Temporal.ZonedDateTime` at that exact offset |
 *
 * A year-only value has no Temporal counterpart and raises
 * {@link PrecisionError} rather than acquiring a month. Use {@link toISO} for
 * those, and {@link precisionOf} to branch.
 *
 * Components below the value's own precision are zero in the Temporal object,
 * because Temporal has no partial type below `PlainYearMonth`. The value's real
 * precision is still available from {@link precisionOf}; it is not lost, it just
 * cannot be carried by the returned object.
 *
 * @throws {DatePartsError} if the value does not satisfy the contract.
 * @throws {PrecisionError} for a year-only value.
 */
export function toTemporal(value: unknown): TemporalValue {
  const { parts, precision } = check(value);

  if (precision === 'year') {
    throw new PrecisionError(
      'Temporal has no year-only type, and this package will not invent a month to reach one. Use toISO() to render a year-precision value, or precisionOf() to branch before converting',
      precision,
    );
  }

  const year = parts.year ?? 0;
  const month = parts.month ?? 0;

  if (precision === 'month') {
    return Temporal.PlainYearMonth.from({ year, month }, { overflow: 'reject' });
  }

  const day = parts.day ?? 0;
  if (precision === 'day') {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
  }

  const fields = {
    year,
    month,
    day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
    ...subSecondFields(parts.fraction),
  };

  if (parts.offsetMinutes !== undefined) {
    return Temporal.ZonedDateTime.from(
      { ...fields, timeZone: formatOffset(parts.offsetMinutes) },
      { overflow: 'reject' },
    );
  }

  return Temporal.PlainDateTime.from(fields, { overflow: 'reject' });
}

function assertKnownTimeZone(timeZone: string): void {
  try {
    // A fixed epoch, so this probe never reads the host clock or the host zone.
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch {
    throw new RangeError(
      `unknown time zone ${JSON.stringify(timeZone)}: supply an IANA identifier such as "America/New_York", or an offset such as "+05:30"`,
    );
  }
}

function assertUsableOffset(offsetMinutes: number): void {
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < -1439 || offsetMinutes > 1439) {
    throw new RangeError(
      `offsetMinutes must be an integer in -1439-1439 (signed minutes from UTC); received ${String(offsetMinutes)}`,
    );
  }
}

/**
 * Decide which zone places this value on the timeline, or refuse.
 *
 * The value's OWN `offsetMinutes` always wins. That is what the sender said, and
 * re-zoning it on a caller's say-so would move the instant. `options` therefore
 * apply only to a value whose offset is unknown, which is exactly the case they
 * exist for.
 */
function resolveTimeZone(parts: DateParts, options: ZoneOptions | undefined): string {
  if (parts.offsetMinutes !== undefined) return formatOffset(parts.offsetMinutes);

  if (options?.timeZone !== undefined && options.offsetMinutes !== undefined) {
    throw new TypeError(
      'supply either timeZone or offsetMinutes, not both: two answers to one question is a guess waiting to happen',
    );
  }

  if (options?.offsetMinutes !== undefined) {
    assertUsableOffset(options.offsetMinutes);
    return formatOffset(options.offsetMinutes);
  }

  if (options?.timeZone !== undefined) {
    assertKnownTimeZone(options.timeZone);
    return options.timeZone;
  }

  throw new MissingZoneError(
    'this value carries no offsetMinutes, and no zone was supplied: an absolute instant needs a zone, and this package supplies none. Pass { timeZone } or { offsetMinutes }. It will not fall back to the host time zone, to UTC, or to any other default, because a fallback turns an unknown offset into a plausible wrong instant',
  );
}

/**
 * Place a value on the timeline in a stated zone.
 *
 * Requires a time of day. A day-precision value is a calendar date, and turning
 * one into a zoned instant means choosing midnight, which is a component the
 * value does not carry. Use {@link toTemporal} for those.
 *
 * Requires a zone. If the value carries `offsetMinutes` that offset is used and
 * PRESERVED EXACTLY, never normalised to UTC or to the host zone, and `options`
 * are not consulted. Otherwise `options.timeZone` or `options.offsetMinutes`
 * must say which zone the local time is in.
 *
 * A local time that a named zone skips or repeats across a daylight-saving
 * transition raises {@link AmbiguousLocalTimeError} rather than resolving to
 * one of the two candidates, because a silent pick shifts the value by an hour.
 *
 * @throws {DatePartsError} if the value does not satisfy the contract.
 * @throws {PrecisionError} if the value states no time of day.
 * @throws {MissingZoneError} if nothing says which zone applies.
 * @throws {AmbiguousLocalTimeError} at a daylight-saving transition.
 */
export function toZonedDateTime(value: unknown, options?: ZoneOptions): Temporal.ZonedDateTime {
  const { parts, precision } = check(value);

  if (!atLeast(precision, 'hour')) {
    // A value below hour precision that also states no zone is missing BOTH, and
    // hearing about them one at a time is how a caller fixes one and comes back.
    // The precision is what is reported, because supplying a zone would not make
    // this value convertible, but the message says the zone is absent too, and
    // says as firmly as the zone refusal does that nothing will be defaulted.
    const alsoNoZone =
      parts.offsetMinutes === undefined &&
      options?.timeZone === undefined &&
      options?.offsetMinutes === undefined;

    throw new PrecisionError(
      `an absolute instant needs a time of day, and this value has ${precision} precision. Supplying one would mean inventing components the value does not carry. Use toTemporal() for the calendar value${
        alsoNoZone
          ? '. The zone is missing too: this value carries no offsetMinutes and no { timeZone } or { offsetMinutes } was supplied, and neither the host time zone nor UTC will be used in their place'
          : ''
      }`,
      precision,
    );
  }

  const timeZone = resolveTimeZone(parts, options);
  const local = Temporal.PlainDateTime.from(
    {
      year: parts.year ?? 0,
      month: parts.month ?? 0,
      day: parts.day ?? 0,
      hour: parts.hour ?? 0,
      minute: parts.minute ?? 0,
      second: parts.second ?? 0,
      ...subSecondFields(parts.fraction),
    },
    { overflow: 'reject' },
  );

  // Ambiguity is established by ASKING, not by catching. The two disambiguation
  // rules agree on every local time a zone maps exactly once, and disagree on
  // exactly the times a transition skips or repeats. Reading the answer off a
  // thrown message would instead relabel any other failure as a transition, and
  // a fixed offset zone, which has no transitions at all, would be told it did.
  const earliest = local.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
  const latest = local.toZonedDateTime(timeZone, { disambiguation: 'later' });

  if (!earliest.equals(latest)) {
    // A repeated local time still reads back as itself, at two offsets. A skipped
    // one cannot: both rules move it off the gap, so the wall clock shifts.
    const skipped = !earliest.toPlainDateTime().equals(local);
    throw new AmbiguousLocalTimeError(
      skipped
        ? `${local.toString()} does not exist in ${timeZone}: a daylight-saving transition skips it, so there is no instant to return. Say which side of the transition you mean by passing that offset as { offsetMinutes }`
        : `${local.toString()} happens twice in ${timeZone}: a daylight-saving transition repeats it, at ${earliest.offset} and again at ${latest.offset}, so there is no single instant to return. Choose the one you mean and pass it as { offsetMinutes }`,
    );
  }

  return earliest;
}

/**
 * The absolute instant a value denotes, in a stated zone.
 *
 * Same requirements as {@link toZonedDateTime}: a time of day, and a zone that
 * something states. Nothing is defaulted.
 */
export function toInstant(value: unknown, options?: ZoneOptions): Temporal.Instant {
  return toZonedDateTime(value, options).toInstant();
}
