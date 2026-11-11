import { Temporal } from "temporal-polyfill";

import {
  AmbiguousLocalTimeError,
  DatePartsError,
  MissingZoneError,
  PrecisionError,
} from "./errors.js";
import { PRECISION_LADDER } from "./types.js";
import type { Precision, ZoneOptions } from "./types.js";
import { NANOSECONDS, OFFSET, held, inspectParts } from "./validate.js";

/** The narrowest Temporal type that carries everything a value states, and nothing more. */
export type TemporalValue =
  Temporal.PlainYearMonth | Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime;

/** Where each component sits on the precision ladder, and so in `held`. */
const YEAR = 0;
const MONTH = 1;
const DAY = 2;
const HOUR = 3;
const MINUTE = 4;
const SECOND = 5;
const FRACTION = 6;

/**
 * A validated value, read out of `held` into plain numbers.
 *
 * Every converter takes its components through this one function, straight after
 * validation and before it runs anything else, so what it converts is exactly
 * what was validated. A component below the value's precision reads as zero,
 * which is what Temporal's own defaults would make it; it is never rendered or
 * reported, because the precision says it is not there. `offsetMinutes` is
 * `undefined` when the value states none.
 */
interface Checked {
  readonly depth: number;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly nanoseconds: number;
  readonly offsetMinutes: number | undefined;
}

/** `held[index]`, or zero when the value's precision stops above it. */
function component(depth: number, index: number): number {
  return depth >= index ? (held[index] as number) : 0;
}

function check(value: unknown): Checked {
  const depth = inspectParts(value);
  if (typeof depth !== "number") throw new DatePartsError(depth);
  const offset = held[OFFSET] as number;
  return {
    depth,
    year: held[YEAR] as number,
    month: component(depth, MONTH),
    day: component(depth, DAY),
    hour: component(depth, HOUR),
    minute: component(depth, MINUTE),
    second: component(depth, SECOND),
    nanoseconds: depth === FRACTION ? (held[NANOSECONDS] as number) : 0,
    offsetMinutes: Number.isNaN(offset) ? undefined : offset,
  };
}

function precisionAt(depth: number): Precision {
  return PRECISION_LADDER[depth] as Precision;
}

/** The character code of the decimal digit `digit`. */
function digit(value: number): number {
  return 48 + value;
}

/** The character codes of the two digits of `value`, 0 to 99, as `[tens, ones]`. */
function tens(value: number): number {
  return digit(Math.trunc(value / 10));
}

function ones(value: number): number {
  return digit(value % 10);
}

const DASH = 45;
const PLUS = 43;
const COLON = 58;
const LETTER_T = 84;

/**
 * Signed minutes rendered as `+HH:MM` or `-HH:MM`.
 *
 * A present offset of zero renders `+00:00` rather than `Z`, so the ISO string
 * says the same thing the parts do: an offset was stated, and it was zero. An
 * ABSENT offset renders nothing at all, because unknown is not UTC.
 */
function formatOffset(offsetMinutes: number): string {
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.trunc(absolute / 60);
  const minutes = absolute % 60;
  return String.fromCharCode(
    offsetMinutes < 0 ? DASH : PLUS,
    tens(hours),
    ones(hours),
    COLON,
    tens(minutes),
    ones(minutes),
  );
}

/** Sub-second digits after a `.`, trimmed of trailing zeros but never to nothing. */
function formatFraction(nanoseconds: number): string {
  if (nanoseconds === 0) return ".0";
  let count = nanoseconds;
  let width = 9;
  while (count % 10 === 0) {
    count /= 10;
    width -= 1;
  }
  return `.${String(count).padStart(width, "0")}`;
}

/**
 * The days from 1970-01-01 to a proleptic Gregorian date, by whole-number
 * arithmetic on eras of 400 years (146,097 days each), so it is exact for every
 * date the contract admits.
 */
