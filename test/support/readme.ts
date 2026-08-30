import { readFileSync } from 'node:fs';
import path from 'node:path';

import { packageRoot } from './paths.js';

export const readmePath = path.join(packageRoot, 'README.md');

export function readReadme(): string {
  return readFileSync(readmePath, 'utf8');
}

/** The body of the section under a given `## ` heading, up to the next one. */
export function section(readme: string, heading: string): string {
  const lines = readme.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`README has no "## ${heading}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** The first fenced block of a given language in `text`, trailing newline kept. */
export function fencedBlock(text: string, language: string): string {
  const lines = text.split('\n');
  const open = lines.findIndex((line) => line.trim() === '```' + language);
  if (open === -1) throw new Error(`no \`\`\`${language} block found`);
  const close = lines.indexOf('```', open + 1);
  if (close === -1) throw new Error(`unterminated \`\`\`${language} block`);
  return lines.slice(open + 1, close).join('\n') + '\n';
}

/**
 * The README's REQUIRED one-line description, found structurally rather than by
 * a marker: the first ordinary paragraph after the banner, the title and the
 * tagline, skipping HTML, headings, blockquotes and the badge block.
 */
export function oneLineDescription(readme: string): string {
  const lines = readme.split('\n');
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  if (titleIndex === -1) throw new Error('README has no title heading');

  for (const raw of lines.slice(titleIndex + 1)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('#')) break;
    if (line.startsWith('>')) continue;
    if (line.startsWith('<')) continue;
    if (line.startsWith('<!--')) continue;
    // A badge line is nothing but linked images.
    if (/^(\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*)+$/.test(line)) continue;
    return line;
  }

  throw new Error('README has no one-line description paragraph');
}
