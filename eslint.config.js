import cosyte from "@cosyte/eslint-config";

// The shared Cosyte lint bar (@cosyte/eslint-config). Two additions, both local to this repo:
//
// - `.cosyte-release-tooling/` is a checkout of cosyte/.github that the shared release workflow
//   makes inside this working tree before it runs `pnpm lint`. It is not this repository's code,
//   and linting it once failed a release run on main.
// - The programs under `examples/` are linted with the same type-checked rules as `src/`, but they
//   are programs that print their results rather than library code, so `console` and the JSDoc
//   gate are off for them.
export default [
  ...cosyte(import.meta.dirname, {
    ignores: [".tmp/**", "dist-artifacts/**", ".cosyte-release-tooling/**"],
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts", "examples/**/*.ts", "*.config.ts"],
  }),
  {
    files: ["examples/**/*.ts"],
    rules: {
      "no-console": "off",
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-example": "off",
    },
  },
];
