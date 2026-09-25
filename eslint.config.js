import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `.cosyte-release-tooling/` is a checkout of cosyte/.github that the shared release workflow
    // makes inside this working tree before it runs `pnpm lint`. It is not this repository's code.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.tmp/**',
      'dist-artifacts/**',
      '.cosyte-release-tooling/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Load-bearing, not style. This package handles PHI-bearing values and
      // promises to write nothing to stdout or stderr, so a stray console call
      // is a data-leak defect. test/package-contract.test.ts proves the runtime
      // behaviour; this rule stops the regression at the point it is typed.
      'no-console': 'error',
    },
  },
  {
    files: ['test/**/*.ts', '*.ts', '*.js'],
    rules: {
      'no-console': 'off',
    },
  },
);
