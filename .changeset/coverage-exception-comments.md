---
"@cosyte/dates": patch
---

No behavior changes: we mark each line no input can reach with a coverage exception that names its reason, so the test suite can hold every coverage metric at 100.

The converters now read the date components a validated value is known to carry through one internal helper, which returns exactly what the inline reads did.
