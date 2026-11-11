/**
 * Property tests: rules that hold for every value, checked on values nobody wrote down.
 *
 * Each property runs through `assertProperty` from `@cosyte/test-utils`: 100 cases on every pull
 * request, and the depth `COSYTE_PROPERTY_RUNS` sets in the nightly run (10,000). A failure prints
 * the seed and path that replay it; set `COSYTE_PROPERTY_SEED` and `COSYTE_PROPERTY_PATH` to them
 * and run this file to get the same case, already shrunk.
 *
 * The expected values are worked out here, apart from the code under test: an ISO string is
 * spelled from the generated components, and an instant is read by Temporal from such a string.
 */
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { assertProperty } from "@cosyte/test-utils";

import {
  AmbiguousLocalTimeError,
  DatePartsError,
  Temporal,
  isValidParts,
  precisionOf,
  toISO,
  toInstant,
  toTemporal,
  validateParts,
} from "../../src/index.js";
import type { GeneratedParts } from "../support/arbitraries.js";
import { ZONES, anyValue, localTimeInZone, validParts } from "../support/arbitraries.js";

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

/** An offset in minutes as ISO 8601 spells it: `+05:30`, `-00:01`, `+00:00`. */
function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const size = Math.abs(minutes);
  return `${sign}${pad(Math.floor(size / 60), 2)}:${pad(size % 60, 2)}`;
}

/** The ISO 8601 string a value states, spelled from its components, at its own precision. */
function expectedISO({ parts, depth, fractionDigits }: GeneratedParts): string {
  let text = pad(parts.year ?? 0, 4);
  if (depth >= 2) text += `-${pad(parts.month ?? 0, 2)}`;
  if (depth >= 3) text += `-${pad(parts.day ?? 0, 2)}`;
  if (depth >= 4) text += `T${pad(parts.hour ?? 0, 2)}`;
  if (depth >= 5) text += `:${pad(parts.minute ?? 0, 2)}`;
  if (depth >= 6) text += `:${pad(parts.second ?? 0, 2)}`;
  if (fractionDigits !== undefined) text += `.${fractionDigits}`;
  if (parts.offsetMinutes !== undefined) text += offsetText(parts.offsetMinutes);
  return text;
}

/** The local date and time a value states, every unstated time component at zero. */
function localFields({ parts, fractionDigits }: GeneratedParts): string {
  const date = `${pad(parts.year ?? 0, 4)}-${pad(parts.month ?? 0, 2)}-${pad(parts.day ?? 0, 2)}`;
  const time = `${pad(parts.hour ?? 0, 2)}:${pad(parts.minute ?? 0, 2)}:${pad(parts.second ?? 0, 2)}`;
  return `${date}T${time}.${(fractionDigits ?? "").padEnd(9, "0")}`;
}

describe("validation answers, and conversion refuses exactly what it refuses", () => {
  it("never throws from validateParts, agrees with isValidParts, and toISO throws its issues", () => {
    assertProperty(
      "validation and conversion agree",
      fc.property(anyValue, (value) => {
        const result = validateParts(value);
        expect(isValidParts(value)).toBe(result.valid);
        if (result.valid) {
          expect(typeof toISO(value)).toBe("string");
          return;
        }
        expect(result.issues.length).toBeGreaterThan(0);
        let thrown: unknown;
        try {
          toISO(value);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(DatePartsError);
        expect((thrown as DatePartsError).issues).toEqual(result.issues);
      }),
      {},
    );
  });
});

describe("a valid value converts at its own precision", () => {
  it("toISO spells exactly the components the value states, and precisionOf names the last", () => {
    assertProperty(
      "toISO adds no precision",
      fc.property(validParts(), (generated) => {
        expect(toISO(generated.parts)).toBe(expectedISO(generated));
        expect(precisionOf(generated.parts)).toBe(
          ["year", "month", "day", "hour", "minute", "second", "fraction"][generated.depth - 1],
        );
      }),
      {},
    );
  });

  it("toTemporal states the same date and time as toISO, with no zone the value did not state", () => {
    assertProperty(
      "toTemporal matches toISO",
      fc.property(validParts({ minDepth: 3 }), (generated) => {
        const converted = toTemporal(generated.parts);
        if (generated.depth === 3) {
          expect(converted).toBeInstanceOf(Temporal.PlainDate);
        } else if (generated.parts.offsetMinutes === undefined) {
          expect(converted).toBeInstanceOf(Temporal.PlainDateTime);
        } else {
          expect(converted).toBeInstanceOf(Temporal.ZonedDateTime);
        }
        const local =
          converted instanceof Temporal.ZonedDateTime ? converted.toPlainDateTime() : converted;
        const expected = Temporal.PlainDateTime.from(localFields(generated));
        expect(local.toString()).toBe(
          generated.depth === 3 ? expected.toPlainDate().toString() : expected.toString(),
        );
      }),
      {},
    );
  });
});

describe("an instant is the one the value states", () => {
  it("at the value's own offset, toInstant is the instant Temporal reads from the same text", () => {
    assertProperty(
      "toInstant at its own offset",
      fc.property(validParts({ offset: "always", minDepth: 4 }), (generated) => {
        const offset = offsetText(generated.parts.offsetMinutes ?? 0);
        const expected = Temporal.Instant.from(`${localFields(generated)}${offset}`);
        expect(toInstant(generated.parts).epochNanoseconds).toBe(expected.epochNanoseconds);
      }),
      {},
    );
  });

  it("in a named zone, it is the local time there, or refused exactly where Temporal would have to choose", () => {
    assertProperty(
      "toInstant in a named zone",
      fc.property(localTimeInZone, ({ generated, timeZone }) => {
        const local = Temporal.PlainDateTime.from(localFields(generated));
        let unique: Temporal.ZonedDateTime | undefined;
        try {
          unique = local.toZonedDateTime(timeZone, { disambiguation: "reject" });
        } catch {
          unique = undefined;
        }
        let thrown: unknown;
        let instant: Temporal.Instant | undefined;
        try {
          instant = toInstant(generated.parts, { timeZone });
        } catch (error) {
          thrown = error;
        }
        if (unique === undefined) {
          expect(thrown).toBeInstanceOf(AmbiguousLocalTimeError);
        } else {
          expect(thrown).toBeUndefined();
          expect(instant?.epochNanoseconds).toBe(unique.epochNanoseconds);
        }
      }),
      {},
    );
  });
});

describe("the host time zone changes nothing", () => {
  const originalTz = process.env["TZ"];
  afterEach(() => {
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("gives the same results under any host zone as under UTC", () => {
    const render = (parts: GeneratedParts["parts"]): string =>
      JSON.stringify([
        toISO(parts),
        toTemporal(parts).toString(),
        parts.offsetMinutes === undefined ? null : toInstant(parts).toString(),
      ]);
    assertProperty(
      "host zone independence",
      fc.property(
        validParts({ minDepth: 3 }),
        fc.constantFrom(...ZONES, "Pacific/Kiritimati"),
        ({ parts }, hostZone) => {
          process.env["TZ"] = "UTC";
          const underUtc = render(parts);
          process.env["TZ"] = hostZone;
          expect(render(parts)).toBe(underUtc);
        },
      ),
      {},
    );
  });
});
