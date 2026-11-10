---
id: errors-and-issue-codes
title: Errors and issue codes
sidebar_label: Errors and issue codes
description: "Every error @cosyte/dates throws and every issue code validation reports: what raises each one, and what it carries."
---

# Errors and issue codes

Every refusal in `@cosyte/dates` is named: a function either throws one of the errors below, or, for
`validateParts()`, returns issues with one of the codes below. Nothing is logged and nothing is
returned in place of a refusal. [Troubleshooting](./troubleshooting.md) says what to do about each.

## Errors

The four named classes are exported and extend `Error`, so `instanceof` works on each. The other two
are the JavaScript built-ins.

| Error                     | Thrown by                                              | Carries     |
| ------------------------- | ------------------------------------------------------ | ----------- |
| `DatePartsError`          | `assertValidParts`, `precisionOf`, and every converter | `issues`    |
| `PrecisionError`          | `toTemporal`, `toZonedDateTime`, `toInstant`           | `precision` |
| `MissingZoneError`        | `toZonedDateTime`, `toInstant`                         | the message |
| `AmbiguousLocalTimeError` | `toZonedDateTime`, `toInstant`                         | the message |
| `RangeError`              | `toZonedDateTime`, `toInstant`                         | the message |
| `TypeError`               | `toZonedDateTime`, `toInstant`                         | the message |

The converters are `toISO`, `toTemporal`, `toZonedDateTime` and `toInstant`.

### `DatePartsError`

The value failed validation. `issues` is the same array `validateParts()` returns for that value,
and the message joins each issue's message. See [`DatePartsError`](./api/README.md#datepartserror).

### `PrecisionError`

The value lacks a component the call needs, and adding it would mean inventing it. `toTemporal()`
throws it for a value with only a year; `toZonedDateTime()` and `toInstant()` throw it for a value
with no time of day. `precision` is the precision the value has. From those two, when the value
also has no zone, the message says that too. See [`PrecisionError`](./api/README.md#precisionerror).

### `MissingZoneError`

An instant was asked for, the value has no `offsetMinutes`, and no `timeZone` or `offsetMinutes`
option was passed. See [`MissingZoneError`](./api/README.md#missingzoneerror).

### `AmbiguousLocalTimeError`

The local time does not exist in the named zone, because a daylight-saving transition skips it, or
exists twice, because one repeats it. The message names the whole local date and time and the zone,
says which, and for a repeated time names both candidate offsets. See [`AmbiguousLocalTimeError`](./api/README.md#ambiguouslocaltimeerror).

### `RangeError`

For a value with no `offsetMinutes`: the `timeZone` option is not an identifier Temporal knows, or
the `offsetMinutes` option is not a whole number from -1439 to 1439.

### `TypeError`

Both the `timeZone` and the `offsetMinutes` options were passed for a value with no
`offsetMinutes`.

## Issue codes

`validateParts()` returns one issue per fault, each a
[`ValidationIssue`](./api/README.md#validationissue) with a `component`, a `code` and a `message`.
The `component` is the name of the component at fault, or `value` when the argument itself is
wrong. The type of `code` is [`IssueCode`](./api/README.md#issuecode).

| Code                         | Component        | Raised when                                                                                       |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `not-a-parts-object`         | `value`          | the argument is not an object, or is `null`, an array or a JavaScript `Date`                      |
| `missing-component`          | the missing one  | there is no `year`, or a more significant component is absent while a less significant one is set |
| `unreadable`                 | the one read     | reading the component threw, so its value could not be seen                                       |
| `not-a-number`               | the one at fault | the component is present but is not a number                                                      |
| `not-finite`                 | the one at fault | the component is `NaN` or infinite                                                                |
| `not-an-integer`             | the one at fault | the component must be a whole number and is not                                                   |
| `out-of-range`               | the one at fault | the component is outside its range in [the contract](./date-parts-contract.md#components)         |
| `year-not-four-digits`       | `year`           | the year is a whole number outside 1000 to 9999; no century window is applied                     |
| `finer-than-nanosecond`      | `fraction`       | `fraction` has more than nine decimal places; it is not rounded                                   |
| `offset-without-time-of-day` | `offsetMinutes`  | `offsetMinutes` is set on a value with no `hour`                                                  |
| `no-such-calendar-date`      | `day`            | each component is in range, but together they name no real date                                   |

Most messages quote only the component at fault and its value. A `no-such-calendar-date` message
names the day, the month and the year, which is the whole date, and so does the message of a
`DatePartsError` that carries one. The `component` and `code` of an issue carry no value.
