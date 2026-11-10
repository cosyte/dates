---
"@cosyte/dates": patch
---

The type declarations now describe the fields of each validation result and of `DatePartsError`.

`ValidationIssue.code`, `DatePartsError.issues`, and the `valid`, `parts`, `precision` and `issues`
fields of the two result types now carry doc comments, which an editor shows on hover, and three
existing comments use US spelling. No behavior changes.
