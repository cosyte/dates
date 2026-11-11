/**
 * The corpus the output-equivalence test runs over, and the record it takes of one case.
 *
 * Shared by the capture script (`test/support/capture-output-digests.ts`, which runs it against a
 * base ref) and by the test that asserts head against the captured digests
 * (`test/output-equivalence.test.ts`), so the two can never come to disagree about what a case is
 * or what "the outputs" are.
 *
 * The record is everything a caller can observe of one value: what `validateParts`,
 * `isValidParts`, `assertValidParts`, `precisionOf`, `toISO` and `toTemporal` return or throw, and
 * what `toZonedDateTime` and `toInstant` return or throw under every zone option of the case. A
 * returned Temporal object is recorded by its type, its text and its exact epoch nanoseconds and
 * offset; a thrown error by its class, name, message, issues and precision; a validation result by
 * its JSON and the property descriptors of it and its parts. A value or an options object that is a
 * proxy also records every property it was asked for, in order, so a change that reads a component
 * twice, or in another order, shows. A change meant to make these faster and nothing else must
 * leave every record byte-identical, which is what the digests pin.
 *
 * Every value is synthetic and built here in code: the bench's own mix (`bench/shapes.mjs`), the
 * edges of every range, every sub-second spelling, hostile arguments, and local times at
 * daylight-saving transitions in named zones.
 */

import { createHash } from "node:crypto";

import { values as benchValues } from "../../bench/shapes.mjs";

import type * as Dates from "../../src/index.js";

/** The surface a record reads, the same on the base tree and on head. */
export type OutputApi = typeof Dates;

/** One case: a value, built fresh for every call, and the zone options to convert it under. */
export interface OutputCase {
  readonly name: string;
  readonly value: () => unknown;
  readonly options: readonly OptionsCase[];
}

/** One zone option, built fresh for every call. */
export interface OptionsCase {
  readonly name: string;
  readonly options: () => unknown;
}

/** An options object whose `key` answers each read with the next of `answers`, then the last. */
function changing(key: string, answers: readonly unknown[]): object {
  let reads = 0;
  return Object.defineProperty({}, key, {
    enumerable: true,
    get() {
      const answer = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return answer;
    },
  });
}

const NO_OPTIONS: OptionsCase = { name: "none", options: () => undefined };

