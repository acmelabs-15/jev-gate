import { describe, expect, test } from "bun:test";
import path from "node:path";

import { readConfig } from "../config";
import { SETUP_SKILL, sessionStartOutput } from "../session-start";

const ROOT = path.join(import.meta.dir, "..", "..", "..");
const SCRIPT = path.join(import.meta.dir, "..", "session-start.ts");

/** Claude Code's placeholder, written as-is in hooks.json and SKILL.md. */
const PLUGIN_ROOT = `\${CLAUDE_PLUGIN_ROOT}`;

describe("sessionStartOutput", () => {
  test("no key: one line for the user and context for the agent", () => {
    const out = sessionStartOutput(readConfig({}));
    expect(out?.systemMessage).toContain("no TypeSafe API key");
    expect(out?.systemMessage).toContain("/plugin configure jev-gate@acmelabs");
    expect(out?.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out?.hookSpecificOutput.additionalContext).toContain(SETUP_SKILL);
    expect(out?.hookSpecificOutput.additionalContext).toContain("Never ask the user to paste");
  });

  test("a key from either place: nothing", () => {
    expect(sessionStartOutput(readConfig({ JEV_API_KEY: "k" }))).toBeUndefined();
    expect(
      sessionStartOutput(readConfig({ CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "k" })),
    ).toBeUndefined();
  });

  test("a local server needs no key: nothing", () => {
    expect(
      sessionStartOutput(readConfig({ JEV_BASE_URL: "http://localhost:8000" })),
    ).toBeUndefined();
  });
});

describe("the hook", () => {
  test("prints JSON and exits 0 without a key", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT], {
      stdin: new Blob([JSON.stringify({ hook_event_name: "SessionStart", source: "startup" })]),
      env: { PATH: process.env.PATH ?? "", HOME: "/tmp" },
    });
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(proc.stdout.toString()).hookSpecificOutput.hookEventName).toBe(
      "SessionStart",
    );
  });

  test("prints nothing with a key", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT], {
      stdin: new Blob(["{}"]),
      env: { PATH: process.env.PATH ?? "", HOME: "/tmp", CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "k" },
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toBe("");
  });

  test("hooks.json registers it on startup only", async () => {
    const hooks = await Bun.file(path.join(ROOT, "hooks", "hooks.json")).json();
    const [entry] = hooks.hooks.SessionStart;
    expect(entry.matcher).toBe("startup");
    expect(entry.hooks[0].command).toBe(`bun "${PLUGIN_ROOT}/scripts/gate/session-start.ts"`);
  });
});

describe("the setup skill", () => {
  const skillPath = path.join(ROOT, "skills", "setup", "SKILL.md");

  test("exists where the plugin's skill name expects it", async () => {
    expect(SETUP_SKILL).toBe("jev-gate:setup");
    expect(await Bun.file(skillPath).exists()).toBe(true);
  });

  test("names both places the key can go, and never takes it in chat", async () => {
    const skill = await Bun.file(skillPath).text();
    expect(skill).toMatch(/^---\nname: setup\ndescription: /u);
    expect(skill).toContain("console.typesafe.ai");
    expect(skill).toContain("/plugin configure jev-gate@acmelabs");
    expect(skill).toContain("JEV_API_KEY");
    expect(skill).toContain("~/.claude/settings.json");
    expect(skill).toContain("Never ask the user to paste the key into the chat");
    expect(skill).toContain(`${PLUGIN_ROOT}/scripts/report/report.ts`);
  });
});
