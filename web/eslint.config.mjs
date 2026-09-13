import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Lint-to-zero campaign (soma#958, 2026-09-13). These rules had a backlog when the gate went
    // in, so they report as warnings and CI caps the warning count (`--max-warnings` in
    // web-ci.yml); each campaign PR fixes a group, lowers the cap, and turns its rule back into
    // an error here. Nothing new may join this list.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // 506
      "@typescript-eslint/no-unused-vars": [
        "warn", // 119; the underscore prefix marks an intentionally unused binding
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@next/next/no-img-element": "warn", // 11
      "react-hooks/set-state-in-effect": "warn", // 11
      "react-hooks/static-components": "warn", // 11
      "react-hooks/purity": "warn", // 8
      "jsx-a11y/alt-text": "warn", // 8
      "prefer-const": "warn", // 7
      "react-hooks/refs": "warn", // 2
      "react/no-unescaped-entities": "warn", // 2
      "react-hooks/rules-of-hooks": "warn", // 2, trajectory-chart.tsx; first in the campaign
      "@typescript-eslint/no-unused-expressions": "warn", // 1
      "react-hooks/preserve-manual-memoization": "warn", // 1
    },
  },
]);

export default eslintConfig;
