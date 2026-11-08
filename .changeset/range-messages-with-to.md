---
"@cosyte/dates": patch
---

Validation messages now write a range with "to", for example `month must be an integer in 1 to 12`, where they wrote `1-12`.

The issue codes (`out-of-range`, `year-not-four-digits`) and the error classes are unchanged, so code that branches on `code` or on the error class needs no change. Code that matches the message text has to follow: the year, month, day, hour, minute, second, and `offsetMinutes` range messages, and the `RangeError` an out-of-range `offsetMinutes` option throws, all use "to" now. The same wording reaches the type declarations' doc comments.
