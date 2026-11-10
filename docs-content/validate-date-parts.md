---
id: validate-date-parts
title: Validate a date-parts value
sidebar_label: Validate a value
description: "Check a date-parts value before you trust it: read every fault, use a type guard, or throw with the faults attached."
---

# Validate a date-parts value

Check a value from a parser before you store or convert it. This page shows the three ways to ask,
and how to read the answer. [The date-parts contract](./date-parts-contract.md) lists every rule a
value is checked against.

## Get every fault at once

`validateParts()` takes any argument and never throws. A valid value comes back with its recognized
components and its precision:

```ts runnable
import { validateParts } from "@cosyte/dates";

validateParts({ year: 1988, month: 5, day: 7 }); // => { valid: true, parts: { year: 1988, month: 5, day: 7 }, precision: "day" }
```

An invalid value comes back with every fault, not only the first. Each issue names the component,
the code of the rule it broke, and a message:

```ts runnable
import { validateParts } from "@cosyte/dates";

const result = validateParts({ year: 88, month: 13, day: 40 });
result.valid; // => false

const faults = result.valid
  ? []
  : result.issues.map((issue) => `${issue.component}: ${issue.code}`);
faults; // => ["year: year-not-four-digits", "month: out-of-range", "day: out-of-range"]
```

Branch on `result.valid` before you read `parts` or `issues`: TypeScript narrows the result to
`ValidPartsResult` or `InvalidPartsResult` on that check. Each code is listed, with what raises it,
in [Errors and issue codes](./errors-and-issue-codes.md#issue-codes).

## Use a type guard

`isValidParts()` is the same check as a boolean, and narrows an `unknown` to `DateParts`:

```ts runnable
import { isValidParts } from "@cosyte/dates";

const fromParser: unknown = { year: 2024, month: 2, day: 29 };

// Inside the guard, fromParser is typed as DateParts.
const day = isValidParts(fromParser) ? fromParser.day : undefined;
day; // => 29
isValidParts({ year: 2025, month: 2, day: 29 }); // => false
```

## Throw with the faults attached

`assertValidParts()` returns the recognized components, or throws a `DatePartsError` whose `issues`
are the same array `validateParts()` would return:

```ts runnable
import { DatePartsError, assertValidParts } from "@cosyte/dates";

assertValidParts({ year: 1988, month: 5 }); // => { year: 1988, month: 5 }

let codes: string[] = [];
try {
  assertValidParts({ year: 2025, month: 2, day: 29 });
} catch (error) {
  if (error instanceof DatePartsError) codes = error.issues.map((issue) => issue.code);
}
codes; // => ["no-such-calendar-date"]
```

Every converter (`toISO`, `toTemporal`, `toZonedDateTime`, `toInstant`) and `precisionOf` validates
its argument the same way and throws the same `DatePartsError`, so you do not need to validate before
you convert. Validate first when you want to report the faults without a `try`.

## Pass only the components the contract names

Validation reads `year`, `month`, `day`, `hour`, `minute`, `second`, `fraction` and `offsetMinutes`,
and nothing else. A property with any other name is ignored and left out of `parts`:

```ts runnable
import { validateParts } from "@cosyte/dates";

const result = validateParts({
  year: 2026,
  month: 3,
  day: 9,
  hour: 8,
  minute: 5,
  millisecond: 250,
});
result.valid ? result.precision : undefined; // => "minute"
```

If your source holds sub-second time under another name, such as milliseconds, convert it to
`fraction`, a share of one second (250 milliseconds is `0.25`), before you validate.

## Log a fault without logging the date

A message quotes the one component at fault and its value, never the whole date:

```ts runnable
import { validateParts } from "@cosyte/dates";

const result = validateParts({ year: 1988, month: 13, day: 7 });
result.valid ? "" : result.issues[0]?.message; // => "month must be an integer in 1 to 12 (spec-native, January is 1, not 0); received the number 13"
```

A date of birth is PHI, and even one component of it may be. To log nothing from the value, log the
`component` and `code` of each issue and leave out the `message`.

## Reference

- [`validateParts`](./api/README.md#validateparts), [`isValidParts`](./api/README.md#isvalidparts),
  [`assertValidParts`](./api/README.md#assertvalidparts) and
  [`DatePartsError`](./api/README.md#datepartserror) in the API reference.
- [`ValidationResult`](./api/README.md#validationresult) and
  [`ValidationIssue`](./api/README.md#validationissue), the shapes it returns.
- [The date-parts contract](./date-parts-contract.md) and
  [Errors and issue codes](./errors-and-issue-codes.md).
- [Precision](./concepts-precision.md) explains why a fault is refused rather than repaired.
