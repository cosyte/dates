import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.tmp/**'],
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