/** Zone options for a value with a time of day: named zones, offsets, and each refusal. */
const ZONE_OPTIONS: readonly OptionsCase[] = [
  NO_OPTIONS,
  ...[
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Australia/Lord_Howe",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Pacific/Kiritimati",
    "UTC",
    "+05:30",
    "-00:00",
    "america/chicago",
    "Mars/Olympus_Mons",
    "",
    "America/Chicago ",
  ].map((timeZone) => ({
    name: `timeZone ${JSON.stringify(timeZone)}`,
    options: () => ({ timeZone }),
  })),
  ...[-1439, -300, 0, 345, 1439, 1440, -1440, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map(
    (offsetMinutes) => ({
      name: `offsetMinutes ${String(offsetMinutes)}`,
      options: () => ({ offsetMinutes }),
    }),
  ),
  { name: "both", options: () => ({ timeZone: "UTC", offsetMinutes: 0 }) },
  { name: "empty object", options: () => ({}) },
  {
    name: "explicit undefineds",
    options: () => ({ timeZone: undefined, offsetMinutes: undefined }),
  },
  { name: "timeZone a number", options: () => ({ timeZone: 5 }) },
  { name: "timeZone null", options: () => ({ timeZone: null }) },
  { name: "offsetMinutes a string", options: () => ({ offsetMinutes: "-300" }) },
  // Accessors that change their answer between reads, so which read is used shows.
  {
    name: "offset changes on its third read",
    options: () => changing("offsetMinutes", [-300, -300, 1.5]),
  },
  {
    name: "offset changes sign on its third read",
    options: () => changing("offsetMinutes", [-300, -300, -90.5]),
  },
  {
    name: "offset changes on its second read",
    options: () => changing("offsetMinutes", [-300, 1.5, -300]),
  },
  {
    name: "zone changes on its fourth read",
    options: () =>
      changing("timeZone", [
        "America/Chicago",
        "America/Chicago",
        "America/Chicago",
        "Mars/Olympus_Mons",
      ]),
  },
  {
    name: "zone changes on its third read",
    options: () =>
      changing("timeZone", [
        "America/Chicago",
        "America/Chicago",
        "Mars/Olympus_Mons",
        "America/Chicago",
      ]),
  },
  { name: "proxy over a named zone", options: () => ({ timeZone: "America/Chicago" }) },
  { name: "proxy over an offset", options: () => ({ offsetMinutes: -300 }) },
];

/** The options a case with no time of day is converted under: enough to see each refusal. */
const FEW_OPTIONS: readonly OptionsCase[] = [
  NO_OPTIONS,
  { name: "timeZone America/Chicago", options: () => ({ timeZone: "America/Chicago" }) },
  { name: "offsetMinutes -300", options: () => ({ offsetMinutes: -300 }) },
  { name: "both", options: () => ({ timeZone: "UTC", offsetMinutes: 0 }) },
];

/** The two options the bench's own mix is converted under, as a feed would be. */
const FEED_OPTIONS: readonly OptionsCase[] = [
  NO_OPTIONS,
  { name: "timeZone America/Chicago", options: () => ({ timeZone: "America/Chicago" }) },
  { name: "offsetMinutes 330", options: () => ({ offsetMinutes: 330 }) },
];

/** A class whose components are accessors on its prototype, a shape a parser may hand over. */
class AccessorParts {
  readonly #fields: Record<string, number>;
  constructor(fields: Record<string, number>) {
    this.#fields = fields;
  }
  get year(): number | undefined {
    return this.#fields["year"];
  }
  get month(): number | undefined {
    return this.#fields["month"];
  }
  get day(): number | undefined {
    return this.#fields["day"];
  }
  get hour(): number | undefined {
    return this.#fields["hour"];
  }
  get minute(): number | undefined {
    return this.#fields["minute"];
  }
  get second(): number | undefined {
    return this.#fields["second"];
  }
  get fraction(): number | undefined {
    return this.#fields["fraction"];
  }
  get offsetMinutes(): number | undefined {
    return this.#fields["offsetMinutes"];
  }
}

/** A value whose `component` throws when read. */
function throwingOn(component: string, rest: Record<string, unknown>): () => unknown {
  return () => {
    const value: Record<string, unknown> = { ...rest };
    Object.defineProperty(value, component, {
      enumerable: true,
      get() {
        throw new Error("synthetic accessor failure");
      },
    });
    return value;
  };
}

/** Values written here for the edges of every rule. */
function writtenValues(): [string, () => unknown][] {
  const out: [string, () => unknown][] = [];
  const add = (name: string, value: unknown): void => {
    out.push([
      name,
      () => (typeof value === "object" && value !== null ? structuredCopy(value) : value),
    ]);
  };

  // Not a parts object at all.
  add("null", null);
  add("undefined", undefined);
  add("zero", 0);
  add("NaN", Number.NaN);
  add("Infinity", Number.POSITIVE_INFINITY);
  add("-Infinity", Number.NEGATIVE_INFINITY);
  add("a string", "1988-05-07");
  add("true", true);
  add("a bigint", 1988n);
  out.push(["a symbol", () => Symbol("synthetic")]);
  out.push(["a function", () => () => 1988]);
  out.push(["a Date", () => new Date(Date.UTC(1988, 4, 7))]);
  add("an array", [1988, 5, 7]);
  add("an empty object", {});

  // One component at a time, in and out of range.
  const ranges: [string, number[]][] = [
    ["year", [999, 1000, 1988, 9999, 10000, 88, -1988, 0]],
    ["month", [0, 1, 12, 13, -1]],
    ["day", [0, 1, 28, 29, 30, 31, 32]],
    ["hour", [-1, 0, 23, 24]],
    ["minute", [-1, 0, 59, 60]],
    ["second", [-1, 0, 59, 60]],
    ["offsetMinutes", [-1440, -1439, -1, 0, 1, 1439, 1440]],
  ];
  const full = { year: 2024, month: 2, day: 29, hour: 13, minute: 45, second: 30 };
  for (const [component, numbers] of ranges) {
    for (const n of numbers) add(`${component} ${String(n)}`, { ...full, [component]: n });
  }

  // Every way a component can fail to be a whole number.
  const bad: [string, unknown][] = [
    ["a string", "5"],
    ["null", null],
    ["a boolean", false],
    ["a bigint", 5n],
    ["an object", { value: 5 }],
    ["an array", [5]],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a non-integer", 5.5],
    ["negative zero", -0],
  ];
  for (const component of ["year", "month", "day", "hour", "minute", "second", "offsetMinutes"]) {
    for (const [label, raw] of bad) {
      add(`${component} ${label}`, { ...full, offsetMinutes: -300, [component]: raw });
    }
  }
  out.push(["month a symbol", () => ({ year: 1988, month: Symbol("m") })]);
  out.push(["month a function", () => ({ year: 1988, month: () => 5 })]);

  // Every sub-second spelling the reader sees.
  const fractions = [
    0,
    -0,
    0.5,
    0.1,
    0.25,
    0.001,
    0.123,
    0.1234,
    0.123456,
    0.123456789,
    0.999999999,
    0.99,
    0.000001,
    0.0000001,
    0.00000001,
    1e-9,
    5e-9,
    1.5e-9,
    2.5e-10,
    1e-10,
    0.1234567891,
    0.9999999999,
    0.99999999999,
    0.999999999999,
    0.3,
    0.7,
    0.07,
    0.007,
    0.0007,
    0.00007,
    0.000007,
    1.234e-7,
    9.99e-7,
    0.1 + 0.2,
    1 - 3e-9,
    1 / 3,
    2 / 3,
    1,
    -0.5,
    1.5,
    Number.MIN_VALUE,
    Number.EPSILON,
  ];
  for (const fraction of fractions) {
    const label = Object.is(fraction, -0) ? "-0" : String(fraction);
    add(`fraction ${label} offset`, { ...full, fraction, offsetMinutes: 60 });
    add(`fraction ${label} local`, { ...full, fraction });
  }
  add("fraction NaN", { ...full, fraction: Number.NaN });
  add("fraction a string", { ...full, fraction: "0.5" });

  // Contiguity, offsets without a time, and several faults at once.
  add("month alone", { month: 5 });
  add("year and day", { year: 1988, day: 7 });
  add("year and hour", { year: 1988, hour: 7 });
  add("fraction alone", { fraction: 0.5 });
  add("offset alone", { offsetMinutes: 0 });
  add("offset on a date", { year: 1988, month: 5, day: 7, offsetMinutes: -300 });
  add("offset on a year", { year: 1988, offsetMinutes: -300 });
  add("gaps everywhere", { year: 1988, minute: 5, fraction: 0.5, offsetMinutes: 2000 });
  add("everything wrong", {
    year: 88,
    month: 13,
    day: 40,
    hour: 24,
    minute: 60,
    second: 60,
    fraction: 1,
    offsetMinutes: 1440,
  });
  add("explicit undefineds", {
    year: 1988,
    month: undefined,
    day: undefined,
    hour: undefined,
    minute: undefined,
    second: undefined,
    fraction: undefined,
    offsetMinutes: undefined,
  });
  add("unknown properties", { year: 1988, month: 5, day: 7, weekday: 6, zone: "UTC" });

  // Calendar dates, each month's last day and one past it, in a leap and a common year.
  for (const year of [1900, 2000, 2023, 2024]) {
    for (let month = 1; month <= 12; month += 1) {
      for (const day of [28, 29, 30, 31])
        add(`${String(year)}-${String(month)}-${String(day)}`, { year, month, day });
    }
  }

  // Each precision, with and without an offset, at the ends of the representable range.
  const ladder = [
    { year: 1000 },
    { year: 1000, month: 1 },
    { year: 1000, month: 1, day: 1 },
    { year: 1000, month: 1, day: 1, hour: 0 },
    { year: 1000, month: 1, day: 1, hour: 0, minute: 0 },
    { year: 1000, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    { year: 1000, month: 1, day: 1, hour: 0, minute: 0, second: 0, fraction: 0 },
    { year: 9999, month: 12, day: 31, hour: 23, minute: 59, second: 59, fraction: 0.999999999 },
  ];
  for (const [i, parts] of ladder.entries()) {
    add(`range edge ${String(i)}`, parts);
    add(`range edge ${String(i)} -1439`, { ...parts, offsetMinutes: -1439 });
    add(`range edge ${String(i)} +1439`, { ...parts, offsetMinutes: 1439 });
  }

  // Local times at daylight-saving transitions, and at a zone's first transition from mean time.
  const transitions: [string, Record<string, number>][] = [
    ["New York gap", { year: 2026, month: 3, day: 8, hour: 2, minute: 30 }],
    ["New York gap edge", { year: 2026, month: 3, day: 8, hour: 2, minute: 0 }],
    ["New York after gap", { year: 2026, month: 3, day: 8, hour: 3, minute: 0 }],
    [
      "New York before gap",
      { year: 2026, month: 3, day: 8, hour: 1, minute: 59, second: 59, fraction: 0.999999999 },
    ],
    ["New York repeat", { year: 2026, month: 11, day: 1, hour: 1, minute: 30 }],
    ["New York repeat start", { year: 2026, month: 11, day: 1, hour: 1 }],
    ["New York after repeat", { year: 2026, month: 11, day: 1, hour: 2 }],
    [
      "London gap",
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30, second: 15, fraction: 0.25 },
    ],
    ["London repeat", { year: 2026, month: 10, day: 25, hour: 1, minute: 30 }],
    ["Lord Howe repeat", { year: 2026, month: 4, day: 5, hour: 1, minute: 45 }],
    ["Lord Howe gap", { year: 2026, month: 10, day: 4, hour: 2, minute: 15 }],
    ["Chicago mean time", { year: 1883, month: 11, day: 18, hour: 12, minute: 5 }],
    ["Chicago before mean time ended", { year: 1883, month: 11, day: 18, hour: 11, minute: 59 }],
    ["Kiritimati skipped day", { year: 1994, month: 12, day: 31, hour: 12 }],
    ["Kolkata mean time", { year: 1900, month: 1, day: 1, hour: 0, minute: 0, second: 0 }],
  ];
  for (const [name, parts] of transitions) {
    add(name, parts);
    add(`${name} with an offset`, { ...parts, offsetMinutes: -300 });
  }

  return out;
}

/** A deep copy of a plain value, so a case never shares an object between calls. */
function structuredCopy(value: object): unknown {
  if (Array.isArray(value))
    return value.map((item: unknown) =>
      typeof item === "object" && item !== null ? structuredCopy(item) : item,
    );
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value) as [string, unknown][]) {
    out[key] = typeof item === "object" && item !== null ? structuredCopy(item) : item;
  }
  return out;
}

