import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { lastUserRequest, lastUserText, normalizeRequest, summarize, truncateDeep } from "../state";

describe("truncateDeep", () => {
  test("cuts long strings at any depth and says how much was cut", () => {
    const out = truncateDeep({ a: "x".repeat(20), b: [{ c: "y".repeat(20) }] }, 5) as {
      a: string;
      b: { c: string }[];
    };
    expect(out.a).toBe("xxxxx…[+15 chars]");
    expect(out.b[0]?.c).toBe("yyyyy…[+15 chars]");
  });

  test("leaves short values and non-strings alone", () => {
    expect(truncateDeep({ a: "short", b: [1, true, null] }, 10)).toEqual({
      a: "short",
      b: [1, true, null],
    });
  });
});

describe("summarize", () => {
  test("picks the field that names the call", () => {
    expect(summarize("Bash", { command: "ls   -la\n" })).toBe("ls -la");
    expect(summarize("Edit", { file_path: "/a/b.ts", old_string: "x" })).toBe("/a/b.ts");
    expect(summarize("NotebookEdit", { notebook_path: "/n.ipynb" })).toBe("/n.ipynb");
    expect(summarize("WebFetch", { url: "https://x.dev" })).toBe("https://x.dev");
    expect(summarize("mcp__x__y", { q: 1 })).toBe('{"q":1}');
  });

  test("cuts at 300 characters", () => {
    expect(summarize("Bash", { command: "a".repeat(400) })).toHaveLength(301);
  });
});

describe("normalizeRequest", () => {
  test("typed text is a prompt", () => {
    expect(normalizeRequest("fix the bug")).toEqual({ text: "fix the bug", kind: "prompt" });
  });

  test("a slash command keeps its arguments", () => {
    expect(
      normalizeRequest("<command-name>/plan</command-name><command-args>retries</command-args>"),
    ).toEqual({ text: "/plan retries", kind: "command" });
  });

  test("a command name without a slash gets one", () => {
    expect(normalizeRequest("<command-name>ship</command-name>")).toEqual({
      text: "/ship",
      kind: "command",
    });
  });
});

function line(entry: unknown): string {
  return JSON.stringify(entry);
}

describe("lastUserText", () => {
  test("returns the last typed user text, skipping tool results and meta entries", () => {
    const jsonl = [
      line({ type: "user", message: { content: "first" } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }),
      line({ type: "user", message: { content: [{ type: "text", text: "second" }] } }),
      line({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } }),
      line({ type: "user", isMeta: true, message: { content: "skill body" } }),
    ].join("\n");
    expect(lastUserText(jsonl)).toBe("second");
  });

  test("skips a line cut in half at the start of the tail", () => {
    const jsonl = `ser","message":{"content":"half"}}\n${line({ type: "user", message: { content: "whole" } })}`;
    expect(lastUserText(jsonl)).toBe("whole");
  });

  test("returns undefined when there is no user text", () => {
    expect(lastUserText("")).toBeUndefined();
  });
});

describe("lastUserRequest", () => {
  test("reads and normalizes the file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "jev-gate-state-"));
    const file = path.join(dir, "t.jsonl");
    await writeFile(
      file,
      `${JSON.stringify({ type: "user", message: { content: "<command-name>/build</command-name>" } })}\n`,
    );
    expect(await lastUserRequest(file)).toEqual({ text: "/build", kind: "command" });
  });

  test("a missing or empty path gives undefined", async () => {
    expect(await lastUserRequest()).toBeUndefined();
    expect(await lastUserRequest("")).toBeUndefined();
    expect(await lastUserRequest("/nope/missing.jsonl")).toBeUndefined();
  });
});
