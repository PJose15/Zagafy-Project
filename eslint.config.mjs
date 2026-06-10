import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Phase 1.7 stricter rules — promote a few rules to errors so they can't
// silently re-enter the codebase. The @typescript-eslint plugin is already
// loaded by eslint-config-next; we register it again here so our overrides
// resolve in this config object. Tests are exempt from the floating-promise
// rule because `expect(...).resolves` patterns are intentional.
//
// Phase 6.2 — eslint-plugin-security for SAST. Catches eval(), non-literal
// RegExp, child_process usage, prototype pollution patterns, etc.
export default defineConfig([
  {
    extends: [...next],
  },
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      security,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/exhaustive-deps": "error",
      // Security rules — errors for high-risk patterns
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-child-process": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-object-injection": "off", // too noisy for bracket access
      "security/detect-unsafe-regex": "error",
    },
  },
  {
    // Tests use `any` extensively for mock typing where a real type would be
    // unwieldy. Disable the rule there so source code stays clean without
    // forcing a 144-site refactor across the test suite.
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
