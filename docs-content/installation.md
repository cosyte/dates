---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

```bash
npm install @cosyte/dates
```

or `pnpm add @cosyte/dates`.

## Requirements

- **Node.js 22 or newer.**
- **ESM only.** The package ships no CommonJS build, so load it with `import`; `require()` will not
  load it.

## Dependencies

One runtime dependency, [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill),
because `Temporal.PlainDate` is the only widely available type that holds a calendar date with no
time of day and no zone. `Temporal` is re-exported from this package, so you work with the same
objects rather than installing a second copy: two Temporal implementations do not share
`instanceof`.

```js
import { Temporal } from '@cosyte/dates';
```

## Check the install

```js
import { toISO, precisionOf } from '@cosyte/dates';

console.log(toISO({ year: 1988, month: 5 }), precisionOf({ year: 1988, month: 5 }));
// 1988-05 month
```

If that prints, the install is good. Head to the [Quickstart](./quickstart).
