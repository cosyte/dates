---
id: get-an-instant
title: Get an instant from a local time
sidebar_label: Get an instant
description: "Turn a date-parts value into an absolute instant or a zoned date-time: state the zone, keep a sender's offset, and settle a daylight-saving refusal."
---

# Get an instant from a local time

An absolute instant needs two things the value may not carry: a time of day, and a zone. This page
shows how to supply the zone, and what to do when a call refuses. [Zones and
instants](./concepts-zones.md) explains why nothing is filled in for you.

## Use the sender's own offset

A value that states `offsetMinutes` converts with no options:

```ts runnable
import { toInstant } from "@cosyte/dates";

const collected = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
toInstant(collected).toString(); // => "1988-05-07T08:15:00Z"
```

## Say which zone a local time is in

A value with no `offsetMinutes` is the sender's local time. Pass the sender's zone as an IANA
identifier with `{ timeZone }`, or as a fixed offset in minutes with `{ offsetMinutes }`:

```ts runnable
import { toInstant, toZonedDateTime } from "@cosyte/dates";

const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };

toInstant(local, { timeZone: "America/New_York" }).toString(); // => "2026-03-09T12:05:00Z"
toInstant(local, { offsetMinutes: -300 }).toString(); // => "2026-03-09T13:05:00Z"
toZonedDateTime(local, { timeZone: "America/New_York" }).toString(); // => "2026-03-09T08:05:00-04:00[America/New_York]"
```

`toZonedDateTime()` returns a `Temporal.ZonedDateTime` that keeps the zone; `toInstant()` returns a
`Temporal.Instant`. Both take the same arguments and refuse in the same cases.

Pass one of the two options, not both: both together throw a `TypeError`. An `offsetMinutes` option
must be a whole number from -1439 to 1439, or the call throws a `RangeError`.

## Know that a stated offset wins

When the value carries `offsetMinutes`, that offset is used and the options are not consulted, so
data the sender already qualified is never re-zoned:

```ts runnable
import { toZonedDateTime } from "@cosyte/dates";

const stated = { year: 2026, month: 3, day: 9, hour: 8, minute: 5, offsetMinutes: -300 };
toZonedDateTime(stated, { timeZone: "Asia/Tokyo" }).toString(); // => "2026-03-09T08:05:00-05:00[-05:00]"

// To show the same instant in another zone, convert first, then use Temporal.
toZonedDateTime(stated).withTimeZone("Asia/Tokyo").toString(); // => "2026-03-09T22:05:00+09:00[Asia/Tokyo]"
```

## Prefer a zone name to an abbreviation

A zone name such as `America/New_York` follows daylight-saving time. A fixed offset does not. Some
abbreviations are refused outright, and some are accepted because they are also the names of fixed
offsets, which can be an hour off for half the year:

```ts runnable
import { toInstant } from "@cosyte/dates";

const local = { year: 2026, month: 7, day: 9, hour: 8, minute: 5 };

toInstant(local, { timeZone: "America/New_York" }).toString(); // => "2026-07-09T12:05:00Z"
toInstant(local, { timeZone: "EST" }).toString(); // => "2026-07-09T13:05:00Z"

let refused = "";
try {
  toInstant(local, { timeZone: "CST" });
} catch (error) {
  refused = error instanceof Error ? error.name : "";
}
refused; // => "RangeError"
```

`EST` is always UTC-05:00, even in July, when New York is on UTC-04:00. Use the zone name for a
place, and `{ offsetMinutes }` only when the sender really meant a fixed offset.

## Settle a daylight-saving refusal

A local time that a transition skips, or one that it repeats, has no single instant, and the call
throws `AmbiguousLocalTimeError`. The message names both candidate offsets for a repeated time. Find
out which one the sender meant, then pass it as `{ offsetMinutes }`:

```ts runnable
import { AmbiguousLocalTimeError, toInstant } from "@cosyte/dates";

// 01:30 happens twice in New York on 1 November 2026.
const repeated = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };

let message = "";
try {
  toInstant(repeated, { timeZone: "America/New_York" });
} catch (error) {
  if (error instanceof AmbiguousLocalTimeError) message = error.message;
}
message.includes("at -04:00 and again at -05:00"); // => true

toInstant(repeated, { offsetMinutes: -240 }).toString(); // => "2026-11-01T05:30:00Z"
toInstant(repeated, { offsetMinutes: -300 }).toString(); // => "2026-11-01T06:30:00Z"
```

A skipped time is refused the same way. 02:30 never happened on a clock in New York on 8 March
2026, so ask the sender what it means before you pick an offset:

```ts runnable
import { AmbiguousLocalTimeError, toInstant } from "@cosyte/dates";

const skipped = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };

let message = "";
try {
  toInstant(skipped, { timeZone: "America/New_York" });
} catch (error) {
  if (error instanceof AmbiguousLocalTimeError) message = error.message;
}
message.includes("does not exist in America/New_York"); // => true
```

## Convert a value with no time of day

A calendar date has no instant: choosing midnight would add a component the value does not carry.
`toInstant()` and `toZonedDateTime()` throw a `PrecisionError` for a value at `day` precision or
coarser. Use `toTemporal()` for a calendar value, as [Render or convert a
value](./render-and-convert.md#convert-to-temporal) shows.

## Reference

- [`toInstant`](./api/README.md#toinstant), [`toZonedDateTime`](./api/README.md#tozoneddatetime),
  [`ZoneOptions`](./api/README.md#zoneoptions),
  [`AmbiguousLocalTimeError`](./api/README.md#ambiguouslocaltimeerror) and
  [`MissingZoneError`](./api/README.md#missingzoneerror) in the API reference.
- [Errors and issue codes](./errors-and-issue-codes.md#errors): every refusal these calls make.
