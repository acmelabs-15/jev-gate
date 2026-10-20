/**
 * Write package.json's version into every host manifest.
 *
 *   bun run version:sync            write
 *   bun run version:sync -- --check exit 1 if any manifest disagrees
 */

export type Manifest = { path: string; field: string };

export const manifests: readonly Manifest[] = [
  { path: ".claude-plugin/plugin.json", field: "version" },
  { path: ".claude-plugin/marketplace.json", field: "plugins.0.version" },
];

type Json = Record<string, unknown> | unknown[];

function getField(doc: Json, field: string): unknown {
  let node: unknown = doc;
  for (const key of field.split(".")) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function setField(doc: Json, field: string, value: string): void {
  const keys = field.split(".");
  const last = keys.pop();
  let node: unknown = doc;
  for (const key of keys) {
    node = (node as Record<string, unknown>)[key];
  }
  (node as Record<string, unknown>)[last as string] = value;
}

/** Returns the manifests whose version differed from package.json. Writes them unless `check`. */
export async function syncVersions(root: string, check: boolean): Promise<string[]> {
  const pkg = (await Bun.file(`${root}/package.json`).json()) as { version?: string };
  if (typeof pkg.version !== "string") {
    throw new TypeError("package.json has no version field");
  }
  const drifted: string[] = [];
  for (const manifest of manifests) {
    const file = Bun.file(`${root}/${manifest.path}`);
    const doc = (await file.json()) as Json;
    const current = getField(doc, manifest.field);
    if (typeof current !== "string") {
      throw new TypeError(`${manifest.path} has no ${manifest.field} field`);
    }
    if (current === pkg.version) {
      continue;
    }
    drifted.push(manifest.path);
    if (!check) {
      setField(doc, manifest.field, pkg.version);
      await Bun.write(file, `${JSON.stringify(doc, null, 2)}\n`);
    }
  }
  return drifted;
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const drifted = await syncVersions(process.cwd(), check);
  for (const path of drifted) {
    console.log(`${check ? "drift  " : "written"} ${path}`);
  }
  if (check && drifted.length > 0) {
    console.log(`${drifted.length} manifest(s) disagree with package.json`);
    process.exit(1);
  }
  if (drifted.length === 0) {
    console.log("every manifest matches package.json");
  }
}
