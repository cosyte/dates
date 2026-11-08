---
"@cosyte/dates": patch
---

Built with tsup 9 through the shared `@cosyte/process` toolchain. The runtime code is unchanged; `dist/index.d.ts` now lists the type-only exports in their own `export type {}` statement, which resolves to the same types.
