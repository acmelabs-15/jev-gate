/**
 * Print the CHANGELOG.md section for one version, for the GitHub release body.
 *
 *   bun run scripts/release/release-notes.ts 0.2.0
 */

/** The text under `## <version>` up to the next `## ` heading, or a one-line fallback. */
export function releaseNotes(changelog: string, version: string): string {
  const escaped = version.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const heading = new RegExp(`^##\\s+v?${escaped}\\s*$`, "u");
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    return `Release ${version}.`;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/u.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body.length > 0 ? body : `Release ${version}.`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const [version] = args;
  if (version === undefined) {
    console.error("usage: release-notes.ts <version>");
    process.exit(2);
  }
  const file = Bun.file(`${import.meta.dir}/../../CHANGELOG.md`);
  const changelog = (await file.exists()) ? await file.text() : "";
  console.log(releaseNotes(changelog, version));
}
