/**
 * The work one conversion does, counted rather than timed: which Temporal objects it builds and how
 * often it asks the runtime whether a zone exists.
 *
 * Every Temporal object the polyfill builds is formatted to its ISO text when it is made, whether
 * or not anyone reads it, so each object a conversion builds on the way to its answer is a cost a
 * caller pays on every value. These tests pin the conversions to the objects they return, and a
 * named zone to one existence probe for the life of the process. What the conversions return is
 * pinned separately, by `test/output-equivalence.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { Temporal, toInstant, toTemporal, toZonedDateTime } from "../src/index.js";

const LOCAL = { year: 2026, month: 3, day: 9, hour: 8, minute: 5, second: 7, fraction: 0.125 };

afterEach(() => {
  vi.restoreAllMocks();
});

/** Spies on every way a conversion could build an intermediate Temporal value. */
function intermediates(): { readonly calls: () => number } {
  const spies = [
    vi.spyOn(Temporal.PlainDateTime, "from"),
    vi.spyOn(Temporal.ZonedDateTime, "from"),
    vi.spyOn(Temporal.PlainDateTime.prototype, "toZonedDateTime"),
    vi.spyOn(Temporal.ZonedDateTime.prototype, "toInstant"),
    vi.spyOn(Temporal.Instant, "fromEpochMilliseconds"),
  ];
  return { calls: () => spies.reduce((n, spy) => n + spy.mock.calls.length, 0) };
}

describe("a fixed offset builds only the object it returns", () => {
  it("toInstant with the value's own offset builds no zoned value", () => {
    const seen = intermediates();
    const instant = toInstant({ ...LOCAL, offsetMinutes: -300 });
    expect(instant.toString()).toBe("2026-03-09T13:05:07.125Z");
    expect(seen.calls()).toBe(0);
  });

  it("toInstant with an offset option builds no zoned value", () => {
    const seen = intermediates();
    expect(toInstant(LOCAL, { offsetMinutes: 330 }).toString()).toBe("2026-03-09T02:35:07.125Z");
    expect(seen.calls()).toBe(0);
  });

  it("toZonedDateTime and toTemporal at an offset build the zoned value directly", () => {
    const seen = intermediates();
    expect(toZonedDateTime({ ...LOCAL, offsetMinutes: 0 }).toString()).toBe(
      "2026-03-09T08:05:07.125+00:00[+00:00]",
    );
    expect(toTemporal({ ...LOCAL, offsetMinutes: -1439 }).toString()).toBe(
      "2026-03-09T08:05:07.125-23:59[-23:59]",
    );
    expect(seen.calls()).toBe(0);
  });
});

describe("a named zone is probed once", () => {
  it("asks whether a zone exists on its first use only", () => {
    const zone = "Asia/Kathmandu";
    const probe = vi.spyOn(Temporal.Instant, "fromEpochMilliseconds");
    for (let hour = 6; hour < 12; hour += 1) toInstant({ ...LOCAL, hour }, { timeZone: zone });
    expect(probe.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("still refuses an unknown zone every time it is asked", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => toInstant(LOCAL, { timeZone: "Mars/Olympus_Mons" })).toThrow(
        'unknown time zone "Mars/Olympus_Mons"',
      );
    }
  });

  it("keeps a bounded number of zone names, and probes again once it starts over", () => {
    // Offset strings are zone names too, so 600 distinct ones overrun the bound.
    const names = Array.from({ length: 600 }, (_, i) => {
      const minutes = i + 1;
      return `+${String(Math.trunc(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    });
    for (const timeZone of names) toInstant(LOCAL, { timeZone });
    const probe = vi.spyOn(Temporal.Instant, "fromEpochMilliseconds");
    // The first names were dropped when the set started over, so they are probed again.
    toInstant(LOCAL, { timeZone: names[0] as string });
    expect(probe.mock.calls.length).toBe(1);
  });

  it("probes a zone given as a Temporal object every time, and keeps no reference to it", () => {
    const zoned = Temporal.ZonedDateTime.from("2026-01-01T00:00[Europe/London]");
    const probe = vi.spyOn(Temporal.Instant, "fromEpochMilliseconds");
    const options = { timeZone: zoned as unknown as string };
    expect(toInstant(LOCAL, options).toString()).toBe("2026-03-09T08:05:07.125Z");
    expect(toInstant(LOCAL, options).toString()).toBe("2026-03-09T08:05:07.125Z");
    expect(probe.mock.calls.length).toBe(2);
  });
});
