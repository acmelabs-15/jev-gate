#!/usr/bin/env bun
/**
 * Claude Code SessionStart hook. When the gate has no TypeSafe API key, it tells the user in one
 * line and gives the agent the context it needs to help: the setup skill, and the rule that the
 * key never goes through the chat. With a key, or with a local server that needs none, it prints
 * nothing.
 *
 * It reads no input and makes no network call, so it adds nothing to session start when the key
 * is set. Any error exits 0 with no output.
 */

import type { Config } from "./config";
import { missingKey, readConfig } from "./config";

/** The skill an installed user's agent loads to explain Jev and walk through the key. */
export const SETUP_SKILL = "jev-gate:setup";

export type SessionStartOutput = {
  systemMessage: string;
  hookSpecificOutput: { hookEventName: "SessionStart"; additionalContext: string };
};

const USER_LINE =
  "jev-gate has no TypeSafe API key, so it is not checking tool calls. Add one with /plugin configure jev-gate@acmelabs, or ask Claude how to set up jev-gate.";

const AGENT_CONTEXT = [
  "The jev-gate plugin is installed but has no TypeSafe API key, so its PreToolUse gate skips every tool call.",
  `When the user asks about jev-gate, Jev, TypeSafe, or this message, load the ${SETUP_SKILL} skill and follow it.`,
  "Never ask the user to paste the key into the chat, and never write the key into a file yourself.",
].join(" ");

/** The hook's output, or undefined when the gate has what it needs. */
export function sessionStartOutput(config: Config): SessionStartOutput | undefined {
  if (!missingKey(config)) {
    return undefined;
  }
  return {
    systemMessage: USER_LINE,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: AGENT_CONTEXT },
  };
}

if (import.meta.main) {
  try {
    const output = sessionStartOutput(readConfig());
    if (output) {
      process.stdout.write(JSON.stringify(output));
    }
  } catch {
    // A reminder is never worth a broken session start.
  }
  process.exit(0);
}
