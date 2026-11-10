---
id: installation
title: Installation
sidebar_label: Installation
description: "Install @cosyte/dates, check the Node.js versions it supports, and see its one runtime dependency."
---

# Installation

```bash
npm install @cosyte/dates
```

or `pnpm add @cosyte/dates`.

## Requirements

- **Node.js 22 or later, tested on 22, 24, and 26.**
- **ESM only.** The package ships no CommonJS build, so load it with `import`. A Node.js release
  that can `require()` an ES module loads it that way too, but we test only `import`.
- **TypeScript types are included.** The package carries its own declarations; there is no separate
  `@types` package to install.

## Dependencies

One runtime dependency, [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill),
because `Temporal.PlainDate` is the only widely available type that holds a calendar date with no
time of day and no zone. `Temporal` is re-exported from this package, so you work with the same
objects rather than installing a second copy: two Temporal implementations do not share
`instanceof`.

```ts runnable
import { Temporal, toTemporal } from "@cosyte/dates";

const admitted = toTemporal({ year: 1988, month: 5, day: 7 });
admitted instanceof Temporal.PlainDate; // => true
```

## Check the install

```ts runnable
import { precisionOf, toISO } from "@cosyte/dates";

console.log(toISO({ year: 1988, month: 5 }), precisionOf({ year: 1988, month: 5 }));
toISO({ year: 1988, month: 5 }); // => "1988-05"
precisionOf({ year: 1988, month: 5 }); // => "month"
```

If that prints `1988-05 month`, the install is good. Head to the [Quickstart](./quickstart.md).
