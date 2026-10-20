/**
 * One JSONL line per gated call. The report reads these lines; nothing else does.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { Mode, OnFlag } from "./config";
import type { Scores } from "./jev";
import type { BlockingSignal } from "./questions";
import type { RequestKind } from "./state";

export type LogRecord = {
  ts: string;
  session_id?: string;
  cwd?: string;
  tool: string;
  summary: string;
  mode: Mode;
  model: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  latency_ms: number;
  request_kind: RequestKind;
  scores?: Scores;
  risk_confidence?: number;
  threshold: number;
  flagged?: BlockingSignal[];
  would_act?: boolean;
  acted?: OnFlag;
};

/** Appends one record. A failure to write is swallowed: logging never breaks a tool call. */
export async function writeLog(logPath: string, record: LogRecord): Promise<void> {
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(record)}\n`);
  } catch {
    // The gate fails open, the log included.
  }
}