/** The corpus: every case, built in code and the same on every run. */
export function outputCorpus(): OutputCase[] {
  const cases: OutputCase[] = [];
  const optionsFor = (value: unknown): readonly OptionsCase[] => {
    if (typeof value !== "object" || value === null) return FEW_OPTIONS;
    const hour = (value as Record<string, unknown>)["hour"];
    return hour === undefined ? FEW_OPTIONS : ZONE_OPTIONS;
  };

  for (const [name, value] of writtenValues()) {
    let probe: unknown;
    try {
      probe = value();
    } catch {
      probe = undefined;
    }
    cases.push({ name: `written: ${name}`, value, options: optionsFor(probe) });
  }

  // Accessors: on a class prototype, throwing, and a proxy that logs what it is asked for.
  const stamp = { year: 2026, month: 3, day: 9, hour: 8, minute: 5, second: 7, fraction: 0.125 };
  cases.push(
    {
      name: "accessor: class instance",
      value: () => new AccessorParts(stamp),
      options: ZONE_OPTIONS,
    },
    {
      name: "accessor: class instance with an offset",
      value: () => new AccessorParts({ ...stamp, offsetMinutes: 330 }),
      options: FEW_OPTIONS,
    },
    {
      name: "accessor: null prototype",
      value: () => Object.assign(Object.create(null) as object, stamp),
      options: FEW_OPTIONS,
    },
  );
  for (const component of [
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "second",
    "fraction",
    "offsetMinutes",
  ]) {
    cases.push({
      name: `accessor: ${component} throws`,
      value: throwingOn(component, stamp),
      options: FEW_OPTIONS,
    });
  }
  cases.push(
    { name: "proxy: a full stamp", value: () => stamp, options: ZONE_OPTIONS },
    {
      name: "proxy: a date",
      value: () => ({ year: 1988, month: 5, day: 7 }),
      options: FEW_OPTIONS,
    },
    {
      name: "proxy: an invalid value",
      value: () => ({ year: 88, day: 40, offsetMinutes: 1.5 }),
      options: FEW_OPTIONS,
    },
  );

  // The bench's own mix, as a feed carries it.
  for (const [i, v] of benchValues(0, 480).entries()) {
    cases.push({
      name: `bench: ${String(i)} ${v.text}`,
      value: () => ({ ...v.parts }),
      options: FEED_OPTIONS,
    });
  }

  return cases;
}

