// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json","./tsconfig.frontend.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // node:test's `test(name, fn)` intentionally returns a promise the file
    // doesn't await — the test runner owns that promise. And test doubles
    // implementing an async interface (e.g. a fake ToolDefinition.execute)
    // legitimately have no internal await. Both are normal for this file
    // type, not the bugs these rules exist to catch in application code.
    files: ["packages/core/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