function daysFromEpoch(year: number, month: number, day: number): number {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/**
 * The exact instant a local time denotes at a fixed offset, in epoch
 * nanoseconds.
 *
 * At a fixed offset a local time maps to exactly one instant: there is no
 * transition to skip or repeat it. The seconds stay well inside the range a
 * double holds exactly (year 9999 is under 2.6e11 seconds), and the nanoseconds
 * are joined to them as a bigint, so nothing is rounded.
 */
function epochNanosecondsAt(parts: Checked, offsetMinutes: number): bigint {
  const seconds =
    daysFromEpoch(parts.year, parts.month, parts.day) * 86_400 +
    parts.hour * 3_600 +
    parts.minute * 60 +
    parts.second -
    offsetMinutes * 60;
  return BigInt(seconds) * 1_000_000_000n + BigInt(parts.nanoseconds);
}

/** The local date and time a value states, as Temporal fields with no zone. */
function localDateTime(parts: Checked): Temporal.PlainDateTime {
  return new Temporal.PlainDateTime(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    Math.floor(parts.nanoseconds / 1e6),
    Math.floor((parts.nanoseconds % 1e6) / 1e3),
    parts.nanoseconds % 1e3,
  );
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
 * @example
 * ```ts
 * toISO({ year: 1988 }); // '1988'
 * toISO({ year: 2026, month: 3, day: 9, hour: 8 }); // '2026-03-09T08'
 * toISO({ year: 2026, month: 3, day: 9, hour: 8, minute: 5, offsetMinutes: -300 });
 * // '2026-03-09T08:05-05:00'
 * ```
 *
 * @throws {DatePartsError} if the value does not satisfy the contract.
 */
export function toISO(value: unknown): string {
  const parts = check(value);
  const { depth, year, month, day, hour, minute, second } = parts;

  // Each precision is spelled in one allocation, from its digits' character
  // codes, rather than joined from padded pieces.
  const y0 = digit(Math.trunc(year / 1000));
  const y1 = digit(Math.trunc(year / 100) % 10);
  const y2 = digit(Math.trunc(year / 10) % 10);
  const y3 = digit(year % 10);
  if (depth === YEAR) return String.fromCharCode(y0, y1, y2, y3);

  const m0 = tens(month);
  const m1 = ones(month);
  if (depth === MONTH) return String.fromCharCode(y0, y1, y2, y3, DASH, m0, m1);

  const d0 = tens(day);
  const d1 = ones(day);
  if (depth === DAY) return String.fromCharCode(y0, y1, y2, y3, DASH, m0, m1, DASH, d0, d1);

  const suffix = parts.offsetMinutes === undefined ? "" : formatOffset(parts.offsetMinutes);
  const h0 = tens(hour);
  const h1 = ones(hour);
  if (depth === HOUR) {
    return (
      String.fromCharCode(y0, y1, y2, y3, DASH, m0, m1, DASH, d0, d1, LETTER_T, h0, h1) + suffix
    );
  }

  const i0 = tens(minute);
  const i1 = ones(minute);
  if (depth === MINUTE) {
    return (
      String.fromCharCode(
        y0,
        y1,
        y2,
        y3,
        DASH,
        m0,
        m1,
        DASH,
        d0,
        d1,
        LETTER_T,
        h0,
        h1,
        COLON,
        i0,
        i1,
      ) + suffix
    );
  }

  const clock = String.fromCharCode(
    y0,
    y1,
    y2,
    y3,
    DASH,
    m0,
    m1,
    DASH,
    d0,
    d1,
    LETTER_T,
    h0,
    h1,
    COLON,
    i0,
    i1,
    COLON,
    tens(second),
    ones(second),
  );
  if (depth === SECOND) return clock + suffix;
  return clock + formatFraction(parts.nanoseconds) + suffix;
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
 * @example
 * ```ts
 * toTemporal({ year: 2026, month: 3 }).toString(); // '2026-03'
 * toTemporal({ year: 2026, month: 3, day: 9 }).toString(); // '2026-03-09'
 * toTemporal({ year: 2026, month: 3, day: 9, hour: 8, minute: 5 }).toString();
 * // '2026-03-09T08:05:00'
 * ```
 *
 * @throws {DatePartsError} if the value does not satisfy the contract.
 * @throws {PrecisionError} for a year-only value.
 */
export function toTemporal(value: unknown): TemporalValue {
  const parts = check(value);

  if (parts.depth === YEAR) {
    throw new PrecisionError(
      "Temporal has no year-only type, and this package will not invent a month to reach one. Use toISO() to render a year-precision value, or precisionOf() to branch before converting",
      "year",
    );
  }

  // Built by each type's constructor from the numbers, with no property bag to
  // read and no intermediate Temporal object along the way.
  if (parts.depth === MONTH) return new Temporal.PlainYearMonth(parts.year, parts.month);
  if (parts.depth === DAY) return new Temporal.PlainDate(parts.year, parts.month, parts.day);
  if (parts.offsetMinutes !== undefined) return atFixedOffset(parts, parts.offsetMinutes);
  return localDateTime(parts);
}

/**
 * The zone names a probe has found to exist, so each is probed once rather than
 * on every call. A zone that exists keeps existing for the life of the process:
 * the zone data is the runtime's own and does not change under it. Only names
 * the probe accepted are kept, only strings, and never more than
 * {@link KNOWN_ZONES_LIMIT} of them, so no caller's input can grow it without
 * bound.
 */
const knownZones = new Set<string>();

/** The most zone names {@link knownZones} holds before it starts again. */
const KNOWN_ZONES_LIMIT = 512;

function assertKnownTimeZone(timeZone: string): void {
  if (knownZones.has(timeZone)) return;
  try {
    // A fixed epoch, so this probe never reads the host clock or the host zone.
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
  } catch {
    throw new RangeError(
      `unknown time zone ${JSON.stringify(timeZone)}: supply an IANA identifier such as "America/New_York", or an offset such as "+05:30"`,
    );
  }
  if (typeof timeZone !== "string") return;
  if (knownZones.size >= KNOWN_ZONES_LIMIT) knownZones.clear();
  knownZones.add(timeZone);
}

function isUsableOffset(offsetMinutes: number): boolean {
  return Number.isInteger(offsetMinutes) && offsetMinutes >= -1439 && offsetMinutes <= 1439;
}

function assertUsableOffset(offsetMinutes: number): void {
  if (!isUsableOffset(offsetMinutes)) {
    throw new RangeError(
      `offsetMinutes must be an integer in -1439 to 1439 (signed minutes from UTC); received ${String(offsetMinutes)}`,
    );
  }
}

/**
 * An `offsetMinutes` option that was usable when it was checked and is not when
 * it is read again, which only an accessor that changes its answer can do,
 * spelled as a zone name the way it always has been: padded decimal text, which
 * Temporal then accepts or refuses as a zone.
 */
function offsetAsZoneName(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.trunc(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/**
 * Decide which zone places this value on the timeline, or refuse: a fixed offset
 * in signed minutes, or the zone name the caller gave.
 *
 * The value's OWN `offsetMinutes` always wins. That is what the sender said, and
 * re-zoning it on a caller's say-so would move the instant. `options` therefore
 * apply only to a value whose offset is unknown, which is exactly the case they
 * exist for.
 */
function resolveTimeZone(parts: Checked, options: ZoneOptions | undefined): number | string {
  if (parts.offsetMinutes !== undefined) return parts.offsetMinutes;

  if (options?.timeZone !== undefined && options.offsetMinutes !== undefined) {
    throw new TypeError(
      "supply either timeZone or offsetMinutes, not both: two answers to one question is a guess waiting to happen",
    );
  }

  if (options?.offsetMinutes !== undefined) {
    assertUsableOffset(options.offsetMinutes);
    // Read once more, as the zone has always been built from this third read.
    const offsetMinutes = options.offsetMinutes;
    return isUsableOffset(offsetMinutes) ? offsetMinutes : offsetAsZoneName(offsetMinutes);
  }

  if (options?.timeZone !== undefined) {
    assertKnownTimeZone(options.timeZone);
    return options.timeZone;
  }

  throw new MissingZoneError(
    "this value carries no offsetMinutes, and no zone was supplied: an absolute instant needs a zone, and this package supplies none. Pass { timeZone } or { offsetMinutes }. It will not fall back to the host time zone, to UTC, or to any other default, because a fallback turns an unknown offset into a plausible wrong instant",
  );
}

/**
 * A value at a fixed offset, as a `ZonedDateTime` in that offset's zone.
 *
 * A fixed offset has no transitions, so a local time maps to exactly one instant
 * and there is nothing to disambiguate: the instant is computed, and the one
 * Temporal object returned is the only one built.
 */
function atFixedOffset(parts: Checked, offsetMinutes: number): Temporal.ZonedDateTime {
  return new Temporal.ZonedDateTime(
    epochNanosecondsAt(parts, offsetMinutes),
    formatOffset(offsetMinutes),
  );
}

/** How a named zone resolves a local time it skips or repeats: the earlier, then the later. */
const EARLIER = { disambiguation: "earlier", overflow: "reject" } as const;
const LATER = { disambiguation: "later", overflow: "reject" } as const;

/**
 * A value's local time placed in a named zone, or a refusal when the zone skips
 * or repeats it.
 *
 * Ambiguity is established by ASKING, not by catching. The two disambiguation
 * rules agree on every local time a zone maps exactly once, and disagree on
 * exactly the times a transition skips or repeats. Reading the answer off a
 * thrown message would instead relabel any other failure as a transition, and a
 * fixed offset zone, which has no transitions at all, would be told it did.
 */
function inNamedZone(parts: Checked, timeZone: string): Temporal.ZonedDateTime {
  const fields = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: Math.floor(parts.nanoseconds / 1e6),
    microsecond: Math.floor((parts.nanoseconds % 1e6) / 1e3),
    nanosecond: parts.nanoseconds % 1e3,
    timeZone,
  };
  const earliest = Temporal.ZonedDateTime.from(fields, EARLIER);
  const latest = Temporal.ZonedDateTime.from(fields, LATER);
  if (earliest.equals(latest)) return earliest;

  // A repeated local time still reads back as itself, at two offsets. A skipped
  // one cannot: both rules move it off the gap, so the wall clock shifts.
  const local = localDateTime(parts);
  const skipped = !earliest.toPlainDateTime().equals(local);
  throw new AmbiguousLocalTimeError(
    skipped
      ? `${local.toString()} does not exist in ${timeZone}: a daylight-saving transition skips it, so there is no instant to return. Say which side of the transition you mean by passing that offset as { offsetMinutes }`
      : `${local.toString()} happens twice in ${timeZone}: a daylight-saving transition repeats it, at ${earliest.offset} and again at ${latest.offset}, so there is no single instant to return. Choose the one you mean and pass it as { offsetMinutes }`,
  );
}

/**
 * Validate a value for an instant and decide its zone: the components and either
 * a fixed offset or a zone name, or the refusal.
 */
function placed(value: unknown, options: ZoneOptions | undefined): [Checked, number | string] {
  const parts = check(value);

  if (parts.depth < HOUR) {
    // A value below hour precision that also states no zone is missing BOTH, and
    // hearing about them one at a time is how a caller fixes one and comes back.
    // The precision is what is reported, because supplying a zone would not make
    // this value convertible, but the message says the zone is absent too, and
    // says as firmly as the zone refusal does that nothing will be defaulted.
    const alsoNoZone =
      parts.offsetMinutes === undefined &&
      options?.timeZone === undefined &&
      options?.offsetMinutes === undefined;
    const precision = precisionAt(parts.depth);

    throw new PrecisionError(
      `an absolute instant needs a time of day, and this value has ${precision} precision. Supplying one would mean inventing components the value does not carry. Use toTemporal() for the calendar value${
        alsoNoZone
          ? ". The zone is missing too: this value carries no offsetMinutes and no { timeZone } or { offsetMinutes } was supplied, and neither the host time zone nor UTC will be used in their place"
          : ""
      }`,
      precision,
    );
  }

  return [parts, resolveTimeZone(parts, options)];
}

/**
 * Place a value on the timeline in a stated zone.
 *
 * Requires a time of day. A day-precision value is a calendar date, and turning
 * one into a zoned instant means choosing midnight, which is a component the
 * value does not carry. Use {@link toTemporal} for those.
 *
 * Requires a zone. If the value carries `offsetMinutes` that offset is used and
 * PRESERVED EXACTLY, never normalized to UTC or to the host zone, and `options`
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
 * @example
 * ```ts
 * const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };
 * toZonedDateTime(local, { timeZone: "America/New_York" }).toString();
 * // '2026-03-09T08:05:00-04:00[America/New_York]'
 * ```
 */
export function toZonedDateTime(value: unknown, options?: ZoneOptions): Temporal.ZonedDateTime {
  const [parts, zone] = placed(value, options);
  return typeof zone === "number" ? atFixedOffset(parts, zone) : inNamedZone(parts, zone);
}

/**
 * The absolute instant a value denotes, in a stated zone.
 *
 * Same requirements as {@link toZonedDateTime}: a time of day, and a zone that
 * something states. Nothing is defaulted.
 *
 * @example
 * ```ts
 * const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };
 * toInstant(local, { timeZone: "America/New_York" }).toString(); // '2026-03-09T12:05:00Z'
 * toInstant({ ...local, offsetMinutes: -300 }).toString(); // '2026-03-09T13:05:00Z'
 * ```
 */
export function toInstant(value: unknown, options?: ZoneOptions): Temporal.Instant {
  const [parts, zone] = placed(value, options);
  // At a fixed offset the instant is computed and built directly, with no zoned
  // value made on the way to it.
  return typeof zone === "number"
    ? new Temporal.Instant(epochNanosecondsAt(parts, zone))
    : inNamedZone(parts, zone).toInstant();
}
