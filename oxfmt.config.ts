// Format: Ultracite's Oxfmt preset with the same two deviations as brain, so the ACMElabs repos
// share one style:
//   printWidth 100, not 80: the gate's question text and log paths are long strings.
//   trailingComma "all", not "es5": one convention across ACMElabs repos.
import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  printWidth: 100,
  trailingComma: "all",
});
