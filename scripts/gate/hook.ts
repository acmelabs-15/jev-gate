#!/usr/bin/env bun
/**
 * Claude Code PreToolUse hook: asks Jev whether a tool call looks risky.
 *
 * Shadow mode (the default) never changes the tool call. It prints nothing, exits 0, and appends
 * one log line, so a threshold can be chosen later from real data.
 *
 * Enforce mode (`JEV_GATE_MODE=enforce`) answers a flagged call with permissionDecision `ask`, or
 * `deny` with `JEV_GATE_ON_FLAG=deny` for headless runs.
 *
 * Every failure (no key, timeout, HTTP error, bad response) fails open: the call goes through the
 * normal permission flow and the failure is logged.
 */

import type { Config, OnFlag } from "./config";
import { missingKey, readConfig } from "./config";
import type { Scores } from "./jev";
import { callJev, flaggedSignals, toScores } from "./jev";
import type { LogRecord } from "./log";
import { writeLog } from "./log";
import type { BlockingSignal } from "./questions";
import { buildQuestions } from "./questions";
import type { HookInput } from "./state";
import { lastUserRequest, summarize, truncateDeep } from "./state";

export type HookOutput = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: OnFlag;
    permissionDecisionReason: string;
  };
};

/** The hook's stdout for a flagged call in enforce mode. */
export function decisionOutput(
  config: Config,
  flagged: BlockingSignal[],
  scores: Scores,
): HookOutput {
  const detail = flagged
    .map((signal) => `${signal} ${(scores[signal] ?? 0).toFixed(2)}`)
    .join(", ");
  const facts = `${detail}; threshold ${config.threshold}`;
  const reason =
    config.onFlag === "deny"
      ? `Jev flagged this call as risky (${facts}). Choose a safer approach or explain why this step is needed.`
      : `Jev flagged this call (${facts}).`;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: config.onFlag,
      permissionDecisionReason: reason,
    },
  };
}

function parseInput(raw: string): HookInput | undefined {
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs the gate for one hook input. Returns what to print on stdout, or "" for nothing. */
export async function runGate(raw: string, config: Config): Promise<string> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  const input = parseInput(raw);
  if (input === undefined) {
    return "";
  }

  const tool = input.tool_name ?? "unknown";
  const base = {
    ts: new Date().toISOString(),
    session_id: input.session_id,
    cwd: input.cwd,
    tool,
    summary: summarize(tool, input.tool_input),
    mode: config.mode,
    model: config.model,
    threshold: config.threshold,
  } satisfies Partial<LogRecord>;

  if (missingKey(config)) {
    await writeLog(config.logPath, {
      ...base,
      status: "skipped",
      error: "no JEV_API_KEY",
      latency_ms: elapsed(),
      request_kind: "none",
    });
    return "";
  }

  const request = await lastUserRequest(input.transcript_path);
  const requestKind = request?.kind ?? "none";
  const questions = buildQuestions(request !== undefined);
  const state = truncateDeep(
    {
      tool_name: tool,
      tool_input: input.tool_input ?? {},
      cwd: input.cwd,
      ...(request ? { user_request: request.text } : {}),
    },
    config.maxField,
  );

  try {
    const answers = await callJev(config, state, questions);
    const scores = toScores(answers, questions);
    const flagged = flaggedSignals(scores, config.threshold);
    const acts = flagged.length > 0 && config.mode === "enforce";
    await writeLog(config.logPath, {
      ...base,
      status: "ok",
      latency_ms: elapsed(),
      request_kind: requestKind,
      scores,
      risk_confidence: answers.risk?.confidence,
      flagged,
      would_act: flagged.length > 0,
      ...(acts ? { acted: config.onFlag } : {}),
    });
    return acts ? JSON.stringify(decisionOutput(config, flagged, scores)) : "";
  } catch (error) {
    await writeLog(config.logPath, {
      ...base,
      status: "error",
      error: errorText(error),
      latency_ms: elapsed(),
      request_kind: requestKind,
    });
    return "";
  }
}

if (import.meta.main) {
  const output = await runGate(await Bun.stdin.text(), readConfig());
  if (output) {
    process.stdout.write(output);
  }
  process.exit(0);
}
