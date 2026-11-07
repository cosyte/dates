---
"@cosyte/dates": patch
---

The type declarations now carry a usage example for every exported function and error class, so an editor shows one on hover.

Runtime behavior is unchanged. The repository's build, lint, format, type-check and test setup moved to the shared Cosyte configs, which add a 90% coverage gate, and CI now runs on Node 22 and Node 24.
