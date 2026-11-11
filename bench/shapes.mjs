// The inputs of the bench, the profile and the scaling gate: date and time values in the shapes
// HL7 v2, FHIR and X12 carry them, as the date parts a @cosyte/* parser hands this package, each
// with the wire text it was read from. Every value is synthetic and built here from an index by a
// fixed linear congruential sequence, so every run builds the same values and no file is read.
//
// The byte count of a value is the length of its wire text: what a caller started from, and what a
// budget such as "peak heap under 20 times the input" is read against.

/** The offsets a value may carry, in signed minutes from UTC; `undefined` is an unstated offset. */
const OFFSETS = [-300, -240, -360, -420, -480, 0, 60, 120, 330, 345, 540, 600, -180, -600];

/** The zone a value with a time of day and no offset of its own is placed in. */
export const ZONE = "America/Chicago";

/** A fixed sequence of 32-bit numbers from a seed. */
function sequence(seed) {
  let state = (Math.imul(seed + 1, 2654435761) + 1013904223) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

/** An HL7 v2 offset, `+HHMM` or `-HHMM`. */
function hl7Offset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.trunc(abs / 60), 2)}${pad(abs % 60, 2)}`;
}

/** A FHIR offset, `Z` for zero or `+HH:MM` and `-HH:MM`. */
function fhirOffset(minutes) {
  if (minutes === 0) return "Z";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.trunc(abs / 60), 2)}:${pad(abs % 60, 2)}`;
}

/**
 * The shapes, in the mix a feed carries: dates of birth and service dates at day precision, event
 * and result times at minute and second precision, some with an offset and some without, sub-second
 * times from FHIR instants and HL7 timestamps, and the year and month precision a partial date of
 * birth has. Each takes the random fields and returns the parts and the wire text.
 */
const SHAPES = [
  // HL7 v2 DTM, a date of birth (PID-7): YYYYMMDD.
  (f) => ({
    parts: { year: f.year, month: f.month, day: f.day },
    text: `${pad(f.year, 4)}${pad(f.month, 2)}${pad(f.day, 2)}`,
  }),
  // HL7 v2 DTM, a message time (MSH-7) with an offset: YYYYMMDDHHMMSS+ZZZZ.
  (f) => ({
    parts: { ...f.date, hour: f.hour, minute: f.minute, second: f.second, offsetMinutes: f.offset },
    text: `${f.hl7Date}${pad(f.hour, 2)}${pad(f.minute, 2)}${pad(f.second, 2)}${hl7Offset(f.offset)}`,
  }),
  // HL7 v2 DTM, an observation time (OBX-14) with no offset: YYYYMMDDHHMM.
  (f) => ({
    parts: { ...f.date, hour: f.hour, minute: f.minute },
    text: `${f.hl7Date}${pad(f.hour, 2)}${pad(f.minute, 2)}`,
  }),
  // HL7 v2 DTM, a specimen time to four decimal places with an offset: YYYYMMDDHHMMSS.SSSS+ZZZZ.
  (f) => ({
    parts: {
      ...f.date,
      hour: f.hour,
      minute: f.minute,
      second: f.second,
      fraction: f.tenThousandths / 10_000,
      offsetMinutes: f.offset,
    },
    text: `${f.hl7Date}${pad(f.hour, 2)}${pad(f.minute, 2)}${pad(f.second, 2)}.${pad(f.tenThousandths, 4)}${hl7Offset(f.offset)}`,
  }),
  // HL7 v2 DTM, an admission hour with no offset: YYYYMMDDHH.
  (f) => ({ parts: { ...f.date, hour: f.hour }, text: `${f.hl7Date}${pad(f.hour, 2)}` }),
  // HL7 v2 DTM, a partial date of birth: YYYYMM.
  (f) => ({
    parts: { year: f.year, month: f.month },
    text: `${pad(f.year, 4)}${pad(f.month, 2)}`,
  }),
  // FHIR date, a birthDate: YYYY-MM-DD.
  (f) => ({ parts: { ...f.date }, text: f.fhirDate }),
  // FHIR dateTime, an effectiveDateTime with an offset: YYYY-MM-DDThh:mm:ss+zz:zz.
  (f) => ({
    parts: { ...f.date, hour: f.hour, minute: f.minute, second: f.second, offsetMinutes: f.offset },
    text: `${f.fhirDate}T${pad(f.hour, 2)}:${pad(f.minute, 2)}:${pad(f.second, 2)}${fhirOffset(f.offset)}`,
  }),
  // FHIR instant, a meta.lastUpdated in UTC to the millisecond: YYYY-MM-DDThh:mm:ss.sssZ.
  (f) => ({
    parts: {
      ...f.date,
      hour: f.hour,
      minute: f.minute,
      second: f.second,
      fraction: f.milliseconds / 1000,
      offsetMinutes: 0,
    },
    text: `${f.fhirDate}T${pad(f.hour, 2)}:${pad(f.minute, 2)}:${pad(f.second, 2)}.${pad(f.milliseconds, 3)}Z`,
  }),
  // FHIR date, a partial birthDate: YYYY.
  (f) => ({ parts: { year: f.year }, text: pad(f.year, 4) }),
  // FHIR dateTime to the millisecond with an offset: YYYY-MM-DDThh:mm:ss.sss+zz:zz.
  (f) => ({
    parts: {
      ...f.date,
      hour: f.hour,
      minute: f.minute,
      second: f.second,
      fraction: f.milliseconds / 1000,
      offsetMinutes: f.offset,
    },
    text: `${f.fhirDate}T${pad(f.hour, 2)}:${pad(f.minute, 2)}:${pad(f.second, 2)}.${pad(f.milliseconds, 3)}${fhirOffset(f.offset)}`,
  }),
  // X12 DTP, a service date (D8): CCYYMMDD.
  (f) => ({ parts: { ...f.date }, text: f.hl7Date }),
  // X12 DTP, a date of birth (D8) in a 271 or an 837: CCYYMMDD.
  (f) => ({
    parts: { year: f.year, month: f.month, day: f.day },
    text: `${pad(f.year, 4)}${pad(f.month, 2)}${pad(f.day, 2)}`,
  }),
  // X12 DTM, a date and a time with no zone code: CCYYMMDD and HHMM.
  (f) => ({
    parts: { ...f.date, hour: f.hour, minute: f.minute },
    text: `${f.hl7Date}*${pad(f.hour, 2)}${pad(f.minute, 2)}`,
  }),
  // X12 DTM, a date and a time to the second: CCYYMMDD and HHMMSS.
  (f) => ({
    parts: { ...f.date, hour: f.hour, minute: f.minute, second: f.second },
    text: `${f.hl7Date}*${pad(f.hour, 2)}${pad(f.minute, 2)}${pad(f.second, 2)}`,
  }),
  // X12 time to hundredths of a second (HHMMSSDD), with the time code UT: CCYYMMDD and HHMMSSDD.
  (f) => ({
    parts: {
      ...f.date,
      hour: f.hour,
      minute: f.minute,
      second: f.second,
      fraction: f.hundredths / 100,
      offsetMinutes: 0,
    },
    text: `${f.hl7Date}*${pad(f.hour, 2)}${pad(f.minute, 2)}${pad(f.second, 2)}${pad(f.hundredths, 2)}*UT`,
  }),
];

