---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "What to do when a call refuses a value, an instant comes out an hour off, or a component seems to go missing."
---

# Troubleshooting

Every refusal in `@cosyte/dates` is named. Find the error or the symptom below; each error and issue
code is listed in full in [Errors and issue codes](./errors-and-issue-codes.md).

## Catch a named error

The four named error classes are exported, so `instanceof` tells them apart:

```ts runnable
import { MissingZoneError, toInstant } from "@cosyte/dates";

let askSender = false;
try {
  toInstant({ year: 1988, month: 5, day: 7, hour: 13, minute: 45 });
} catch (error) {
  // Ask which zone the sender was in; never assume one.
  askSender = error instanceof MissingZoneError;
}
askSender; // => true
```

## `MissingZoneError`

The value has no `offsetMinutes` and no zone was passed. Find out which zone the sender's local
time is in and pass it as `{ timeZone }` or `{ offsetMinutes }`. Do not pass `"UTC"` or the host's
zone to make the error go away: that is the guess the error exists to stop.
[Get an instant from a local time](./get-an-instant.md#say-which-zone-a-local-time-is-in) shows how,
and [`MissingZoneError`](./errors-and-issue-codes.md#missingzoneerror) when it is thrown.

## `PrecisionError`

The value lacks a component the call needs:

- From `toTemporal()`, the value is a year alone, and Temporal has no year-only type. Branch on
  `precisionOf()` and render a year with `toISO()`, as
  [Render or convert a value](./render-and-convert.md#handle-a-year-only-value) shows.
- From `toInstant()` or `toZonedDateTime()`, the value has no time of day. A calendar date has no
  single instant; convert it with `toTemporal()` instead.

`error.precision` is the precision the value has. See
[`PrecisionError`](./errors-and-issue-codes.md#precisionerror).

## `AmbiguousLocalTimeError`

The local time is skipped or repeated by a daylight-saving transition in the zone you passed. The
message says which, and names both candidate offsets for a repeated time. Find out which one the
sender meant and pass it as `{ offsetMinutes }`; see
[Settle a daylight-saving refusal](./get-an-instant.md#settle-a-daylight-saving-refusal) and
[`AmbiguousLocalTimeError`](./errors-and-issue-codes.md#ambiguouslocaltimeerror).

## `RangeError` or `TypeError` from a conversion

- `RangeError: unknown time zone`: the `timeZone` is not an identifier Temporal knows, often an
  abbreviation such as `CST`. Use a zone name such as `America/Chicago`, or a numeric offset.
- `RangeError: offsetMinutes must be an integer`: the `offsetMinutes` option is not a whole number
  from -1439 to 1439. It is in minutes: UTC-05:00 is `-300`, not `-5`.
- `TypeError`: both `timeZone` and `offsetMinutes` were passed. Pass one.

See [`RangeError`](./errors-and-issue-codes.md#rangeerror) and
[`TypeError`](./errors-and-issue-codes.md#typeerror).

## `DatePartsError`, or an invalid result

The value broke the contract. Read `error.issues`, or `result.issues` from `validateParts()`: each
names the component and the code. The ones that surprise people most:

- **`year-not-four-digits` on a year such as 88.** The source sent a two-digit year. The package
  never picks a century; get the full year from the source.
- **`out-of-range` on `month` with the value 0.** The month came from JavaScript's `Date.getMonth()`
  or another source that counts from 0. Months here run from 1 to 12, so add 1.
- **`no-such-calendar-date`.** A day such as 29 February 2025 or 31 April. The date does not exist;
  nothing rolls it over into the next month.
- **`missing-component`.** A component is set while a more significant one is absent, such as a
  `minute` with no `hour`.
- **`offset-without-time-of-day`.** An `offsetMinutes` on a value with no `hour`. Drop the offset
  yourself if the source attached it to a calendar date by mistake.
- **`finer-than-nanosecond`.** A `fraction` with more than nine decimal places. Cut it to whole
  nanoseconds at the source if that is what the sender meant.

Every code is in [Issue codes](./errors-and-issue-codes.md#issue-codes), and
[Validate a date-parts value](./validate-date-parts.md) shows how to read them.

## An instant is an hour off

- **An abbreviation that is also a zone name.** `EST` is accepted, but it is a fixed UTC-05:00
  with no daylight-saving time, so it is an hour off New York's clocks from March to November. Use
  `America/New_York`. See
  [Prefer a zone name to an abbreviation](./get-an-instant.md#prefer-a-zone-name-to-an-abbreviation).
- **A fixed offset across a transition.** `{ offsetMinutes: -300 }` is always UTC-05:00. If the
  sender's clock follows daylight-saving time, pass its zone name instead.

## Sub-second detail is missing

Validation reads only the components the contract names. A property such as `millisecond` is ignored,
so the value is read at `second` precision. Convert it to `fraction`, a share of one second, before
you call the package: 250 milliseconds is `fraction: 0.25`.

## `instanceof Temporal.PlainDate` is false

The `Temporal` you checked against is a different copy from the one this package returns, such as a
second polyfill or a native `Temporal`. Two implementations do not share `instanceof`. Import
`Temporal` from `@cosyte/dates`.

## Logging

Most validation messages quote only the component at fault and its value (`month must be an
integer in 1 to 12 ...; received the number 13`). A `no-such-calendar-date` message names the whole
date (`day 31 does not exist: April 1988 has 30 days`), and so does a `DatePartsError` message that
joins one. An `AmbiguousLocalTimeError` message names the whole local date and time. A date of birth
is PHI, so decide what to log before you log a message; the `component` and `code` of an issue carry
no value at all.

The package itself writes nothing: no logging, no telemetry, no files, and no network, on any code
path.
