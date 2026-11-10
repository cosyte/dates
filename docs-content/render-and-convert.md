---
id: render-and-convert
title: Render or convert a value at its own precision
sidebar_label: Render or convert a value
description: "Render a date-parts value as ISO 8601, convert it to a Temporal object, handle a year-only value, and do date math in Temporal."
---

# Render or convert a value at its own precision

Turn a validated value into a string or a Temporal object without adding anything it did not state.
Both functions validate their argument first and throw a `DatePartsError` for an invalid one; see
[Validate a date-parts value](./validate-date-parts.md) to check a value first.

## Render ISO 8601

`toISO()` renders the value at its own precision, and nothing finer:

```ts runnable
import { toISO } from "@cosyte/dates";

toISO({ year: 1988 }); // => "1988"
toISO({ year: 2026, month: 3 }); // => "2026-03"
toISO({ year: 2026, month: 3, day: 9 }); // => "2026-03-09"
toISO({ year: 2026, month: 3, day: 9, hour: 8 }); // => "2026-03-09T08"
toISO({ year: 2026, month: 3, day: 9, hour: 8, minute: 5, offsetMinutes: -300 }); // => "2026-03-09T08:05-05:00"
```

- A stated offset is rendered as `+HH:MM` or `-HH:MM`. An offset of zero renders `+00:00`, not `Z`,
  and an absent offset renders nothing, because unknown is not UTC.
- A `fraction` is written with its trailing zeros removed, but never to nothing:

```ts runnable
import { toISO } from "@cosyte/dates";

const second = { year: 2026, month: 3, day: 9, hour: 8, minute: 5, second: 7 };
toISO({ ...second, fraction: 0.25 }); // => "2026-03-09T08:05:07.25"
toISO({ ...second, fraction: 0 }); // => "2026-03-09T08:05:07.0"
toISO({ ...second, offsetMinutes: 0 }); // => "2026-03-09T08:05:07+00:00"
```

## Convert to Temporal

`toTemporal()` returns the narrowest Temporal type that holds everything the value states:

```ts runnable
import { Temporal, toTemporal } from "@cosyte/dates";

toTemporal({ year: 2026, month: 3 }) instanceof Temporal.PlainYearMonth; // => true
toTemporal({ year: 2026, month: 3, day: 9 }) instanceof Temporal.PlainDate; // => true
toTemporal({ year: 2026, month: 3, day: 9, hour: 8, minute: 5 }).toString(); // => "2026-03-09T08:05:00"

const stated = toTemporal({
  year: 2026,
  month: 3,
  day: 9,
  hour: 8,
  minute: 5,
  offsetMinutes: -300,
});
stated.toString(); // => "2026-03-09T08:05:00-05:00[-05:00]"
```

A value with a time of day and an offset becomes a `Temporal.ZonedDateTime` at exactly that offset;
one with a time of day and no offset becomes a `Temporal.PlainDateTime`, with no zone. The full
table is in [the date-parts contract](./date-parts-contract.md#what-totemporal-returns).

Components below the value's precision are zero in the Temporal object, because Temporal has no type
for "a date and an hour". Keep the precision beside the object if you need it later:

```ts runnable
import { precisionOf, toTemporal } from "@cosyte/dates";

const value = { year: 2026, month: 3, day: 9, hour: 8 };
toTemporal(value).toString(); // => "2026-03-09T08:00:00"
precisionOf(value); // => "hour"
```

## Handle a year-only value

Temporal has no year-only type, so `toTemporal()` throws a `PrecisionError` for a value such as
`{ year: 1988 }` rather than invent a month. Branch on `precisionOf()` first, and render a year with
`toISO()`:

```ts runnable
import { precisionOf, toISO, toTemporal } from "@cosyte/dates";
import type { DateParts } from "@cosyte/dates";

function describeBirthDate(value: DateParts): string {
  return precisionOf(value) === "year" ? toISO(value) : toTemporal(value).toString();
}

describeBirthDate({ year: 1988 }); // => "1988"
describeBirthDate({ year: 1988, month: 5, day: 7 }); // => "1988-05-07"
```

## Do date math in Temporal

This package has no arithmetic or comparison helpers. Convert, narrow to the Temporal type you
expect with `instanceof` against the re-exported `Temporal`, and use Temporal's own methods:

```ts runnable
import { Temporal, toTemporal } from "@cosyte/dates";

const admitted = toTemporal({ year: 2026, month: 3, day: 9 });
const discharged = toTemporal({ year: 2026, month: 3, day: 14 });

const nights =
  admitted instanceof Temporal.PlainDate && discharged instanceof Temporal.PlainDate
    ? admitted.until(discharged).days
    : undefined;
nights; // => 5
```

Use the `Temporal` this package exports, not a second copy: two Temporal implementations do not
share `instanceof`, so a check against another copy is always false.

## Reference

- [`toISO`](./api/README.md#toiso), [`toTemporal`](./api/README.md#totemporal),
  [`precisionOf`](./api/README.md#precisionof), [`TemporalValue`](./api/README.md#temporalvalue)
  and [`PrecisionError`](./api/README.md#precisionerror) in the API reference.
- [The date-parts contract](./date-parts-contract.md): what each precision renders as and converts
  to.
- [Precision](./concepts-precision.md) explains why nothing below the precision is filled in.
