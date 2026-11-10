---
id: date-parts-contract
title: The date-parts contract
sidebar_label: Date-parts contract
description: "Every component of a date-parts value with its range, the rules a value must meet, and what each precision renders as and converts to."
---

# The date-parts contract

The shape every function in `@cosyte/dates` accepts, and what each one returns for it. The type is
[`DateParts`](./api/README.md#dateparts).

## Components

| Component       | Range                     | Notes                                                    |
| --------------- | ------------------------- | -------------------------------------------------------- |
| `year`          | 1000 to 9999              | required; four digits, never a two-digit year            |
| `month`         | 1 to 12                   | spec-native: January is 1, not 0                         |
| `day`           | 1 to 31                   | and a day that exists in that month and year             |
| `hour`          | 0 to 23                   |                                                          |
| `minute`        | 0 to 59                   |                                                          |
| `second`        | 0 to 59                   | leap seconds are not representable                       |
| `fraction`      | 0 up to, not including, 1 | a share of one second, at most nine decimal places       |
| `offsetMinutes` | -1439 to 1439             | signed minutes from UTC; absent means unknown, never UTC |

Every component is a finite JavaScript number. Every component but `fraction` is a whole number.

## Rules

A value is valid when every one of these holds. Each rule names the issue code that reports it;
[Errors and issue codes](./errors-and-issue-codes.md#issue-codes) lists them all.

- The value is an object with named components: not `null`, not a string, not an array, and not a
  JavaScript `Date` (`not-a-parts-object`).
- It has a `year` (`missing-component`).
- Components run from `year` down to the least significant one present with no gap: a `day` needs a
  `month`, a `minute` needs an `hour`, a `fraction` needs a `second` (`missing-component`).
- Each component is a number (`not-a-number`), finite (`not-finite`), a whole number where the table
  says so (`not-an-integer`), and in its range (`out-of-range`; `year-not-four-digits` for a year).
- A `fraction` has at most nine decimal places, one nanosecond (`finer-than-nanosecond`).
- An `offsetMinutes` comes with at least an `hour` (`offset-without-time-of-day`).
- The `year`, `month` and `day` together name a real date in the proleptic Gregorian calendar, in
  which a year is a leap year when it divides by 4, except a century that does not divide by 400
  (`no-such-calendar-date`).
- Reading a component does not throw (`unreadable`).

And how a value is read:

- A component set to `undefined` is absent, the same as one that is not there.
- A component on the object's prototype, such as a getter on a class, is read like an own property.
- A property with any other name is ignored and left out of the validated `parts`.

## Precision

The precision of a valid value is its least significant component present, one of
[`PRECISION_LADDER`](./api/README.md#precision_ladder), most significant first: `year`, `month`,
`day`, `hour`, `minute`, `second`, `fraction`. `offsetMinutes` is not a precision.

## What `toISO` renders

| Precision  | Example value                                                                      | `toISO()`                |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------ |
| `year`     | `{ year: 1988 }`                                                                   | `1988`                   |
| `month`    | `{ year: 1988, month: 5 }`                                                         | `1988-05`                |
| `day`      | `{ year: 1988, month: 5, day: 7 }`                                                 | `1988-05-07`             |
| `hour`     | `{ year: 1988, month: 5, day: 7, hour: 13 }`                                       | `1988-05-07T13`          |
| `minute`   | `{ year: 1988, month: 5, day: 7, hour: 13, minute: 45 }`                           | `1988-05-07T13:45`       |
| `second`   | `{ year: 1988, month: 5, day: 7, hour: 13, minute: 45, second: 9 }`                | `1988-05-07T13:45:09`    |
| `fraction` | `{ year: 1988, month: 5, day: 7, hour: 13, minute: 45, second: 9, fraction: 0.5 }` | `1988-05-07T13:45:09.5`  |
| `hour`     | `{ year: 1988, month: 5, day: 7, hour: 13, offsetMinutes: 330 }`                   | `1988-05-07T13+05:30`    |
| `minute`   | `{ year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 0 }`         | `1988-05-07T13:45+00:00` |

A stated offset is appended as `+HH:MM` or `-HH:MM`, and an offset of zero as `+00:00`. An absent
offset appends nothing.

## What `toTemporal` returns

| The value has                     | `toTemporal()` returns                  |
| --------------------------------- | --------------------------------------- |
| a year only                       | throws `PrecisionError`                 |
| a year and a month                | `Temporal.PlainYearMonth`               |
| a calendar date                   | `Temporal.PlainDate`                    |
| a time of day, no `offsetMinutes` | `Temporal.PlainDateTime`                |
| a time of day and `offsetMinutes` | `Temporal.ZonedDateTime` at that offset |

Components below the value's precision are zero in a `PlainDateTime` or `ZonedDateTime`.

## What `toZonedDateTime` and `toInstant` need

Both take the value and an optional [`ZoneOptions`](./api/README.md#zoneoptions):

| Option          | Meaning                                                 |
| --------------- | ------------------------------------------------------- |
| `timeZone`      | an IANA time zone identifier, such as `America/Chicago` |
| `offsetMinutes` | a fixed offset, a whole number from -1439 to 1439       |

| Situation                                                                      | Result                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| the value is at `day` precision or coarser                                     | throws `PrecisionError`                              |
| the value has `offsetMinutes`                                                  | converts at that offset; the options are not applied |
| no `offsetMinutes` on the value, and no option                                 | throws `MissingZoneError`                            |
| no `offsetMinutes` on the value, and one option                                | converts in that zone or at that offset              |
| both options passed, for a value with no `offsetMinutes`                       | throws `TypeError`                                   |
| a `timeZone` Temporal does not know, or an `offsetMinutes` option out of range | throws `RangeError`                                  |
| the local time is skipped or repeated in the named zone                        | throws `AmbiguousLocalTimeError`                     |

`toZonedDateTime()` returns a `Temporal.ZonedDateTime`; `toInstant()` returns its
`Temporal.Instant`.

## The Temporal export

`Temporal` is re-exported from `temporal-polyfill`, the package's one runtime dependency, so a
caller uses the same implementation the conversions return. It is not listed in the generated API
reference, which documents this package's own exports.
