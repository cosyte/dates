<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/dates

> Work with the dates the @cosyte/* parsers give you, without losing what the wire actually said.

[![npm version](https://img.shields.io/npm/v/@cosyte/dates.svg)](https://www.npmjs.com/package/@cosyte/dates)
[![CI](https://github.com/cosyte/dates/actions/workflows/ci.yml/badge.svg)](https://github.com/cosyte/dates/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/cosyte/dates/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

Date and time utilities for the @cosyte/* healthcare parsers: precision-preserving conversion and validation that never guesses a timezone.

## Why this exists

Healthcare parsers hand back dates that are deliberately not JavaScript `Date`
objects. An HL7 v2 `|1970|` is a year, `|19880507|` is a calendar day, and a
value with no offset is the sender's local time by the standard's own words. The
parsers preserve exactly that and refuse to invent the rest, which is why they
carry no date library at all.

That fidelity leaves a gap: a developer still has to validate, compare and
convert those values, and the obvious tools all model an absolute instant. Reach
for `new Date('1988')` and you have silently acquired a month, a day, a midnight
and a timezone that nobody sent you. This package is the opt-in companion that
closes the gap without any of that, so the parsers stay zero-dependency and
nobody has their date library chosen for them.

## Status

**0.1.0. The public API is settled and safe to depend on.** The exported
functions, the shape of `DateParts`, the issue codes and the error classes are
what this package intends to keep, and a breaking change to any of them will
come with a major version.

Not covered at 0.1.0, and named so the boundary is not a surprise:

- **No parsing of vendor date text.** This package consumes parts that a
  `@cosyte/*` parser already produced. Format strings and vendor token grammars
  live in the parsers' profile systems, not here.
- **No two-digit years, ever.** `year` must be four digits. There is no century
  window, no pivot, and no configuration that adds one.
- **No arithmetic, comparison or formatting helpers.** Convert with
  `toTemporal()` and use Temporal for the rest.
- **No locale-aware or human-readable output.** `toISO()` renders ISO 8601 and
  nothing else.
- **Years 1000 to 9999 only**, in the proleptic Gregorian calendar. No other
  calendar system, and no leap seconds.

## Install

```sh
pnpm add @cosyte/dates
```

Node `>=22.0.0`. ESM only: this package ships no CommonJS build, so `require()`
will not load it.

It carries exactly one runtime dependency, [`temporal-polyfill`][polyfill],
because `Temporal.PlainDate` is the only widely available type that can hold a
calendar date with no time of day and no zone. `Temporal` is re-exported from
this package, so a consumer works with the same objects rather than installing a
second copy.

[polyfill]: https://www.npmjs.com/package/temporal-polyfill

## Usage

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

```text
1988 | precision: year
1988-05-07 | Temporal: PlainDate
1988-05-07T13:45+05:30 -> 1988-05-07T08:15:00Z
MissingZoneError
day 29 does not exist: February 2025 has 28 days, because 2025 is not a leap year in the proleptic Gregorian calendar
```

That output is identical under every host `TZ`, and
`test/readme.test.ts` runs this exact block against the built package and
compares it character for character.

## PHI and safety

A date of birth is PHI, and a wrong conversion is the quiet kind of defect: it
returns a plausible date rather than an error, and a consumer that has already
written it into a record does not learn of it from a later fix. What this
package does about that:

- **It writes nothing, anywhere.** No logging, no telemetry, no files, no
  network. Nothing is written to stdout or stderr, on any code path including
  every error path. `test/package-contract.test.ts` proves it by running every
  public entry point in a child process and asserting both streams are empty and
  that nothing was written to the working directory.
- **It retains nothing.** Every function is pure and holds no state between
  calls. A value passed in is not cached, memoised or referenced after return.
- **It refuses rather than guesses.** No century window, no host timezone
  fallback, no midnight for a date with no time, no picking one side of a
  daylight-saving transition, no rounding a sub-second value to make it fit.
  Each of those raises a named error instead.
- **Diagnostics quote one component, never the whole value.** A validation
  message names the component at fault and the value of THAT component
  (`month must be an integer in 1-12 ...; received the number 13`). It never
  assembles the full date into an error string.

What the consumer still owns: whether to log an error message that may contain
one component of a patient's date of birth, how the parts got there, and where
the converted value goes next. This package is a pure function in the middle.

## API

| export                             | what it does                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateParts(value)`             | Checks a value against the contract. Never throws. Returns every fault, not just the first.                                                                                |
| `isValidParts(value)`              | The same check as a type guard.                                                                                                                                            |
| `assertValidParts(value)`          | Returns the recognised components, or throws `DatePartsError`.                                                                                                             |
| `precisionOf(value)`               | The least significant present component: `'year'` through `'fraction'`.                                                                                                    |
| `toISO(value)`                     | ISO 8601 at the value's own precision. `1988`, `1988-05`, `1988-05-07T13:45+05:30`.                                                                                        |
| `toTemporal(value)`                | The narrowest Temporal type that carries everything the value states: `PlainYearMonth`, `PlainDate`, `PlainDateTime`, or `ZonedDateTime` when the value carries an offset. |
| `toZonedDateTime(value, options?)` | The value placed in a stated zone. Needs a time of day and a zone.                                                                                                         |
| `toInstant(value, options?)`       | The absolute instant, same requirements.                                                                                                                                   |
| `Temporal`                         | The Temporal implementation this package converts into.                                                                                                                    |

Errors: `DatePartsError` (carries the same `issues` the validator reports),
`MissingZoneError`, `PrecisionError`, `AmbiguousLocalTimeError`.

The caveats that bite:

- A value's OWN `offsetMinutes` always wins. `options` apply only when the
  offset is unknown, so passing a `timeZone` never re-zones data the sender
  already qualified.
- `toTemporal()` throws for a year-only value, because Temporal has no year-only
  type and this package will not invent a month to reach one.
- An absent `offsetMinutes` means UNKNOWN. It does not mean UTC, and it does not
  mean the host zone.

## Compatibility

The input shape is the spec-native parts value the `@cosyte/*` parsers produce:
`month` is 1 to 12, not JavaScript's 0 to 11, and components run from `year`
downward with no gaps. Handled: year, month, day, hour, minute, second,
sub-second down to one nanosecond, and a signed offset in minutes.

`fraction` must be a whole number of nanoseconds, which is nine decimal places of
a second and Temporal's own floor. A value carrying finer detail is REFUSED with
`finer-than-nanosecond` rather than rounded to fit, because a silent round is the
class of change this package exists to not make.

Known NOT handled, deliberately: two-digit years, leap seconds, calendars other
than the proleptic Gregorian, years outside 1000 to 9999, sub-second detail finer
than one nanosecond, an offset on a value that states no time of day, and any
zone abbreviation such as `CST` (they are ambiguous across regions, so an IANA
identifier or a numeric offset is required).

## Contributing

Issues and pull requests are welcome at
[github.com/cosyte/dates](https://github.com/cosyte/dates). A contribution has
to clear the same gate CI runs on every push: `pnpm run build`, `pnpm run
typecheck`, `pnpm run lint`, `pnpm run test`, and
`bash scripts/check-no-emdash.sh`. New behaviour needs a test, and anything
touching conversion needs one that pins the exact output rather than a shape.

## License

MIT, Cosyte. See [LICENSE](https://github.com/cosyte/dates/blob/main/LICENSE).
