#!/usr/bin/env bun
/**
 * Reads the gate's log and shows what the gate would have done at several thresholds, so a
 * threshold can be chosen before enforce mode is turned on.
 *
 *   bun run report                      every record in the default log
 *   bun run report -- --since 7d        the last 7 days (also 12h, 30m)
 *   bun run report -- --top 25          more of the highest-scoring calls
 *   bun run report -- --log <path>      another log file
 *   bun run report -- --json            the summary as JSON
 */

import { readConfig } from "../gate/config";
import type { LogRecord } from "../gate/log";
import type { BlockingSignal, Signal } from "../gate/questions";
import { BLOCKING } from "../gate/questions";

export const THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95] as const;

/** The threshold the per-tool table uses. */
const TOOL_THRESHOLD = 0.9;

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** `30m`, `12h` or `7d` as a cutoff time in milliseconds, counted back from `now`. */
export function parseSince(value: string, now: number): number {
  const groups = value.match(/^(?<count>\d+)(?<unit>[mhd])$/u)?.groups;
  if (groups === undefined) {
    throw new Error(`--since expects e.g. 30m, 12h, 7d (got "${value}")`);
  }
  return now - Number(groups.count) * UNIT_MS[groups.unit as keyof typeof UNIT_MS];
}

export type Parsed = { records: LogRecord[]; badLines: number };

/** Reads JSONL. Records from before `request_kind` existed get it from `had_user_request`. */
export function parseLog(text: string, since?: number): Parsed {
  const records: LogRecord[] = [];
  let badLines = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const record = JSON.parse(line) as LogRecord & { had_user_request?: boolean };
      record.request_kind ??= record.had_user_request === true ? "prompt" : "none";
      if (since === undefined || Date.parse(record.ts) >= since) {
        records.push(record);
      }
    } catch {
      badLines += 1;
    }
  }
  return { records, badLines };
}

function score(record: LogRecord, signal: Signal): number {
  return record.scores?.[signal] ?? 0;
}

