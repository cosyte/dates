---
id: concepts-zones
title: Zones and instants
sidebar_label: Zones and instants
description: "Why a value with no offset is not UTC, why a sender's own offset always wins, and why a daylight-saving gap or repeat is refused."
---

# Zones and instants

A timestamp with no offset is the sender's local time, and nothing on the wire says which zone that
was. `@cosyte/dates` treats an absent `offsetMinutes` as unknown: not UTC, and not the zone of the
machine running your code. This page explains why, and what that means for each conversion.

## Unknown is not UTC, and not the host zone

Most date code fills an unknown zone with something. Reading the value as UTC is wrong for every
sender that is not on UTC. Reading it in the host's zone is worse: the answer then depends on where
the code runs, so a test passes on a laptop and the same value lands an hour or a day elsewhere on a
server. Either way the result looks like a real instant, and nothing downstream can tell it was
guessed.

So a value with no offset becomes an instant only when someone states the zone, and every function
here gives the same answer under every host `TZ`. We run the test suite under two host zones far
apart to hold it to that; [Testing and quality](./testing-and-quality.md) describes how.

## What an instant needs

`toInstant()` and `toZonedDateTime()` need two things:

- **A time of day.** A calendar date is a whole day, which starts at a different instant in every
  zone. Turning it into one instant means choosing midnight, a component the value does not carry,
  so a value at `day` precision or coarser is refused with a `PrecisionError`.
- **A zone.** Either the value's own `offsetMinutes`, or a zone the caller passes. With neither, the
  call throws a `MissingZoneError`.

## The sender's own offset wins

When the sender stated `offsetMinutes`, that offset is used, and a zone the caller passes is not
applied to that value. The offset is what the sender said. Re-zoning it on the caller's say-so would
move the instant, and a caller converting a mixed batch would do that without noticing. Options
exist for exactly one case: a value whose offset is unknown.

The stated offset is also kept exactly. `toISO()` renders an offset of zero as `+00:00`, not `Z`,
and `toTemporal()` returns a `ZonedDateTime` at that fixed offset rather than in a named zone,
because the sender stated an offset, not a place.

## Daylight-saving gaps and repeats

Twice a year a named zone breaks the one-to-one mapping from local time to instant. When the
clocks go forward, a local hour is skipped and never happens. When they go back, a local hour
happens twice, an hour apart.

Temporal's own default resolves both with a rule: it moves a skipped time forward and takes the
earlier of two. That rule picks an instant the sender may not have meant, and an hour is the difference
between a dose given before a result and one given after. So `toInstant()` and `toZonedDateTime()`
refuse both with an `AmbiguousLocalTimeError`. For a repeated time the message names both candidate
offsets. The caller finds out which one the sender meant and passes it as `{ offsetMinutes }`.

The package finds these times by asking, not by catching an error. It converts the local time with
Temporal's "earlier" rule and again with its "later" rule. The two agree on every local time that
happens once, and differ only where a transition skips or repeats it. A fixed offset has no
transitions, so it is never refused this way.

## Zone names and abbreviations

A zone name from the IANA time zone database, such as `America/Chicago`, carries the place's
daylight-saving rules. An abbreviation names no place: `CST` is used for more than one offset around
the world, and Temporal does not know it, so the call throws a `RangeError`. A few abbreviations are
accepted because they are also IANA names, and they do not behave alike. `EST` is UTC-05:00 all
year. `CET` follows daylight-saving time, UTC+01:00 in January and UTC+02:00 in July:

```ts runnable
import { toInstant } from "@cosyte/dates";

const january = { year: 2026, month: 1, day: 15, hour: 12, minute: 0 };
const july = { year: 2026, month: 7, day: 15, hour: 12, minute: 0 };

toInstant(january, { timeZone: "EST" }).toString(); // => "2026-01-15T17:00:00Z"
toInstant(july, { timeZone: "EST" }).toString(); // => "2026-07-15T17:00:00Z"
toInstant(january, { timeZone: "CET" }).toString(); // => "2026-01-15T11:00:00Z"
toInstant(july, { timeZone: "CET" }).toString(); // => "2026-07-15T10:00:00Z"
```

Name the place, or pass a fixed offset only when the sender meant one.

## Put it into practice

- [Get an instant from a local time](./get-an-instant.md): state a zone, keep a sender's offset, and
  settle a daylight-saving refusal.
- [Put two senders' timestamps on one timeline](./order-events-from-two-senders.md): the same steps,
  start to finish, on a night the clocks go back.
- [Precision](./concepts-precision.md): why a calendar date is never given a midnight.
