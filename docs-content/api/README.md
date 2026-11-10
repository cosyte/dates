# @cosyte/dates

## Classes

### AmbiguousLocalTimeError

A local time was placed in a named zone where it does not exist, or exists
twice.

Both cases are resolved by REFUSING rather than by picking. A daylight-saving
transition is exactly where a silent choice shifts a clinical timeline by an
hour, so the caller is told and decides.

#### Example

```ts
const local = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
toInstant(local, { timeZone: "America/New_York" });
// throws AmbiguousLocalTimeError: 2026-11-01T01:30:00 happens twice in America/New_York ...
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new AmbiguousLocalTimeError**(`message`): [`AmbiguousLocalTimeError`](#ambiguouslocaltimeerror)

###### Parameters

###### message

`string`

The local time, the zone, and the candidate offsets where there are two.

###### Returns

[`AmbiguousLocalTimeError`](#ambiguouslocaltimeerror)

###### Overrides

`Error.constructor`

***

### DatePartsError

A conversion was asked for a value that validation reports invalid.

`issues` is the SAME array `validateParts()` returns for that value, so a
caller that catches this never has to validate again to learn what was wrong,
and a conversion never returns a coerced or clamped stand-in.

#### Example

```ts
try {
  toISO({ year: 2025, month: 2, day: 29 });
} catch (error) {
  if (error instanceof DatePartsError) error.issues[0]?.code; // 'no-such-calendar-date'
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DatePartsError**(`issues`): [`DatePartsError`](#datepartserror)

###### Parameters

###### issues

readonly [`ValidationIssue`](#validationissue)[]

Every fault `validateParts()` found in the value.

###### Returns

[`DatePartsError`](#datepartserror)

###### Overrides

`Error.constructor`

#### Properties

##### issues

> `readonly` **issues**: readonly [`ValidationIssue`](#validationissue)[]

Every fault `validateParts()` found in the value, in the order it found them.

***

### MissingZoneError

An absolute instant was asked for, and nothing said which zone the local time
is in.

This package never falls back to the host timezone, to UTC, or to any other
default, because a fallback turns an unknown into a plausible wrong answer.

#### Example

```ts
toInstant({ year: 2026, month: 3, day: 9, hour: 8, minute: 5 }); // throws MissingZoneError
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new MissingZoneError**(`message`): [`MissingZoneError`](#missingzoneerror)

###### Parameters

###### message

`string`

What was asked for, and how to say which zone applies.

###### Returns

[`MissingZoneError`](#missingzoneerror)

###### Overrides

`Error.constructor`

***

### PrecisionError

The value does not carry enough precision for what was asked, and supplying
the missing components would mean inventing them.

#### Example

```ts
try {
  toTemporal({ year: 1988 });
} catch (error) {
  if (error instanceof PrecisionError) error.precision; // 'year'
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new PrecisionError**(`message`, `precision`): [`PrecisionError`](#precisionerror)

###### Parameters

###### message

`string`

What was asked for, and which components it needs.

###### precision

`string`

The precision the value actually has.

###### Returns

[`PrecisionError`](#precisionerror)

###### Overrides

`Error.constructor`

#### Properties

##### precision

> `readonly` **precision**: `string`

The precision the value actually has.

## Interfaces

### DateParts

The date-parts value every `@cosyte/*` parser hands back, and the only shape
this package accepts.

Two rules make it a contract rather than a bag of numbers.

1. CONTIGUITY. Components are present from the most significant downward with
   no gaps. `{ year, month }` is legal; `{ year, day }` is not.
2. PRECISION IS WHAT IS PRESENT. The least significant present component IS
   the precision of the value. Nothing here adds a component that was not
   supplied, and an absent `offsetMinutes` means the offset is UNKNOWN, which
   is not the same as UTC and not the same as the host zone.

`month` is SPEC-NATIVE 1 to 12, not JavaScript's 0 to 11.

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

1 to 31, and a day that exists in the given month of the given year.

##### fraction?

> `readonly` `optional` **fraction?**: `number`

Sub-second precision as a fraction of one second: `0 <= fraction < 1`.

##### hour?

> `readonly` `optional` **hour?**: `number`

0 to 23.

##### minute?

> `readonly` `optional` **minute?**: `number`

0 to 59.

##### month?

> `readonly` `optional` **month?**: `number`

1 to 12, spec-native. January is 1.

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes from UTC, -1439 to 1439. ABSENT means the offset is unknown.
It never means zero, and it is never filled in from the host zone.

##### second?

> `readonly` `optional` **second?**: `number`

0 to 59. Leap seconds are not representable.

##### year?

> `readonly` `optional` **year?**: `number`

Four digits, 1000 to 9999. Required. Two-digit years are never interpreted.

***

### InvalidPartsResult

An invalid value, with every fault found rather than only the first.

#### Properties

##### issues

> `readonly` **issues**: readonly [`ValidationIssue`](#validationissue)[]

Every fault found, at least one.

##### valid

> `readonly` **valid**: `false`

Always `false` on this branch of [ValidationResult](#validationresult).

***

### ValidationIssue

One thing wrong with one component, named.

#### Properties

##### code

> `readonly` **code**: [`IssueCode`](#issuecode)

Which rule the component broke, one of the [IssueCode](#issuecode) values.

##### component

> `readonly` **component**: [`PartName`](#partname) \| `"value"`

The component at fault, or `'value'` when the argument itself is wrong.

##### message

> `readonly` **message**: `string`

Human-readable, names the component and the range or calendar rule broken.

***

### ValidPartsResult

A validated value, carrying only the recognized components that were present.

#### Properties

##### parts

> `readonly` **parts**: [`DateParts`](#dateparts)

The recognized components the value carried, and no others.

##### precision

> `readonly` **precision**: `"year"` \| `"month"` \| `"day"` \| `"hour"` \| `"minute"` \| `"second"` \| `"fraction"`

The least significant component present.

##### valid

> `readonly` **valid**: `true`

Always `true` on this branch of [ValidationResult](#validationresult).

***

### ZoneOptions

How to place a value that carries no offset of its own onto the timeline.

A value that DOES carry `offsetMinutes` is never re-zoned: its own offset is
what the sender said, and overriding it here would move the instant.

#### Properties

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

A fixed offset in signed minutes from UTC, -1439 to 1439.

##### timeZone?

> `readonly` `optional` **timeZone?**: `string`

An IANA time zone identifier, for example `'America/New_York'`.

## Type Aliases

### IssueCode

> **IssueCode** = `"not-a-parts-object"` \| `"missing-component"` \| `"unreadable"` \| `"not-a-number"` \| `"not-finite"` \| `"not-an-integer"` \| `"out-of-range"` \| `"year-not-four-digits"` \| `"finer-than-nanosecond"` \| `"offset-without-time-of-day"` \| `"no-such-calendar-date"`

What a diagnostic says went wrong.

***

### PartName

> **PartName** = [`Precision`](#precision-2) \| `"offsetMinutes"`

Every component name the contract defines.

***

### Precision

> **Precision** = *typeof* [`PRECISION_LADDER`](#precision_ladder)\[`number`\]

The least significant component present in a value IS its precision.

***

### TemporalValue

> **TemporalValue** = `Temporal.PlainYearMonth` \| `Temporal.PlainDate` \| `Temporal.PlainDateTime` \| `Temporal.ZonedDateTime`

The narrowest Temporal type that carries everything a value states, and nothing more.

***

### ValidationResult

> **ValidationResult** = [`ValidPartsResult`](#validpartsresult) \| [`InvalidPartsResult`](#invalidpartsresult)

What `validateParts()` returns: a valid value with its precision, or every fault found.

## Variables

### PRECISION\_LADDER

> `const` **PRECISION\_LADDER**: readonly \[`"year"`, `"month"`, `"day"`, `"hour"`, `"minute"`, `"second"`, `"fraction"`\]

The precision ladder, most significant first.

## Functions

### assertValidParts()

> **assertValidParts**(`value`): [`DateParts`](#dateparts)

Validate and return the recognized components, or throw [DatePartsError](#datepartserror)
carrying the same diagnostics [validateParts](#validateparts) would have reported.

#### Parameters

##### value

`unknown`

#### Returns

[`DateParts`](#dateparts)

#### Example

```ts
assertValidParts({ year: 1988, month: 5 }); // { year: 1988, month: 5 }
assertValidParts({ year: 2025, month: 2, day: 29 }); // throws DatePartsError
```

***

### isValidParts()

> **isValidParts**(`value`): `value is DateParts`

A type guard over [validateParts](#validateparts), for callers that want a boolean.

#### Parameters

##### value

`unknown`

#### Returns

`value is DateParts`

#### Example

```ts
isValidParts({ year: 2024, month: 2, day: 29 }); // true
isValidParts({ year: 2025, month: 2, day: 29 }); // false
```

***

### precisionOf()

> **precisionOf**(`value`): `"year"` \| `"month"` \| `"day"` \| `"hour"` \| `"minute"` \| `"second"` \| `"fraction"`

The precision of a value: its least significant present component.

Throws [DatePartsError](#datepartserror) for a value that does not satisfy the contract,
because an invalid value has no precision to report.

#### Parameters

##### value

`unknown`

#### Returns

`"year"` \| `"month"` \| `"day"` \| `"hour"` \| `"minute"` \| `"second"` \| `"fraction"`

#### Example

```ts
precisionOf({ year: 1988 }); // 'year'
precisionOf({ year: 1988, month: 5, day: 7, hour: 13 }); // 'hour'
```

***

### toInstant()

> **toInstant**(`value`, `options?`): `Instant`

The absolute instant a value denotes, in a stated zone.

Same requirements as [toZonedDateTime](#tozoneddatetime): a time of day, and a zone that
something states. Nothing is defaulted.

#### Parameters

##### value

`unknown`

##### options?

[`ZoneOptions`](#zoneoptions)

#### Returns

`Instant`

#### Example

```ts
const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };
toInstant(local, { timeZone: "America/New_York" }).toString(); // '2026-03-09T12:05:00Z'
toInstant({ ...local, offsetMinutes: -300 }).toString(); // '2026-03-09T13:05:00Z'
```

***

### toISO()

> **toISO**(`value`): `string`

Render a value as an ISO 8601 string AT ITS OWN PRECISION.

A year-only value renders `1988`; a month-only value renders `1988-05`. No
component the value did not state is ever added, so nothing here turns a year
of birth into the first of January.

The result is a pure function of the parts. It does not read the host clock or
the host time zone, so it is identical under every `TZ`.

#### Parameters

##### value

`unknown`

#### Returns

`string`

#### Example

```ts
toISO({ year: 1988 }); // '1988'
toISO({ year: 2026, month: 3, day: 9, hour: 8 }); // '2026-03-09T08'
toISO({ year: 2026, month: 3, day: 9, hour: 8, minute: 5, offsetMinutes: -300 });
// '2026-03-09T08:05-05:00'
```

#### Throws

if the value does not satisfy the contract.

***

### toTemporal()

> **toTemporal**(`value`): [`TemporalValue`](#temporalvalue)

Convert to the narrowest Temporal type that carries everything the value
states, and nothing it does not.

| precision of the value | result |
|---|---|
| `month` | `Temporal.PlainYearMonth` |
| `day` | `Temporal.PlainDate`, with no time of day and no zone |
| `hour` and finer, no offset | `Temporal.PlainDateTime`, with no zone |
| `hour` and finer, with `offsetMinutes` | `Temporal.ZonedDateTime` at that exact offset |

A year-only value has no Temporal counterpart and raises
[PrecisionError](#precisionerror) rather than acquiring a month. Use [toISO](#toiso) for
those, and [precisionOf](#precisionof) to branch.

Components below the value's own precision are zero in the Temporal object,
because Temporal has no partial type below `PlainYearMonth`. The value's real
precision is still available from [precisionOf](#precisionof); it is not lost, it just
cannot be carried by the returned object.

#### Parameters

##### value

`unknown`

#### Returns

[`TemporalValue`](#temporalvalue)

#### Example

```ts
toTemporal({ year: 2026, month: 3 }).toString(); // '2026-03'
toTemporal({ year: 2026, month: 3, day: 9 }).toString(); // '2026-03-09'
toTemporal({ year: 2026, month: 3, day: 9, hour: 8, minute: 5 }).toString();
// '2026-03-09T08:05:00'
```

#### Throws

if the value does not satisfy the contract.

#### Throws

for a year-only value.

***

### toZonedDateTime()

> **toZonedDateTime**(`value`, `options?`): `ZonedDateTime`

Place a value on the timeline in a stated zone.

Requires a time of day. A day-precision value is a calendar date, and turning
one into a zoned instant means choosing midnight, which is a component the
value does not carry. Use [toTemporal](#totemporal) for those.

Requires a zone. If the value carries `offsetMinutes` that offset is used and
PRESERVED EXACTLY, never normalized to UTC or to the host zone, and `options`
are not consulted. Otherwise `options.timeZone` or `options.offsetMinutes`
must say which zone the local time is in.

A local time that a named zone skips or repeats across a daylight-saving
transition raises [AmbiguousLocalTimeError](#ambiguouslocaltimeerror) rather than resolving to
one of the two candidates, because a silent pick shifts the value by an hour.

#### Parameters

##### value

`unknown`

##### options?

[`ZoneOptions`](#zoneoptions)

#### Returns

`ZonedDateTime`

#### Throws

if the value does not satisfy the contract.

#### Throws

if the value states no time of day.

#### Throws

if nothing says which zone applies.

#### Throws

at a daylight-saving transition.

#### Example

```ts
const local = { year: 2026, month: 3, day: 9, hour: 8, minute: 5 };
toZonedDateTime(local, { timeZone: "America/New_York" }).toString();
// '2026-03-09T08:05:00-04:00[America/New_York]'
```

***

### validateParts()

> **validateParts**(`value`): [`ValidationResult`](#validationresult)

Check a value against the date-parts contract.

Every fault is reported, not only the first, and every diagnostic names the
component at fault together with the range or calendar rule it broke. Nothing
is coerced, clamped or inferred: a value that does not satisfy the contract
comes back invalid rather than corrected.

This function never throws, for any argument at all. Hostile input (`null`, a
string, a JavaScript `Date`, `NaN`, `Infinity`, a non-integer component, a
component that throws when it is read) is reported, not raised.

Components are looked up by name, so an object carrying them on its prototype
(a class instance with accessors, which is a shape a parser may well hand
over) is read the same way a plain object literal is.

#### Parameters

##### value

`unknown`

#### Returns

[`ValidationResult`](#validationresult)

#### Example

```ts
validateParts({ year: 1988, month: 5, day: 7 });
// { valid: true, parts: { year: 1988, month: 5, day: 7 }, precision: 'day' }

const result = validateParts({ year: 1988, month: 13, day: 40 });
result.valid; // false
```
