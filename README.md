<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="Cosyte: a plus mark set in two overlapping rounded squares, one solid and one outlined, beside the Cosyte wordmark" src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/dates

> Work with the dates the @cosyte/* parsers give you, without losing what the wire actually said.

Date and time utilities for the `@cosyte/*` healthcare parsers. Precision-preserving conversion, vendor format grammar, no timezone guessing. Pre-launch.

## Why this exists

Healthcare parsers hand back dates that are deliberately not JavaScript `Date`
objects. An HL7 `|1970|` is a year, `|19880705|` is a calendar day, and a value
with no offset is the sender's local time by the standard's own words. The
parsers preserve that, and refuse to invent a timezone.

That fidelity leaves a gap: a developer still has to compare, convert and format
those values. This package is the opt-in companion that closes it, so the
parsers themselves stay zero-dependency and nobody has their date library chosen
for them.

## Status

**Pre-launch, and nothing here is built yet.** This repository was created so
the work has somewhere to land. The package is unpublished, has no API, and
nothing should depend on it. Its scope is set in the umbrella decision record
for parser date handling, dated 2026-08-28.

## Install

Not yet published.

## Contributing

Not yet open for contributions. Issues are welcome once the package has a first
release.

## License

MIT, Cosyte.
