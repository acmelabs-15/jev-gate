#!/usr/bin/env bun
// Claude Code PreToolUse hook that asks Jev whether a tool call looks risky.
//
// Shadow mode (default): never affects the tool call. Prints nothing, exits 0,
// and appends one JSONL record per call so you can pick a threshold later.
//
// Enforce mode (JEV_GATE_MODE=enforce): when any blocking signal reaches the
// threshold, returns permissionDecision "ask" (default) or "deny"
// (JEV_GATE_ON_FLAG=deny, for headless runs where "ask" would stall).
//
// Every failure path (no key, timeout, HTTP error, bad JSON) fails open.

import {
  type HookInput,
  type LogRecord,
  buildQuestions,
  callJev,
  config,
  flaggedSignals,
  lastUserRequest,
  summarize,
  toScores,
  truncateDeep,
  writeLog,
} from "./lib";

const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);

let input: HookInput;
try {
  input = JSON.parse(await Bun.stdin.text());
} catch {
  process.exit(0); // not something we understand; stay out of the way
}

const tool = input.tool_name ?? "unknown";
const base: Omit<LogRecord, "status" | "latency_ms" | "request_kind"> = {
  ts: new Date().toISOString(),
  session_id: input.session_id,
  cwd: input.cwd,
  tool,
  summary: summarize(tool, input.tool_input),
  mode: config.mode,
  model: config.model,
  threshold: config.threshold,
};

if (!config.apiKey && config.baseUrl.includes("typesafe.ai")) {
  await writeLog({ ...base, status: "skipped", error: "no JEV_API_KEY", latency_ms: elapsed(), request_kind: "none" });
  process.exit(0);
}

const request = await lastUserRequest(input.transcript_path);
const requestKind = request?.kind ?? "none";
const questions = buildQuestions(Boolean(request));
const state = truncateDeep({
  tool_name: tool,
  tool_input: input.tool_input ?? {},
  cwd: input.cwd,
  ...(request ? { user_request: request.text } : {}),
});

try {
  const answers = await callJev(state, questions);
  const scores = toScores(answers, questions);
  const flagged = flaggedSignals(scores, config.threshold);
  const wouldAct = flagged.length > 0;
  const acted = wouldAct && config.mode === "enforce" ? config.onFlag : undefined;

  await writeLog({
    ...base,
    status: "ok",
    latency_ms: elapsed(),
    request_kind: requestKind,
    scores,
    risk_confidence: answers.risk?.confidence,
    flagged,
    would_act: wouldAct,
    ...(acted ? { acted } : {}),
  });

  if (acted) {
    const detail = flagged.map((s) => `${s} ${(scores[s] ?? 0).toFixed(2)}`).join(", ");
    const reason =
      acted === "deny"
        ? `Jev flagged this call as risky (${detail}; threshold ${config.threshold}). Choose a safer approach or explain why this step is needed.`
        : `Jev flagged this call (${detail}; threshold ${config.threshold}).`;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: acted,
          permissionDecisionReason: reason,
        },
      }),
    );
  }
} catch (err) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  await writeLog({ ...base, status: "error", error: message, latency_ms: elapsed(), request_kind: requestKind });
}

process.exit(0);
