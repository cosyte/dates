---
id: intro
title: Overview
sidebar_position: 1
---

# @cosyte/dates

Work with the dates the `@cosyte/*` parsers give you, without losing what the wire actually said.

The `@cosyte/*` parsers hand back dates as parts rather than as JavaScript `Date` objects. An HL7 v2
`|1970|` is a year, `|19880507|` is a calendar day, and a timestamp with no offset is the sender's
local time. The parsers keep exactly that and invent nothing else. `@cosyte/dates` is the opt-in
companion that validates, renders and converts those parts, with the same two promises:

- **Precision is preserved.** A year stays a year. Nothing adds a month, a day or a midnight that the
  value did not state.
- **No zone is ever guessed.** A value whose offset is unknown cannot become an absolute instant
  until you say which zone applies. There is no fallback to the host time zone and none to UTC.

```js
import { toISO, toInstant } from '@cosyte/dates';

toISO({ year: 1988 }); // '1988'
toISO({ year: 1988, month: 5, day: 7 }); // '1988-05-07'
toInstant({ year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 }).toString();
// '1988-05-07T08:15:00Z'
```

## What it covers

- **Validation** of a date-parts value: every fault reported, each one naming the component and the
  rule it broke (`validateParts`, `isValidParts`, `assertValidParts`).
- **Precision**: the least significant component present is the precision (`precisionOf`).
- **Rendering** to ISO 8601 at the value's own precision (`toISO`).
- **Conversion** to the narrowest Temporal type that carries everything the value states
  (`toTemporal`), and to a zoned date-time or an absolute instant once a zone is known
  (`toZonedDateTime`, `toInstant`).

## What it does not do

- It parses no vendor date text: it consumes parts a parser already produced.
- It never interprets a two-digit year.
- It carries no arithmetic, comparison or formatting helpers: convert with `toTemporal()` and use
  Temporal for the rest.
- It handles years 1000 to 9999 in the proleptic Gregorian calendar, and no leap seconds.

## Status

`0.1.0` is the first published release. The exported functions, the shape of `DateParts`, the issue
codes and the error classes are settled and safe to depend on. Below `1.0.0`, a breaking change to
any of them ships in a new minor version and is called out in the changelog.

Next: [Installation](./installation), then the [Quickstart](./quickstart).
