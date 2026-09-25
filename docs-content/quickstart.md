---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

A complete program. Save it as `quickstart.mjs` in a project where `@cosyte/dates` is installed and
run it with `node quickstart.mjs`.

```js
import { precisionOf, toISO, toInstant, toTemporal, validateParts } from '@cosyte/dates';

// A date of birth that arrived as a year and nothing more. It stays a year.
const birthYear = { year: 1988 };
console.log(toISO(birthYear), '| precision:', precisionOf(birthYear));

// A calendar date. No midnight is invented, and no zone is attached.
const admitted = { year: 1988, month: 5, day: 7 };
console.log(toISO(admitted), '| Temporal:', toTemporal(admitted).constructor.name);

// A timestamp whose sender stated its offset. The offset is kept exactly.
const collected = { year: 1988, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
console.log(toISO(collected), '->', toInstant(collected).toString());

// The same timestamp with an unknown offset. Nothing guesses one.
const unknownZone = { year: 1988, month: 5, day: 7, hour: 13, minute: 45 };
try {
  toInstant(unknownZone);
} catch (error) {
  console.log(error.name);
}

// A date that does not exist is refused, and says which rule it broke.
const result = validateParts({ year: 2025, month: 2, day: 29 });
console.log(result.valid ? 'valid' : result.issues[0].message);
```

It prints:

```text
1988 | precision: year
1988-05-07 | Temporal: PlainDate
1988-05-07T13:45+05:30 -> 1988-05-07T08:15:00Z
MissingZoneError
day 29 does not exist: February 2025 has 28 days, because 2025 is not a leap year in the proleptic Gregorian calendar
```

The output is the same under every host `TZ`: nothing here reads the machine's time zone.

## The shape it accepts

A parts value is a plain object: `year` (four digits), then optionally `month` (1 to 12, January is
1), `day`, `hour`, `minute`, `second`, `fraction` (of one second) and `offsetMinutes` (signed minutes
from UTC). Components run from `year` downward with no gaps, and whichever is the least significant
one present is the value's precision. The [Precision](./concepts-precision) page has the full rules.

## Next

- [Precision](./concepts-precision): what a parts value is, and why a year stays a year.
- [Zones and instants](./concepts-zones): when an absolute instant is possible, and when it is refused.
- [Troubleshooting](./troubleshooting): every error and issue code, and what to do about it.
