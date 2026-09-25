# Examples

Three small programs, one for each job the [README](../README.md) describes. Each imports
`@cosyte/dates` by its package name, which Node resolves through this package's own `exports` map to
the built `dist/`, prints what it did, checks its own output, and exits non-zero on a mismatch. Every
value in them is synthetic.

```bash
pnpm install
pnpm build
pnpm examples                          # run all three
pnpm tsx examples/validate-parts.ts    # or one
```

| Example                                              | What it shows                                                                                        | Calls                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`validate-parts.ts`](./validate-parts.ts)           | Every fault in a value reported at once; a date that does not exist refused, never rolled over.      | `validateParts`, `isValidParts`, `assertValidParts` |
| [`render-at-precision.ts`](./render-at-precision.ts) | A year stays a year: ISO 8601 and Temporal types at the precision the value arrived with.            | `toISO`, `precisionOf`, `toTemporal`                |
| [`instants-and-zones.ts`](./instants-and-zones.ts)   | An instant only when the zone is known; a daylight-saving repeat refused until the offset is stated. | `toInstant`, `toZonedDateTime`                      |

`pnpm examples` runs `scripts/run-examples.ts`, which fails if any example exits non-zero or stops
before printing its final `<name>: ok` line. CI runs it on every pull request, after the build.