/** What a property read log records: every trap, in order. */
type ReadLog = string[];

/** Wrap `target` so every property read and prototype lookup is logged under `label`. */
function logged(target: object, label: string, log: ReadLog): object {
  return new Proxy(target, {
    get(t, key, receiver) {
      log.push(`${label}.get ${String(key)}`);
      return Reflect.get(t, key, receiver) as unknown;
    },
    has(t, key) {
      log.push(`${label}.has ${String(key)}`);
      return Reflect.has(t, key);
    },
    getPrototypeOf(t) {
      log.push(`${label}.getPrototypeOf`);
      return Reflect.getPrototypeOf(t);
    },
    ownKeys(t) {
      log.push(`${label}.ownKeys`);
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, key) {
      log.push(`${label}.getOwnPropertyDescriptor ${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
  });
}

/** A value made safe for JSON: bigints, symbols, functions, undefined and non-finite numbers named. */
function plain(value: unknown, api: OutputApi): unknown {
  if (value === undefined) return "<undefined>";
  if (typeof value === "bigint") return `<bigint ${value.toString()}>`;
  if (typeof value === "symbol") return `<symbol ${value.description ?? ""}>`;
  if (typeof value === "function") return "<function>";
  if (typeof value === "number") {
    if (Object.is(value, -0)) return "<-0>";
    if (!Number.isFinite(value)) return `<number ${String(value)}>`;
    return value;
  }
  if (typeof value !== "object" || value === null) return value;
  const temporal = temporalRecord(value, api);
  if (temporal !== undefined) return temporal;
  if (Array.isArray(value)) return value.map((item: unknown) => plain(item, api));
  const out: Record<string, unknown> = {
    "<prototype>": prototypeName(value),
    "<descriptors>": Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key, d]) => [
      key,
      d.writable ?? "accessor",
      d.enumerable,
      d.configurable,
    ]),
  };
  for (const [key, item] of Object.entries(value)) out[key] = plain(item, api);
  return out;
}

function prototypeName(value: object): string {
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto === null) return "null";
  if (proto === Object.prototype) return "Object";
  if (proto === Array.prototype) return "Array";
  return Object.prototype.toString.call(value);
}

/** A Temporal object by its type, its text, and the exact values its text could round. */
function temporalRecord(value: object, api: OutputApi): unknown {
  const T = api.Temporal;
  const types: [string, unknown][] = [
    ["Instant", T.Instant],
    ["ZonedDateTime", T.ZonedDateTime],
    ["PlainDateTime", T.PlainDateTime],
    ["PlainDate", T.PlainDate],
    ["PlainYearMonth", T.PlainYearMonth],
    ["PlainTime", T.PlainTime],
    ["PlainMonthDay", T.PlainMonthDay],
    ["Duration", T.Duration],
  ];
  const matches = types
    .filter(([, ctor]) => value instanceof (ctor as new () => object))
    .map(([name]) => name);
  if (matches.length === 0) return undefined;
  const record: Record<string, unknown> = {
    "<temporal>": matches,
    tag: Object.prototype.toString.call(value),
    string: (value as { toString(): string }).toString(),
    json: (value as { toJSON(): string }).toJSON(),
    ownKeys: Reflect.ownKeys(value).map(String),
  };
  if (value instanceof T.Instant) record["epochNanoseconds"] = value.epochNanoseconds.toString();
  if (value instanceof T.ZonedDateTime) {
    record["epochNanoseconds"] = value.epochNanoseconds.toString();
    record["offset"] = value.offset;
    record["offsetNanoseconds"] = value.offsetNanoseconds;
    record["timeZoneId"] = value.timeZoneId;
    record["calendarId"] = value.calendarId;
    record["full"] = value.toString({ calendarName: "always", smallestUnit: "nanosecond" });
  }
  if (value instanceof T.PlainDateTime) {
    record["calendarId"] = value.calendarId;
    record["full"] = value.toString({ calendarName: "always", smallestUnit: "nanosecond" });
  }
  if (value instanceof T.PlainDate || value instanceof T.PlainYearMonth) {
    record["calendarId"] = value.calendarId;
    record["full"] = value.toString({ calendarName: "always" });
  }
  return record;
}

/** An error by everything a caller can read off it, except its stack. */
function errorRecord(error: unknown, api: OutputApi): unknown {
  if (!(error instanceof Error)) return { thrownNonError: plain(error, api) };
  const record: Record<string, unknown> = {
    tag: Object.prototype.toString.call(error),
    constructor: error.constructor.name,
    name: error.name,
    message: error.message,
    ownKeys: Reflect.ownKeys(error)
      .map(String)
      .filter((key) => key !== "stack")
      .sort(),
    is: {
      DatePartsError: error instanceof api.DatePartsError,
      MissingZoneError: error instanceof api.MissingZoneError,
      PrecisionError: error instanceof api.PrecisionError,
      AmbiguousLocalTimeError: error instanceof api.AmbiguousLocalTimeError,
      TypeError: error instanceof TypeError,
      RangeError: error instanceof RangeError,
    },
  };
  const extra = error as unknown as Record<string, unknown>;
  if ("issues" in extra) record["issues"] = plain(extra["issues"], api);
  if ("precision" in extra) record["precision"] = plain(extra["precision"], api);
  return record;
}

/** What one call returned, or what it threw. */
function attempt(run: () => unknown, api: OutputApi): unknown {
  try {
    return { returned: plain(run(), api) };
  } catch (error) {
    return { threw: errorRecord(error, api) };
  }
}

/** Whether a case's value and options are wrapped in a logging proxy. */
function proxied(name: string): boolean {
  return name.startsWith("proxy: ");
}

/** Everything a caller can observe of one case, as one JSON text. */
export function recordOf(api: OutputApi, c: OutputCase): string {
  const log: ReadLog = [];
  const fresh = (): unknown => {
    const value = c.value();
    return proxied(c.name) && typeof value === "object" && value !== null
      ? logged(value, "value", log)
      : value;
  };
  const freshOptions = (o: OptionsCase): unknown => {
    const options = o.options();
    return o.name.startsWith("proxy ") && typeof options === "object" && options !== null
      ? logged(options, "options", log)
      : options;
  };

  const record: Record<string, unknown> = {};
  const step = (label: string, run: () => unknown): void => {
    log.length = 0;
    const outcome = attempt(run, api);
    record[label] = log.length === 0 ? outcome : { outcome, reads: [...log] };
  };

  step("validateParts", () => api.validateParts(fresh()));
  step("isValidParts", () => api.isValidParts(fresh()));
  step("assertValidParts", () => api.assertValidParts(fresh()));
  step("precisionOf", () => api.precisionOf(fresh()));
  step("toISO", () => api.toISO(fresh()));
  step("toTemporal", () => api.toTemporal(fresh()));
  for (const o of c.options) {
    step(`toZonedDateTime ${o.name}`, () =>
      api.toZonedDateTime(fresh(), freshOptions(o) as Dates.ZoneOptions),
    );
    step(`toInstant ${o.name}`, () => api.toInstant(fresh(), freshOptions(o) as Dates.ZoneOptions));
  }
  // A second validation of the same value, so a cache keyed on the value would show.
  step("validateParts again", () => api.validateParts(fresh()));
  return JSON.stringify(record);
}

/** The SHA-256 of a record, the form the captured data keeps. */
export function digestOf(record: string): string {
  return createHash("sha256").update(record).digest("hex");
}
