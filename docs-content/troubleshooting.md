---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

Every refusal in `@cosyte/dates` is named. This page lists them and what to do about each.

## Errors

| error                     | thrown when                                                                 | what to do                                                                        |
| ------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `DatePartsError`          | a conversion or `assertValidParts()` is given a value that fails validation | read `error.issues`: the same array `validateParts()` returns for that value      |
| `PrecisionError`          | the value lacks a component the conversion needs                            | branch on `precisionOf()` first; `error.precision` is the precision it has        |
| `MissingZoneError`        | an instant is asked for, the value has no offset, and no zone was passed    | pass `{ timeZone }` or `{ offsetMinutes }` for the zone the sender meant          |
| `AmbiguousLocalTimeError` | the local time is skipped or repeated by a daylight-saving transition       | pass the offset you mean as `{ offsetMinutes }`; the message names the candidates |
| `RangeError`              | the `timeZone` is not an identifier Temporal knows                          | use an IANA identifier such as `America/New_York`, or a numeric offset            |
| `TypeError`               | both `timeZone` and `offsetMinutes` are passed                              | pass one of them                                                                  |

The four named error classes are exported, so `instanceof` works:

```js
import { toInstant, MissingZoneError } from '@cosyte/dates';

try {
  toInstant({ year: 1988, month: 5, day: 7, hour: 13, minute: 45 });
} catch (error) {
  if (error instanceof MissingZoneError) {
    // ask which zone the sender was in; never assume one
  }
}
```

## Issue codes

`validateParts()` returns one issue per fault, each with a `component`, a `code` and a `message`:

| code                         | meaning                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `not-a-parts-object`         | the argument is not an object at all                                       |
| `missing-component`          | a more significant component is absent while a less significant one is set |
| `unreadable`                 | reading the component threw, so its value could not be seen                |
| `not-a-number`               | the component is present but is not a number                               |
| `not-finite`                 | the component is `NaN` or infinite                                         |
| `not-an-integer`             | the component must be a whole number and is not                            |
| `out-of-range`               | the component is outside the range its row in the contract gives it        |
| `year-not-four-digits`       | the year is not four digits; no century window is ever applied             |
| `finer-than-nanosecond`      | `fraction` carries detail below one nanosecond; it is not rounded          |
| `offset-without-time-of-day` | `offsetMinutes` is set on a value that states no time of day               |
| `no-such-calendar-date`      | each component is in range, but together they name no real date            |

## Logging

A validation message quotes the one component at fault and its value (`month must be an integer in
1-12 ...; received the number 13`). It never assembles the full date into the message. A date of birth
is PHI, so decide whether to log even one component before you log a message.

The package itself writes nothing: no logging, no telemetry, no files and no network, on any code
path.
