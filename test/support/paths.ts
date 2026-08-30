import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package root, resolved from this file rather than from the working directory. */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The built ESM entry point. Present because `test/global-setup.ts` builds first. */
export const distEntry = path.join(packageRoot, 'dist', 'index.js');

/**
 * Scratch space for generated child-process scripts.
 *
 * It lives INSIDE the package so a generated script can `import '@cosyte/dates'`
 * by name: Node resolves a package self-reference from the importing file's
 * location and the `exports` map, which points at the built entry. That is what
 * makes "run this against the built package" literally true.
 */
export const scratchDir = path.join(packageRoot, '.tmp');
