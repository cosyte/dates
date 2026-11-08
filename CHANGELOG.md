# Changelog

## 0.1.3

### Patch Changes

- 8c85aa7: The README follows the house layout, with sections for support and security, and the installation page names Node 26, which CI now tests.

## 0.1.2

### Patch Changes

- 3b32ce3: Validation messages now write a range with "to", for example `month must be an integer in 1 to 12`, where they wrote `1-12`.

  The issue codes (`out-of-range`, `year-not-four-digits`) and the error classes are unchanged, so code that branches on `code` or on the error class needs no change. Code that matches the message text has to follow: the year, month, day, hour, minute, second, and `offsetMinutes` range messages, and the `RangeError` an out-of-range `offsetMinutes` option throws, all use "to" now. The same wording reaches the type declarations' doc comments.

- fa6a741: The type declarations now carry a usage example for every exported function and error class, so an editor shows one on hover.

  Runtime behavior is unchanged. The repository's build, lint, format, type-check and test setup moved to the shared Cosyte configs, which add a 90% coverage gate, and CI now runs on Node 22 and Node 24.

## 0.1.1

### Patch Changes

- 38e450f: Published through npm trusted publishing, with provenance.

  The code, types and README are unchanged from 0.1.0.

## 0.1.0

### Minor Changes

- 6ba2afd: First release of `@cosyte/dates`: validate, render and convert the date parts the `@cosyte/*` parsers return, without adding precision a value did not state or guessing a time zone.

  What you can depend on from this release: `validateParts`, `isValidParts` and `assertValidParts`, which report every fault in a value and name the rule each one broke; `precisionOf`; `toISO`, which renders ISO 8601 at the value's own precision; `toTemporal`, which returns the narrowest Temporal type that carries everything the value states; `toZonedDateTime` and `toInstant`, which need a time of day and a zone and never fall back to the host zone or to UTC; the re-exported `Temporal`; the shape of `DateParts`; the issue codes; and the four error classes, `DatePartsError`, `MissingZoneError`, `PrecisionError` and `AmbiguousLocalTimeError`.

  What the version number promises: while it is below 1.0.0, a breaking change to any of the above ships in a new minor version, never a patch, and its entry here says what broke and what to do instead. A fix that changes nothing else a consumer relies on ships as a patch.

  Not covered yet: parsing vendor date text (the parsers do that), two-digit years (never interpreted), arithmetic, comparison or formatting helpers (convert with `toTemporal()` and use Temporal for those), locale-aware output, years outside 1000 to 9999, calendars other than the proleptic Gregorian, and leap seconds.
