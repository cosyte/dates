import { readFileSync } from "node:fs";
import path from "node:path";

import { packageRoot } from "./paths.js";

/**
 * The runtime the suite runs on. CI runs it on Node.js, on Linux, Windows and macOS, and again
 * under Bun and under Deno, each in a job of its own.
 */
export const ON_DENO = "Deno" in globalThis;

/**
 * Whether the suite can read the built package (`dist/index.js`). Not under Deno: `dist/` is built
 * by `cosyte-process build` (tsup and esbuild, Node tooling), and the deno job runs the suite with
 * no Node on PATH and no build before it. The cases that read the build (the README program, the
 * no-output contract, the docs samples, two processes under two host zones) run on Node and Bun.
 */
export const READS_BUILD = !ON_DENO;

/**
 * The script a package's command runs, from its `bin` field, so a test can run it with the
 * runtime running the suite (`process.execPath`) rather than through `node_modules/.bin`, whose
 * shims are shell scripts on Linux and macOS and `.cmd` files on Windows.
 *
 * @param name The package that ships the command.
 * @param command The command, a key of its `bin` field.
 * @returns The absolute path of the script.
 */
export function binScript(name: string, command: string): string {
  const directory = path.join(packageRoot, "node_modules", ...name.split("/"));
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
    readonly bin?: string | Readonly<Record<string, string>>;
  };
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[command];
  if (bin === undefined) throw new Error(`${name} has no command named ${command}`);
  return path.join(directory, bin);
}
