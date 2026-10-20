import { describe, expect, test } from "bun:test";
import path from "node:path";

import { HOSTED_BASE_URL, KEY_OPTION, missingKey, readConfig } from "../config";

const ROOT = path.join(import.meta.dir, "..", "..", "..");

describe("the API key", () => {
  test("the key from /plugin configure wins over settings.json env", () => {
    const config = readConfig({
      CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "from-dialog",
      JEV_API_KEY: "env",
    });
    expect(config.apiKey).toBe("from-dialog");
  });

  test("an empty dialog value falls back to JEV_API_KEY, then TYPESAFE_API_KEY", () => {
    expect(readConfig({ CLAUDE_PLUGIN_OPTION_JEV_API_KEY: "", JEV_API_KEY: "env" }).apiKey).toBe(
      "env",
    );
    expect(readConfig({ JEV_API_KEY: "", TYPESAFE_API_KEY: "ts" }).apiKey).toBe("ts");
  });

  test("plugin.json declares the option the config reads, masked", async () => {
    const manifest = await Bun.file(path.join(ROOT, ".claude-plugin", "plugin.json")).json();
    const option = manifest.userConfig?.[KEY_OPTION];
    expect(option).toMatchObject({ type: "string", sensitive: true });
    expect(option.required).not.toBe(true);
    expect(`CLAUDE_PLUGIN_OPTION_${KEY_OPTION.toUpperCase()}`).toBe(
      "CLAUDE_PLUGIN_OPTION_JEV_API_KEY",
    );
  });
});

describe("readConfig", () => {
  test("defaults keep the gate in shadow mode against the hosted API", () => {
    expect(readConfig({ HOME: "/home/p" })).toEqual({
      apiKey: "",
      baseUrl: HOSTED_BASE_URL,
      model: "jev-latest",
      mode: "shadow",
      onFlag: "ask",
      threshold: 0.9,
      timeoutMs: 1500,
      logPath: "/home/p/.claude/jev-gate/log.jsonl",
      maxField: 4000,
    });
  });

  test("reads every override and trims a trailing slash from the base URL", () => {
    const config = readConfig({
      TYPESAFE_API_KEY: "k",
      JEV_BASE_URL: "http://localhost:8000/",
      JEV_GATE_MODE: "enforce",
      JEV_GATE_ON_FLAG: "deny",
      JEV_GATE_THRESHOLD: "0.8",
      JEV_GATE_LOG: "/tmp/x.jsonl",
    });
    expect(config).toMatchObject({
      apiKey: "k",
      baseUrl: "http://localhost:8000",
      mode: "enforce",
      onFlag: "deny",
      threshold: 0.8,
      logPath: "/tmp/x.jsonl",
    });
  });

  test("an unknown mode or a bad number falls back to the safe default", () => {
    const config = readConfig({ JEV_GATE_MODE: "block", JEV_GATE_THRESHOLD: "high" });
    expect(config.mode).toBe("shadow");
    expect(config.threshold).toBe(0.9);
  });
});

describe("missingKey", () => {
  test("only the hosted API needs a key", () => {
    expect(missingKey(readConfig({}))).toBe(true);
    expect(missingKey(readConfig({ JEV_API_KEY: "k" }))).toBe(false);
    expect(missingKey(readConfig({ JEV_BASE_URL: "http://localhost:8000" }))).toBe(false);
  });
});
