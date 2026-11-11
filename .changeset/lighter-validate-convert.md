---
"@cosyte/dates": patch
---

Validation and conversion do less work per value, with every result and error unchanged.

`validateParts` and every converter now check a value without building intermediate objects, so a
valid value costs its result and nothing else, and reading a `fraction` no longer runs a regular
expression. `toISO` spells its string in one step. `toInstant`, `toZonedDateTime` and `toTemporal`
build only the Temporal object they return: at a fixed offset the instant is computed directly, and
in a named zone the local time is placed without an intermediate `PlainDateTime`. A named zone is
checked to exist once per process rather than on every call. Nothing a caller passes or receives
changes, so there is nothing to adapt.
