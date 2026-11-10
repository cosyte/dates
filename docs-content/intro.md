---
id: intro
title: "@cosyte/dates"
sidebar_label: Overview
description: "What @cosyte/dates does: it validates and converts the date parts the @cosyte/* parsers return, without adding precision or guessing a zone."
---

# @cosyte/dates

Work with the dates the `@cosyte/*` parsers give you, without losing what the wire actually said.

The `@cosyte/*` parsers hand back dates as parts rather than as JavaScript `Date` objects. An HL7 v2
`|1970|` is a year, `|19880507|` is a calendar day, and a timestamp with no offset is the sender's
local time. The parsers keep exactly that and invent nothing else. `@cosyte/dates` is the opt-in
companion that validates, renders, and converts those parts, with the same two promises:

- **Precision is preserved.** A year stays a year. Nothing adds a month, a day, or a midnight that the
  value did not state.
- **No zone is ever guessed.** A value whose offset is unknown cannot become an absolute instant
  until you say which zone applies. There is no fallback to the host time zone and none to UTC.

```ts runnable
import { toISO, toInstant } from "@cosyte/dates";

toISO({ year: 1988 }); // => "1988"
toISO({ year: 1988, month: 5, day: 7 }); // => "1988-05-07"

const collected = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
toInstant(collected).toString(); // => "1988-05-07T08:15:00Z"
```

## Who it is for

Developers who read dates out of healthcare messages with a `@cosyte/*` parser and need to check
them, print them, or put them on a timeline: a date of birth, an admission time, a specimen
collection time. Each of those can arrive at a different precision, and each one moved by a day or
an hour is a wrong record that nothing flags.

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
- It carries no arithmetic, comparison, or formatting helpers: convert with `toTemporal()` and use
  Temporal for the rest.
- It renders ISO 8601 only, with no locale-aware or human-readable output.
- It handles years 1000 to 9999 in the proleptic Gregorian calendar, and no leap seconds.

## Status

This package is on the 0.1 line. The exported functions, the shape of `DateParts`, the issue codes,
and the error classes are settled and safe to depend on. Below 1.0, a breaking change to any of them
ships in a new minor version and is called out in the changelog.

## Where to go next

- [Installation](./installation.md), then the [Quickstart](./quickstart.md): a first program in a
  few minutes.
- [Put two senders' timestamps on one timeline](./order-events-from-two-senders.md): a tutorial that
  takes local times from two feeds to one ordered list of instants.
- The how-to guides: [validate a value](./validate-date-parts.md),
  [render or convert it](./render-and-convert.md), and
  [get an instant from a local time](./get-an-instant.md).
- [Precision](./concepts-precision.md) and [Zones and instants](./concepts-zones.md): why the package
  refuses where other date code guesses.
- The reference: [the date-parts contract](./date-parts-contract.md),
  [errors and issue codes](./errors-and-issue-codes.md), and the [API](./api/README.md).
