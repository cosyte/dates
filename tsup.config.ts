import { cosyteTsup } from "@cosyte/tsup-config";
import type { defineConfig } from "tsup";

// The shared Cosyte build (@cosyte/tsup-config), narrowed to what this package ships: ESM only, as
// `dist/index.js` beside `dist/index.d.ts`, for the Node 22 floor `engines` declares. The type is
// named here because `tsconfig.json` checks declaration emit, and the inferred one is not portable.
const config: ReturnType<typeof defineConfig> = cosyteTsup({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outExtension: () => ({ js: ".js" }),
  // The one runtime dependency stays external. Bundling it would put a second
  // copy of Temporal in every consumer that already has one, and two Temporal
  // implementations do not share instanceof.
  external: ["temporal-polyfill"],
});

export default config;
