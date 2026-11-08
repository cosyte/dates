# AGENTS.md

`@cosyte/dates` validates and converts the date parts the `@cosyte/*` healthcare parsers return,
without adding precision or guessing a zone. It is TypeScript, ESM only, published to npm under MIT,
and supports Node.js 22 or later (tested on 22, 24, and 26). Code is in `src/`, tests in `test/`,
runnable programs in `examples/`, and the docs.cosyte.com pages in `docs-content/`.

## Build and test

Use the pnpm version that `packageManager` in `package.json` pins: run
`corepack enable pnpm --install-directory <dir>` and put `<dir>` first on `PATH`.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run test
```

## The gate

A pull request is ready when these pass, in this order. CI runs the same steps on Node 22, 24,
and 26.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run attw
pnpm run examples
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run phi-scan
pnpm run test
pnpm run test:coverage
pnpm run test:tz
pnpm check:no-emdash
pnpm check:readme && pnpm check:claude-card && pnpm check:catalog
pnpm check:no-internal-refs
```

A change under `src/` adds a changeset (`pnpm changeset`).

## Data

Synthetic data only. Dates of birth and clinical timestamps are patient data: never put a real
patient's data in a test, a fixture, an example, an issue, or a log.

## Contributing

See [CONTRIBUTING.md](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md).