/** How many shapes there are: a batch of this many values holds each of them once. */
export const SHAPE_COUNT = SHAPES.length;

/**
 * The `index`-th value of the mix: its parts, its wire text, and its precision class. Hours run
 * from 6 to 21, so a value placed in `ZONE` never falls in a daylight-saving gap or repeat; days run
 * to 28, so every date exists.
 */
export function value(index) {
  const next = sequence(index);
  const year = 1930 + (next() % 97);
  const month = 1 + (next() % 12);
  const day = 1 + (next() % 28);
  const f = {
    year,
    month,
    day,
    hour: 6 + (next() % 16),
    minute: next() % 60,
    second: next() % 60,
    milliseconds: next() % 1000,
    hundredths: next() % 100,
    tenThousandths: next() % 10_000,
    offset: OFFSETS[next() % OFFSETS.length],
    date: { year, month, day },
    hl7Date: `${pad(year, 4)}${pad(month, 2)}${pad(day, 2)}`,
    fhirDate: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
  };
  const shape = SHAPES[index % SHAPES.length];
  return shape(f);
}

/** `count` values of the mix, starting at `start`. */
export function values(start, count) {
  return Array.from({ length: count }, (_v, k) => value(start + k));
}

/** The bytes of the wire text the values were read from. */
export function bytesOf(list) {
  return list.reduce((n, v) => n + v.text.length, 0);
}

/** Whether a value states a month, the least a Temporal type can hold. */
export function hasMonth(v) {
  return v.parts.month !== undefined;
}

/** Whether a value states a time of day, the least an instant needs. */
export function hasTime(v) {
  return v.parts.hour !== undefined;
}

/**
 * The options `toInstant` takes for a value: none when it carries its own offset, `ZONE` when it
 * does not. A value's own offset always wins, so a caller with a feed's zone passes it every time;
 * here it is passed only where it is read, so the offset path and the zone path stay apart.
 */
export function zoneFor(v) {
  return v.parts.offsetMinutes === undefined ? { timeZone: ZONE } : undefined;
}
