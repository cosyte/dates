---
id: concepts-zones
title: Zones and instants
sidebar_position: 2
---

# Zones and instants

A timestamp with no offset is the sender's local time, and nothing on the wire says which zone that
was. `@cosyte/dates` treats an absent `offsetMinutes` as UNKNOWN: not UTC, and not the zone of the
machine running your code.

## When an instant is possible

`toInstant()` and `toZonedDateTime()` need two things: a time of day, and a zone.

- **The value's own offset always wins.** When the sender stated `offsetMinutes`, that is the offset
  used, and any zone you pass is ignored for that value, so data the sender already qualified is
  never re-zoned.
- **Otherwise you say which zone applies**, with `{ timeZone }` (an IANA identifier) or
  `{ offsetMinutes }` (a fixed offset).

```js
import { toInstant, toZonedDateTime } from '@cosyte/dates';

const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };

toInstant(local, { timeZone: 'America/New_York' }).toString(); // '2026-03-09T12:05:00Z'
toInstant(local, { offsetMinutes: 0 }).toString(); // '2026-03-09T08:05:00Z'
toZonedDateTime(local, { timeZone: 'America/New_York' }).toString();
// '2026-03-09T08:05:00-04:00[America/New_York]'

const stated = { ...local, offsetMinutes: -300 };
toInstant(stated).toString(); // '2026-03-09T13:05:00Z'
```

## When it is refused

| situation                                          | what happens                     |
| -------------------------------------------------- | -------------------------------- |
| no `offsetMinutes` on the value and no zone passed | throws `MissingZoneError`        |
| the value has no time of day                       | throws `PrecisionError`          |
| the local time falls in a daylight-saving gap      | throws `AmbiguousLocalTimeError` |
| the local time happens twice at a transition       | throws `AmbiguousLocalTimeError` |
| the zone identifier is not one Temporal knows      | throws `RangeError`              |
| both `timeZone` and `offsetMinutes` are passed     | throws `TypeError`               |

The daylight-saving cases are refused rather than resolved, because picking a side silently shifts a
clinical timeline by an hour. The error message names both candidate offsets where there are two;
pass the one you mean as `{ offsetMinutes }`.

```js
toInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, { timeZone: 'America/New_York' });
// AmbiguousLocalTimeError: 2026-11-01T01:30:00 happens twice in America/New_York ...

toInstant(
  { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
  { offsetMinutes: -240 },
).toString();
// '2026-11-01T05:30:00Z'
```

An identifier Temporal does not know, such as the abbreviation `CST`, throws a `RangeError`. An
abbreviation can mean different offsets in different regions, so pass an IANA identifier such as
`America/Chicago`, or a numeric offset.
