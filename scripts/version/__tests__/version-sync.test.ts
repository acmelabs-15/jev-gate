import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { manifests, syncVersions } from "../version-sync";

let work: string;

async function fixture(
  name: string,
  version: string,
  drift?: Record<string, string>,
): Promise<string> {
  const root = `${work}/${name}`;
  await mkdir(root, { recursive: true });
  await Bun.write(
    `${root}/package.json`,
    `${JSON.stringify({ name: "jev-gate", version }, null, 2)}\n`,
  );
  const bodies: Record<string, unknown> = {
    ".claude-plugin/plugin.json": { name: "jev-gate", version: "0.0.1" },
    ".claude-plugin/marketplace.json": {
      name: "jev-gate",
      plugins: [{ name: "jev-gate", version: "0.0.1", source: "./" }],
    },
  };
  for (const [path, body] of Object.entries(bodies)) {
    await mkdir(`${root}/${path}`.replace(/\/[^/]+$/u, ""), { recursive: true });
    const text = drift?.[path] ?? `${JSON.stringify(body, null, 2)}\n`;
    await Bun.write(`${root}/${path}`, text);
  }
  return root;
}

beforeAll(async () => {
  work = await mkdtemp(`${tmpdir()}/jev-gate-version-`);
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

describe("syncVersions", () => {
  test("names the two versioned manifests", () => {
    expect(manifests.map((m) => m.path)).toEqual([
      ".claude-plugin/plugin.json",
      ".claude-plugin/marketplace.json",
    ]);
  });

  test("writes package.json's version into every manifest, nested or not", async () => {
    const root = await fixture("write", "1.2.3");
    const drifted = await syncVersions(root, false);
    expect(drifted.toSorted()).toEqual(manifests.map((m) => m.path).toSorted());
    const plugin = await Bun.file(`${root}/.claude-plugin/plugin.json`).json();
    const market = await Bun.file(`${root}/.claude-plugin/marketplace.json`).json();
    expect(plugin.version).toBe("1.2.3");
    expect(market.plugins[0].version).toBe("1.2.3");
  });

  test("check mode lists the drifted files and writes nothing", async () => {
    const root = await fixture("check", "1.2.3");
    const before = await Bun.file(`${root}/.claude-plugin/plugin.json`).text();
    const drifted = await syncVersions(root, true);
    expect(drifted).toHaveLength(2);
    expect(await Bun.file(`${root}/.claude-plugin/plugin.json`).text()).toBe(before);
  });

  test("check mode passes on a synced tree, and a second write is byte-identical", async () => {
    const root = await fixture("stable", "1.2.3");
    await syncVersions(root, false);
    const first = await Bun.file(`${root}/.claude-plugin/plugin.json`).text();
    expect(await syncVersions(root, true)).toEqual([]);
    await syncVersions(root, false);
    expect(await Bun.file(`${root}/.claude-plugin/plugin.json`).text()).toBe(first);
    expect(first.endsWith("\n")).toBe(true);
  });

  test("a manifest without the version field is an error naming it", async () => {
    const root = await fixture("missing", "1.2.3", {
      ".claude-plugin/plugin.json": `${JSON.stringify({ name: "jev-gate" })}\n`,
    });
    await expect(syncVersions(root, false)).rejects.toThrow(
      ".claude-plugin/plugin.json has no version field",
    );
  });

  test("a marketplace with no plugins entry is an error naming it", async () => {
    const root = await fixture("noplugins", "1.2.3", {
      ".claude-plugin/marketplace.json": `${JSON.stringify({ name: "jev-gate" })}\n`,
    });
    await expect(syncVersions(root, false)).rejects.toThrow(
      ".claude-plugin/marketplace.json has no plugins.0.version field",
    );
  });
});