function maxBlocking(record: LogRecord): number {
  return Math.max(...BLOCKING.map((signal) => score(record, signal)));
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function countAt(records: LogRecord[], hit: (record: LogRecord, t: number) => boolean): number[] {
  return THRESHOLDS.map((t) => records.filter((record) => hit(record, t)).length);
}

export type Summary = {
  records: number;
  ok: number;
  errors: number;
  skipped: number;
  badLines: number;
  latency: { p50: number; p95: number; max: number };
  thresholds: readonly number[];
  flagged: Record<BlockingSignal | "any" | "without_off_task", number[]>;
  offTaskByKind: { kind: "prompt" | "command"; n: number; flagged: number[] }[];
  byTool: { tool: string; n: number; flagged: number }[];
  errorKinds: { kind: string; n: number }[];
  highest: LogRecord[];
};

/** Everything the report prints, as data. */
export function summarize(parsed: Parsed, top: number): Summary {
  const { records } = parsed;
  const ok = records.filter((record) => record.status === "ok" && record.scores !== undefined);
  const errors = records.filter((record) => record.status === "error");
  const latencies = ok.map((record) => record.latency_ms);

  const flagged = {
    any: countAt(ok, (record, t) => maxBlocking(record) >= t),
    without_off_task: countAt(ok, (record, t) =>
      BLOCKING.some((signal) => signal !== "off_task" && score(record, signal) >= t),
    ),
  } as Summary["flagged"];
  for (const signal of BLOCKING) {
    flagged[signal] = countAt(ok, (record, t) => score(record, signal) >= t);
  }

  // A bare slash command (/build, /ship …) gives Jev little to compare against.
  const offTaskByKind = (["prompt", "command"] as const).map((kind) => {
    const rows = ok.filter(
      (record) => record.request_kind === kind && record.scores?.off_task !== undefined,
    );
    return { kind, n: rows.length, flagged: countAt(rows, (r, t) => score(r, "off_task") >= t) };
  });

  const tools = new Map<string, { n: number; flagged: number }>();
  for (const record of ok) {
    const entry = tools.get(record.tool) ?? { n: 0, flagged: 0 };
    entry.n += 1;
    entry.flagged += maxBlocking(record) >= TOOL_THRESHOLD ? 1 : 0;
    tools.set(record.tool, entry);
  }

  const kinds = new Map<string, number>();
  for (const record of errors) {
    const kind = (record.error ?? "unknown").replaceAll(/\d{3,}/gu, "N").slice(0, 60);
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }

  return {
    records: records.length,
    ok: ok.length,
    errors: errors.length,
    skipped: records.filter((record) => record.status === "skipped").length,
    badLines: parsed.badLines,
    latency: {
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
      max: latencies.length > 0 ? Math.max(...latencies) : 0,
    },
    thresholds: THRESHOLDS,
    flagged,
    offTaskByKind,
    byTool: [...tools].map(([tool, entry]) => ({ tool, ...entry })).toSorted((a, b) => b.n - a.n),
    errorKinds: [...kinds].map(([kind, n]) => ({ kind, n })).toSorted((a, b) => b.n - a.n),
    highest: ok.toSorted((a, b) => maxBlocking(b) - maxBlocking(a)).slice(0, top),
  };
}

function percent(n: number, of: number): string {
  return of === 0 ? "-" : `${((100 * n) / of).toFixed(1)}%`;
}

function cells(counts: number[], of: number): string {
  return counts.map((count) => `${count} (${percent(count, of)})`.padStart(15)).join("");
}

function shortSignal(signal: BlockingSignal): string {
  return signal === "exfiltration" ? "exfil" : signal;
}

function headline(summary: Summary, logPath: string, since?: number): string[] {
  const cutoff = since === undefined ? "" : ` (since ${new Date(since).toISOString()})`;
  const failed = `${summary.errors} (${percent(summary.errors, summary.records)})`;
  return [
    `Jev gate report — ${logPath}${cutoff}`,
    "",
    `  calls logged      ${summary.records}`,
    `  scored            ${summary.ok}`,
    `  errors            ${failed}  ← these failed open`,
    `  skipped           ${summary.skipped}${summary.skipped ? "  ← no API key set" : ""}`,
    ...(summary.badLines > 0 ? [`  unreadable lines  ${summary.badLines}`] : []),
  ];
}

function thresholdTable(summary: Summary): string[] {
  const row = (label: string, counts: number[]) =>
    `  ${label.padEnd(18)}${cells(counts, summary.ok)}`;
  return [
    "",
    "Calls that would be flagged at each threshold",
    `  ${"signal".padEnd(18)}${summary.thresholds.map((t) => `≥ ${t}`.padStart(15)).join("")}`,
    ...BLOCKING.map((signal) => row(signal, summary.flagged[signal])),
    row("ANY (gate fires)", summary.flagged.any),
    row("ANY minus off_task", summary.flagged.without_off_task),
  ];
}

function offTaskTable(summary: Summary): string[] {
  return [
    "",
    "off_task by request type (bare slash commands give Jev less to compare against)",
    ...summary.offTaskByKind
      .filter((entry) => entry.n > 0)
      .map(
        (entry) => `  ${`${entry.kind} (n=${entry.n})`.padEnd(18)}${cells(entry.flagged, entry.n)}`,
      ),
  ];
}

function toolTable(summary: Summary): string[] {
  return [
    "",
    `By tool (flagged at ≥ ${TOOL_THRESHOLD})`,
    ...summary.byTool.map(
      (entry) =>
        `  ${entry.tool.padEnd(30)} ${String(entry.n).padStart(6)} calls ${String(entry.flagged).padStart(5)} flagged`,
    ),
  ];
}

function errorTable(summary: Summary): string[] {
  if (summary.errorKinds.length === 0) {
    return [];
  }
  return [
    "",
    "Errors",
    ...summary.errorKinds.map((entry) => `  ${String(entry.n).padStart(5)}  ${entry.kind}`),
  ];
}

function highestList(summary: Summary): string[] {
  return [
    "",
    `Highest-scoring calls (top ${summary.highest.length}) — check these for false positives`,
    ...summary.highest.flatMap((record) => {
      const signals = BLOCKING.filter((signal) => record.scores?.[signal] !== undefined)
        .map((signal) => `${shortSignal(signal)} ${score(record, signal).toFixed(2)}`)
        .join(" · ");
      const when = record.ts.slice(0, 16).replace("T", " ");
      return [`  ${when}  ${record.tool.padEnd(10)} ${signals}`, `      ${record.summary}`];
    }),
  ];
}

/** The summary as the text the terminal shows. */
export function render(summary: Summary, logPath: string, since?: number): string {
  if (summary.ok === 0) {
    return [...headline(summary, logPath, since), "", "Nothing scored yet."].join("\n");
  }
  const { p50, p95, max } = summary.latency;
  return [
    ...headline(summary, logPath, since),
    `  latency           p50 ${p50} ms · p95 ${p95} ms · max ${max} ms`,
    ...thresholdTable(summary),
    ...offTaskTable(summary),
    ...toolTable(summary),
    ...errorTable(summary),
    ...highestList(summary),
  ].join("\n");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const logPath = option(args, "log") ?? readConfig().logPath;
  const top = Number(option(args, "top") ?? "15");
  const sinceArg = option(args, "since");
  const since = sinceArg === undefined ? undefined : parseSince(sinceArg, Date.now());

  const file = Bun.file(logPath);
  if (!(await file.exists())) {
    console.error(`No log at ${logPath}. Run some Claude Code sessions with the hook first.`);
    process.exit(1);
  }
  const summary = summarize(parseLog(await file.text(), since), top);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ log: logPath, ...summary }, null, 2));
  } else {
    console.log(render(summary, logPath, since));
  }
}
