// hooks/hooks.json as Cursor reads it. For an imported Claude Code plugin hook, Cursor runs only
// the `command` string and drops `args`, so each command names its own script.

import { describe, expect, test } from "bun:test";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "..", "..", "..");

/** Claude Code's placeholder, written as-is in hooks.json. Cursor replaces it in the command too. */
const PLUGIN_ROOT = `\${CLAUDE_PLUGIN_ROOT}`;

/** `bun`, then one script path in double quotes, so a plugin root with spaces stays one argument. */
const COMMAND = /^bun "(?<script>[^"]+)"$/u;

type Hook = { type: string; command?: string; args?: unknown };
type Registration = { hooks: Record<string, { hooks: Hook[] }[]> };

async function commandHooks(file: string): Promise<{ event: string; hook: Hook }[]> {
  const { hooks }: Registration = await Bun.file(path.join(ROOT, file)).json();
  return Object.entries(hooks).flatMap(([event, entries]) =>
    entries.flatMap((entry) =>
      entry.hooks.filter((hook) => hook.type === "command").map((hook) => ({ event, hook })),
    ),
  );
}

const registered = await commandHooks(path.join("hooks", "hooks.json"));

describe("hooks.json", () => {
  test("registers a command hook for each event", () => {
    expect(registered.map(({ event }) => event).toSorted()).toEqual(["PreToolUse", "SessionStart"]);
  });

  for (const { event, hook } of registered) {
    test(`${event}: the command names a script that exists, with no args`, async () => {
      expect(hook.args).toBeUndefined();
      expect(hook.command).toMatch(COMMAND);
      const script = COMMAND.exec(hook.command ?? "")?.groups?.script ?? "";
      expect(script).toStartWith(`${PLUGIN_ROOT}/`);
      expect(await Bun.file(script.replace(PLUGIN_ROOT, ROOT)).exists()).toBe(true);
    });
  }
});

describe("settings.example.json", () => {
  test("wires the hook the same way, with no args", async () => {
    const [entry] = await commandHooks("settings.example.json");
    expect(entry?.hook.args).toBeUndefined();
    expect(entry?.hook.command).toMatch(COMMAND);
  });
});
