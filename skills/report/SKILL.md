---
name: report
description: Shows the jev-gate report, which reads the gate's log and shows how many tool calls each threshold would have flagged, the highest-scoring calls, latency, and errors. Use when the user asks to see the jev-gate log, report, or results, how often jev-gate would block, or which threshold to pick before turning on enforce mode.
---

# Show the jev-gate report

Run the report script that ships with the plugin. Pass the user's options through: `--since 30m`, `12h` or `7d` limits the time span, `--top <n>` lists more of the highest-scoring calls, and `--json` gives machine-readable output.

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/report/report.ts" --since 7d
```

Then tell the user what it shows, in this order:

1. **Status.** How many calls were scored, how many failed open (`errors`), and how many were `skipped`. A `skipped` count with "no API key set" means the key is missing: load the `jev-gate:setup` skill.
2. **How often the gate would fire.** The **ANY (gate fires)** row at the current threshold, 0.9 unless `JEV_GATE_THRESHOLD` says otherwise. A few percent of calls at most is a usable level.
3. **False positives.** Read the highest-scoring calls. Name any that look harmless, such as `rm -rf node_modules`. Those point at the question wording in the plugin's `scripts/gate/questions.ts`, not at the threshold.
4. **off_task by request type.** If `command` rows flag far more than `prompt` rows, slash commands give Jev too little to compare against. Suggest keeping `off_task` out of enforce mode.
5. **Latency and errors.** The p95 latency is the wait added to each gated call. Errors mean the gate was off for those calls; `HTTP 401` or `403` means the key was rejected.

Do not change settings yourself. To turn on enforce mode, the user sets `JEV_GATE_MODE` to `enforce`, and optionally `JEV_GATE_THRESHOLD` and `JEV_GATE_ON_FLAG`, in the `env` block of `~/.claude/settings.json`.
