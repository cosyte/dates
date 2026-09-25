# Changelog

## 0.1.0

### Minor Changes

- 6ba2afd: First release of `@cosyte/dates`: validate, render and convert the date parts the `@cosyte/*` parsers return, without adding precision a value did not state or guessing a time zone.

  What you can depend on from this release: `validateParts`, `isValidParts` and `assertValidParts`, which report every fault in a value and name the rule each one broke; `precisionOf`; `toISO`, which renders ISO 8601 at the value's own precision; `toTemporal`, which returns the narrowest Temporal type that carries everything the value states; `toZonedDateTime` and `toInstant`, which need a time of day and a zone and never fall back to the host zone or to UTC; the re-exported `Temporal`; the shape of `DateParts`; the issue codes; and the four error classes, `DatePartsError`, `MissingZoneError`, `PrecisionError` and `AmbiguousLocalTimeError`.

  What the version number promises: while it is below 1.0.0, a breaking change to any of the above ships in a new minor version, never a patch, and its entry here says what broke and what to do instead. A fix that changes nothing else a consumer relies on ships as a patch.

  Not covered yet: parsing vendor date text (the parsers do that), two-digit years (never interpreted), arithmetic, comparison or formatting helpers (convert with `toTemporal()` and use Temporal for those), locale-aware output, years outside 1000 to 9999, calendars other than the proleptic Gregorian, and leap seconds.
