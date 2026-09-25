---
id: concepts-precision
title: Precision
sidebar_position: 1
---

# Precision

A healthcare date is often less than a full timestamp. A date of birth can arrive as a year, an
admission as a calendar day, a specimen collection as a time to the minute with or without an offset.
`@cosyte/dates` keeps each of those at exactly the precision it arrived with.

## The parts value

| component       | range                     | notes                                         |
| --------------- | ------------------------- | --------------------------------------------- |
| `year`          | 1000 to 9999              | required, four digits, never a two-digit year |
| `month`         | 1 to 12                   | spec-native: January is 1, not 0              |
| `day`           | 1 to 31                   | and a day that exists in that month and year  |
| `hour`          | 0 to 23                   |                                               |
| `minute`        | 0 to 59                   |                                               |
| `second`        | 0 to 59                   | leap seconds are not representable            |
| `fraction`      | 0 up to, not including, 1 | of one second, down to one nanosecond         |
| `offsetMinutes` | -1439 to 1439             | absent means UNKNOWN, never UTC               |

Two rules make it a contract:

1. **Contiguity.** Components are present from `year` downward with no gaps. `{ year, month }` is a
   value; `{ year, day }` is refused with `missing-component`.
2. **Precision is what is present.** The least significant component present is the precision, so
   `{ year: 1988, month: 5 }` has precision `month`.

```js
import { precisionOf, PRECISION_LADDER } from '@cosyte/dates';

precisionOf({ year: 1988 }); // 'year'
precisionOf({ year: 1988, month: 5, day: 7, hour: 13 }); // 'hour'
PRECISION_LADDER; // ['year', 'month', 'day', 'hour', 'minute', 'second', 'fraction']
```

## Validation

`validateParts()` never throws and reports every fault, not only the first:

```js
import { validateParts } from '@cosyte/dates';

const result = validateParts({ year: 1988, month: 13, day: 40 });
result.valid; // false
result.issues.map((issue) => issue.code); // ['out-of-range', 'out-of-range']
```

On success it returns the recognised components and the precision:

```js
validateParts({ year: 1988, month: 5, day: 7 });
// { valid: true, parts: { year: 1988, month: 5, day: 7 }, precision: 'day' }
```

`isValidParts()` is the same check as a type guard, and `assertValidParts()` returns the recognised
components or throws a `DatePartsError` carrying the same `issues`.

## Rendering and converting at the value's own precision

`toISO()` renders ISO 8601 at the precision the value has, and nothing finer:

```js
import { toISO } from '@cosyte/dates';

toISO({ year: 1988 }); // '1988'
toISO({ year: 2026, month: 3 }); // '2026-03'
toISO({ year: 2026, month: 3, day: 9, hour: 8 }); // '2026-03-09T08'
toISO({ year: 2026, month: 3, day: 9, hour: 8, minute: 5, offsetMinutes: -300 }); // '2026-03-09T08:05-05:00'
```

`toTemporal()` returns the narrowest Temporal type that carries everything the value states:

| the value has                     | `toTemporal()` returns    |
| --------------------------------- | ------------------------- |
| a year and a month                | `Temporal.PlainYearMonth` |
| a calendar date                   | `Temporal.PlainDate`      |
| a time of day, no offset          | `Temporal.PlainDateTime`  |
| a time of day and `offsetMinutes` | `Temporal.ZonedDateTime`  |

A year on its own throws a `PrecisionError`: Temporal has no year-only type, and this package will
not invent a month to reach one. Use `toISO()` to render it, or `precisionOf()` to branch first.

## Refusals instead of guesses

- **No two-digit years.** `{ year: 88 }` is refused with `year-not-four-digits`. There is no century
  window and no setting that adds one.
- **No rounding.** A `fraction` finer than one nanosecond is refused with `finer-than-nanosecond`
  rather than rounded to fit.
- **No calendar rollover.** `{ year: 2025, month: 2, day: 29 }` is refused with
  `no-such-calendar-date`; it never becomes 1 March.
- **No offset without a time.** An `offsetMinutes` on a value with no time of day is refused with
  `offset-without-time-of-day` rather than dropped.
