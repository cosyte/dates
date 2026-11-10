---
id: concepts-precision
title: Precision
sidebar_label: Precision
description: "Why a date is kept at the precision it arrived with, what makes a parts value a contract, and why a fault is refused rather than repaired."
---

# Precision

A healthcare date is often less than a full timestamp. A date of birth can arrive as a year, an
admission as a calendar day, a specimen collection as a time to the minute with or without an offset.
`@cosyte/dates` keeps each of those at exactly the precision it arrived with. This page explains
why, and what follows from it.

## Why not a JavaScript Date

A `Date` is an absolute instant, to the millisecond. It cannot say "1988" or "May 1988": to hold
either it needs a day, a time of day and a zone, so something has to supply them.
`new Date("1988")` supplies 1 January at midnight UTC. Shown in a zone west of UTC, that is
31 December 1987: a date of birth that moved a year because of a value nobody sent.

So the parsers hand back the parts that arrived, and this package works on those parts. A year
stays a year until the code that holds it decides, knowingly, what to do with it.

## A parts value is a contract

A parts value is a plain object with up to eight components: `year`, `month`, `day`, `hour`,
`minute`, `second`, `fraction` and `offsetMinutes`. Two rules make it more than a bag of numbers:

1. **Contiguity.** Components are present from `year` downward with no gaps. `{ year, month }` is a
   value; `{ year, day }` is not, because it does not say which month.
2. **Precision is what is present.** The least significant component present is the precision.
   `{ year: 1988, month: 5 }` has precision `month`, and nothing below it is implied.

A value carries no separate precision field that could disagree with its components: the
precision is read off the value itself. The ranges of each component are in
[the date-parts contract](./date-parts-contract.md).

## Nothing is added on the way out

Every output keeps the precision of its input. `toISO()` renders `1988` for a year and `1988-05`
for a month. `toTemporal()` picks the narrowest Temporal type that holds everything the value
states: a `PlainYearMonth` for a month, a `PlainDate` for a calendar date, and a `PlainDateTime` or
`ZonedDateTime` for a time of day.

Temporal has no type for a year alone, so a year-only value cannot become a Temporal object at all.
`toTemporal()` refuses it with a `PrecisionError` rather than add a month to fit a type. Below the
day, Temporal has only full date-times, so an hour-precision value converts with zero minutes; the
precision is still there to read with `precisionOf()`, but the Temporal object cannot carry it.

```ts runnable
import { PRECISION_LADDER, precisionOf } from "@cosyte/dates";

PRECISION_LADDER; // => ["year", "month", "day", "hour", "minute", "second", "fraction"]
precisionOf({ year: 1988 }); // => "year"
precisionOf({ year: 1988, month: 5, day: 7, hour: 13 }); // => "hour"
```

## Refused, not repaired

Where a value is wrong, the package says so and stops. Each repair it could make would turn a value
that is visibly wrong into one that looks right and is not:

- **No two-digit years.** `{ year: 88 }` is refused with `year-not-four-digits`. A century window
  would make 88 into 1988 or 2088, and a date of birth in the wrong century is a different patient.
  There is no window and no setting that adds one.
- **No rounding.** A `fraction` finer than one nanosecond, the finest value Temporal holds, is
  refused with `finer-than-nanosecond` rather than rounded to fit. A rounded value is not what the
  sender sent.
- **No calendar rollover.** `{ year: 2025, month: 2, day: 29 }` is refused with
  `no-such-calendar-date`. It never becomes 1 March, which is what `new Date(2025, 1, 29)` gives.
- **No offset without a time.** An `offsetMinutes` on a value with no time of day is refused with
  `offset-without-time-of-day` rather than dropped, since dropping it would lose something the
  sender stated.

Validation reports every fault at once, so a value with three problems is fixed in one pass. Each
issue names the component and the rule, which is what lets a caller fix the source instead of
guessing.

## Reading a fraction exactly

A `fraction` is a share of one second, held in a JavaScript number. Most decimal fractions have no
exact binary form, so `fraction * 1e9` can land a hair off a whole number of nanoseconds, and a
tolerance wide enough to forgive the hair could hide a real difference. The package reads the
nanoseconds from the number's own shortest decimal spelling instead: `0.123456789` is
123,456,789 nanoseconds, exactly, and a number whose spelling runs past nine decimal places is
refused.

## Put it into practice

- [Validate a date-parts value](./validate-date-parts.md): check a value and read every fault.
- [Render or convert a value at its own precision](./render-and-convert.md): ISO 8601, Temporal,
  and the year-only case.
- [Zones and instants](./concepts-zones.md): the other half of the design, for time zones.
