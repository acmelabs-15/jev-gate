// Lint: Ultracite's Oxlint core preset, extended by hand, as in brain. The TypeScript compiler
// check stays a separate step, `bun run typecheck`. Every relaxation below states its reason.
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [...core.ignorePatterns],
  rules: {
    // Function declarations, not arrow constants, with helpers above their callers:
    // Ultracite's no-use-before-define requires that order.
    "func-style": "off",
    // Object keys are ordered by meaning: the log record's fields, a question's type before its text.
    "sort-keys": "off",
    // Kept from brain with the same reason: version:sync writes the manifests in order, and
    // validate runs one validator at a time so their output does not interleave.
    "no-await-in-loop": "off",
    // The spec's code style uses `type` for object shapes.
    "typescript/consistent-type-definitions": ["error", "type"],
  },
});
