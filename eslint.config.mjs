import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["tests/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Alternate build output, selected with NEXT_DIST_DIR in next.config.ts.
    ".build/**",
    "next-env.d.ts",
    // Vendored agent skill bundles: third-party, not project source. They are
    // mirrored into each assistant's config directory and ship large minified
    // scripts that otherwise flood lint output with unrelated warnings.
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".commandcode/**",
    ".grok/**",
    ".hermes/**",
    ".impeccable/**",
    ".windsurf/**",
    // Generated test output and scratch space.
    ".playwright/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
