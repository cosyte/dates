import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // The one runtime dependency stays external. Bundling it would put a second
  // copy of Temporal in every consumer that already has one, and two Temporal
  // implementations do not share instanceof.
  external: ['temporal-polyfill'],
});
