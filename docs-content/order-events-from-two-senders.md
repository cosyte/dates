---
id: order-events-from-two-senders
title: Put two senders' timestamps on one timeline
sidebar_label: Two senders, one timeline
description: "A tutorial: validate timestamps from a clinic and a lab, turn each into an instant, settle a daylight-saving repeat, and sort them."
---

# Put two senders' timestamps on one timeline

In this tutorial we take timestamps from two systems and put them in the order they happened. A
clinic sends local times with no offset. A lab sends times with their offset stated. The night is
1 November 2026, when clocks in the United States go back an hour, so one local time happens twice.

By the end you will have one list of events in true order, with every value checked, every zone
stated, and nothing guessed. Each step below is a complete program: run any of them on its own in a
project where `@cosyte/dates` is installed. Every value is synthetic.

## Step 1: check what arrived

Start by validating every value. Nothing is converted yet; we only want to know which values we can
trust.

```ts runnable
import { validateParts } from "@cosyte/dates";

// The clinic sends local times in America/Chicago, with no offset.
const clinic = [
  { event: "admitted", at: { year: 2026, month: 11, day: 1, hour: 0, minute: 50 } },
  { event: "vitals taken", at: { year: 2026, month: 11, day: 1, hour: 1, minute: 30 } },
  { event: "transfer ordered", at: { year: 2026, month: 11, day: 1, hour: 24, minute: 5 } },
  { event: "note signed", at: { year: 2026, month: 11, day: 1, hour: 2, minute: 15 } },
];

// The lab states its offset on every value: -300 minutes is UTC-05:00.
const lab = [
  {
    event: "specimen collected",
    at: { year: 2026, month: 11, day: 1, hour: 2, minute: 10, offsetMinutes: -300 },
  },
  {
    event: "result reported",
    at: { year: 2026, month: 11, day: 1, hour: 3, minute: 5, offsetMinutes: -300 },
  },
];

for (const { event, at } of [...clinic, ...lab]) {
  const result = validateParts(at);
  console.log(event, result.valid ? result.precision : result.issues.map((issue) => issue.code));
}

const transfer = validateParts({ year: 2026, month: 11, day: 1, hour: 24, minute: 5 });
transfer.valid; // => false
transfer.valid ? [] : transfer.issues.map((issue) => issue.code); // => ["out-of-range"]
```

Five values are valid at minute precision. The transfer order says hour 24, which the contract
does not allow, so `validateParts()` reports `out-of-range` on `hour`. We do not fix it by guessing
that the sender meant midnight on the next day: we set it aside and ask the clinic.

## Step 2: put each value on the timeline

An instant needs a zone. The lab's values carry their own offset, so they need nothing more. The
clinic's values carry none, so we say which zone the clinic is in.

```ts runnable
import { AmbiguousLocalTimeError, toInstant } from "@cosyte/dates";

const clinicZone = { timeZone: "America/Chicago" };

const admitted = { year: 2026, month: 11, day: 1, hour: 0, minute: 50 };
const noteSigned = { year: 2026, month: 11, day: 1, hour: 2, minute: 15 };
toInstant(admitted, clinicZone).toString(); // => "2026-11-01T05:50:00Z"
toInstant(noteSigned, clinicZone).toString(); // => "2026-11-01T08:15:00Z"

// The lab's own offset wins: the zone we pass is not applied to a value that states one.
const collected = { year: 2026, month: 11, day: 1, hour: 2, minute: 10, offsetMinutes: -300 };
toInstant(collected, clinicZone).toString(); // => "2026-11-01T07:10:00Z"
toInstant(collected).toString(); // => "2026-11-01T07:10:00Z"

// 01:30 happens twice in Chicago that night, so it is refused.
const vitals = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
let refused = false;
try {
  toInstant(vitals, clinicZone);
} catch (error) {
  refused = error instanceof AmbiguousLocalTimeError;
  console.log(error instanceof Error ? error.message : error);
}
refused; // => true
```

The admission at 00:50 was still on daylight time, UTC-05:00. The note at 02:15 came after the
clocks went back, at UTC-06:00. Both are single instants, so they convert.

The vitals at 01:30 are refused with `AmbiguousLocalTimeError`. Its message names both candidates,
`-05:00` and `-06:00`, an hour apart. That hour decides whether the vitals were taken before or
after the specimen was collected, so the package will not pick one.

## Step 3: settle the repeated time and sort

We ask the clinic, and its system confirms the vitals were taken at the second 01:30, after the
clocks went back: UTC-06:00, which is -360 minutes. We pass that offset for that one value, convert
the rest as before, and sort by instant.

```ts runnable
import { Temporal, toISO, toInstant } from "@cosyte/dates";

const clinicZone = { timeZone: "America/Chicago" };
const day = { year: 2026, month: 11, day: 1 };

const events = [
  { event: "admitted", at: { ...day, hour: 0, minute: 50 }, zone: clinicZone },
  { event: "vitals taken", at: { ...day, hour: 1, minute: 30 }, zone: { offsetMinutes: -360 } },
  { event: "note signed", at: { ...day, hour: 2, minute: 15 }, zone: clinicZone },
  { event: "specimen collected", at: { ...day, hour: 2, minute: 10, offsetMinutes: -300 } },
  { event: "result reported", at: { ...day, hour: 3, minute: 5, offsetMinutes: -300 } },
];

const timeline = events
  .map(({ event, at, zone }) => ({ event, sent: toISO(at), instant: toInstant(at, zone) }))
  .sort((a, b) => Temporal.Instant.compare(a.instant, b.instant));

for (const { event, sent, instant } of timeline) {
  console.log(instant.toString(), event, `(sent as ${sent})`);
}

const order = timeline.map(({ event }) => event);
order; // => ["admitted", "specimen collected", "vitals taken", "result reported", "note signed"]
```

The vitals land at 07:30 UTC, twenty minutes after the specimen. Had the clinic meant the first
01:30, they would have landed at 06:30 UTC, before it:

```ts runnable
import { toInstant } from "@cosyte/dates";

const vitals = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
toInstant(vitals, { offsetMinutes: -300 }).toString(); // => "2026-11-01T06:30:00Z"
toInstant(vitals, { offsetMinutes: -360 }).toString(); // => "2026-11-01T07:30:00Z"
```

Each line printed in step 3 keeps `sent`, the value as it arrived, beside the instant, so a reader of
the timeline can still see what each sender stated.

## What you built

- Every value was checked before use, and the one that broke the contract was set aside, not
  repaired.
- Every instant came from a zone someone stated: the lab's own offset, the clinic's zone, or an
  offset the clinic confirmed.
- The one local time that happened twice was refused until we knew which one was meant.

## Where to go next

- [Get an instant from a local time](./get-an-instant.md): every way to state a zone, and what each
  refusal means.
- [Validate a date-parts value](./validate-date-parts.md): read every fault a value has.
- [Zones and instants](./concepts-zones.md): why an absent offset is not UTC, and why a
  daylight-saving repeat is refused.
