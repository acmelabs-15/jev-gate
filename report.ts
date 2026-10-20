#!/usr/bin/env bun
// Reads the shadow-mode log and shows what the gate would have done at
// different thresholds, so you can pick one before turning on enforce mode.
//
//   bun report.ts                     # default log, all records
//   bun report.ts --since 7d          # last 7 days (also 12h, 30m)
//   bun report.ts --top 25            # show more of the highest-scoring calls
//   bun report.ts --log path/to.jsonl # a different log file
//   bun report.ts --json              # machine-readable summary

import { BLOCKING, type LogRecord, type Signal, config } from "./lib";

const THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95];

// --- args ------------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const logPath = opt("log") ?? config.logPath;
const top = Number(opt("top") ?? "15");
const asJson = args.includes("--json");
const since = parseSince(opt("since"));

function parseSince(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+)([mhd])$/);
  if (!m) throw new Error(`--since expects e.g. 30m, 12h, 7d (got "${v}")`);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "m" | "h" | "d"];
  return Date.now() - Number(m[1]) * unit;
}

// --- load ------------------------------------------------------------------

const file = Bun.file(logPath);
if (!(await file.exists())) {
  console.error(`No log at ${logPath}. Run some Claude Code sessions with the hook installed first.`);
  process.exit(1);
}

const records: LogRecord[] = [];
let badLines = 0;
for (const line of (await file.text()).split("\n")) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line) as LogRecord & { had_user_request?: boolean };
    // Records from before request_kind existed.
    r.request_kind ??= r.had_user_request ? "prompt" : "none";
    if (since && Date.parse(r.ts) < since) continue;
    records.push(r);
  } catch {
    badLines++;
  }
}

const ok = records.filter((r) => r.status === "ok" && r.scores);
const errors = records.filter((r) => r.status === "error");
const skipped = records.filter((r) => r.status === "skipped");

// --- stats -----------------------------------------------------------------

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const score = (r: LogRecord, s: Signal) => r.scores?.[s] ?? 0;
const maxBlocking = (r: LogRecord) => Math.max(...BLOCKING.map((s) => score(r, s)));

const latencies = ok.map((r) => r.latency_ms);

// Calls that would be flagged at each threshold, per signal and overall.
const bySignal = Object.fromEntries(
  BLOCKING.map((s) => [s, THRESHOLDS.map((t) => ok.filter((r) => score(r, s) >= t).length)]),
) as Record<(typeof BLOCKING)[number], number[]>;
const anyFlag = THRESHOLDS.map((t) => ok.filter((r) => maxBlocking(r) >= t).length);
const withoutOffTask = THRESHOLDS.map(
  (t) => ok.filter((r) => BLOCKING.some((s) => s !== "off_task" && score(r, s) >= t)).length,
);

// off_task split by what the user request looked like. A bare slash command
// (/build, /ship …) gives Jev little to compare against, so expect more noise.
const offTaskByKind = (["prompt", "command"] as const).map((kind) => {
  const rs = ok.filter((r) => r.request_kind === kind && r.scores?.off_task !== undefined);
  return { kind, n: rs.length, flagged: THRESHOLDS.map((t) => rs.filter((r) => score(r, "off_task") >= t).length) };
});

const byTool = new Map<string, { n: number; flagged09: number }>();
for (const r of ok) {
  const e = byTool.get(r.tool) ?? { n: 0, flagged09: 0 };
  e.n++;
  if (maxBlocking(r) >= 0.9) e.flagged09++;
  byTool.set(r.tool, e);
}

const errorKinds = new Map<string, number>();
for (const r of errors) {
  const k = (r.error ?? "unknown").replace(/\d{3,}/g, "N").slice(0, 60);
  errorKinds.set(k, (errorKinds.get(k) ?? 0) + 1);
}

const highest = [...ok].sort((a, b) => maxBlocking(b) - maxBlocking(a)).slice(0, top);

// --- output ----------------------------------------------------------------

if (asJson) {
  console.log(
    JSON.stringify(
      {
        log: logPath,
        records: records.length,
        ok: ok.length,
        errors: errors.length,
        skipped: skipped.length,
        latency_ms: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), max: Math.max(0, ...latencies) },
        thresholds: THRESHOLDS,
        flagged: { any: anyFlag, without_off_task: withoutOffTask, ...bySignal },
        off_task_by_request_kind: offTaskByKind,
        by_tool: Object.fromEntries(byTool),
        errors_by_kind: Object.fromEntries(errorKinds),
        highest: highest.map((r) => ({ ts: r.ts, tool: r.tool, summary: r.summary, scores: r.scores })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const col = (s: string | number, w: number) => String(s).padStart(w);
const line = (label: string, counts: number[]) =>
  `  ${label.padEnd(18)}${counts.map((c) => col(`${c} (${pct(c, ok.length)})`, 15)).join("")}`;

console.log(`Jev gate report — ${logPath}${since ? ` (since ${new Date(since).toISOString()})` : ""}`);
console.log("");
console.log(`  calls logged      ${records.length}`);
console.log(`  scored            ${ok.length}`);
console.log(`  errors            ${errors.length} (${pct(errors.length, records.length)})  ← these failed open`);
console.log(`  skipped           ${skipped.length}${skipped.length ? "  ← no API key set" : ""}`);
if (badLines) console.log(`  unreadable lines  ${badLines}`);
if (ok.length) {
  console.log(
    `  latency           p50 ${quantile(latencies, 0.5)} ms · p95 ${quantile(latencies, 0.95)} ms · max ${Math.max(...latencies)} ms`,
  );
}

if (!ok.length) {
  console.log("\nNothing scored yet.");
  process.exit(0);
}

console.log("\nCalls that would be flagged at each threshold");
console.log(`  ${"signal".padEnd(18)}${THRESHOLDS.map((t) => col(`≥ ${t}`, 15)).join("")}`);
for (const s of BLOCKING) console.log(line(s, bySignal[s]));
console.log(line("ANY (gate fires)", anyFlag));
console.log(line("ANY minus off_task", withoutOffTask));

console.log("\noff_task by request type (bare slash commands give Jev less to compare against)");
for (const k of offTaskByKind) {
  if (!k.n) continue;
  console.log(`  ${`${k.kind} (n=${k.n})`.padEnd(18)}${k.flagged.map((c) => col(`${c} (${pct(c, k.n)})`, 15)).join("")}`);
}

console.log("\nBy tool (flagged at ≥ 0.9)");
for (const [tool, e] of [...byTool].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${tool.padEnd(30)} ${col(e.n, 6)} calls ${col(e.flagged09, 5)} flagged`);
}

if (errorKinds.size) {
  console.log("\nErrors");
  for (const [k, n] of [...errorKinds].sort((a, b) => b[1] - a[1])) console.log(`  ${col(n, 5)}  ${k}`);
}

console.log(`\nHighest-scoring calls (top ${highest.length}) — check these for false positives`);
for (const r of highest) {
  const sig = BLOCKING.filter((s) => r.scores?.[s] !== undefined)
    .map((s) => `${s.replace("exfiltration", "exfil")} ${score(r, s).toFixed(2)}`)
    .join(" · ");
  console.log(`  ${r.ts.slice(0, 16).replace("T", " ")}  ${r.tool.padEnd(10)} ${sig}`);
  console.log(`      ${r.summary}`);
}
