# jev-gate

A Claude Code `PreToolUse` hook that asks Jev four questions about each side-effecting tool call before it runs:

| Signal | Question |
| --- | --- |
| `destructive` | Would this delete or irreversibly change something that isn't a build or cache artifact? |
| `exfiltration` | Does this send local files, code, env vars, or credentials to a remote host? |
| `secrets` | Does this read, print, or write secrets (.env, keys, tokens)? |
| `off_task` | Is this something the user didn't ask for? Only asked when a user request is found in the transcript. |

It also logs a 4-level `risk` score for reference; that score never triggers the gate.

It starts in **shadow mode**: it never changes what Claude Code does, it only appends one JSONL line per call. After a week or so, `make report` shows how many calls each threshold would have flagged and lists the highest-scoring calls so you can check them for false positives. Then you decide whether to turn on enforce mode.

Pure Bun. No runtime dependencies. Every failure path (no key, timeout, HTTP error, bad response) fails open.

## Install

Pick one.

**As a plugin** (same route as agent-skills). Add this folder to a local marketplace, or point Claude Code at it with `--plugin-dir`. The plugin's `hooks/hooks.json` registers the hook. Put the env vars in your user `~/.claude/settings.json` under `"env"`:

```json
{ "env": { "JEV_API_KEY": "ts-..." } }
```

**Directly in settings.** Copy the `hooks` block from `settings.example.json` into `~/.claude/settings.json` and replace the path with the absolute path to `hook.ts`.

Get a key at console.typesafe.ai.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `JEV_API_KEY` | — | TypeSafe key (`TYPESAFE_API_KEY` also works). With no key against the hosted API, calls are logged as `skipped`. |
| `JEV_BASE_URL` | `https://api.typesafe.ai` | Any `/v1/systemone` server: hosted Jev, a gateway (OpenRouter, Vercel), or a local Kev server. |
| `JEV_MODEL` | `jev-latest` | Model name sent in the request. |
| `JEV_GATE_MODE` | `shadow` | `shadow` logs only. `enforce` acts on flags. |
| `JEV_GATE_ON_FLAG` | `ask` | In enforce mode: `ask` prompts you; `deny` sends the agent back with the reason. Use `deny` for headless or autonomous runs, where `ask` would wait for a human. |
| `JEV_GATE_THRESHOLD` | `0.9` | A blocking signal at or above this counts as a flag. |
| `JEV_TIMEOUT_MS` | `1500` | Per-call limit. On timeout the call proceeds and an error is logged. |
| `JEV_GATE_LOG` | `~/.claude/jev-gate/log.jsonl` | Log location. |
| `JEV_GATE_MAX_FIELD` | `4000` | Characters kept per string sent to Jev (e.g. file contents in `Write`). |

## Reading the log

```sh
make report                    # everything
make report-week               # last 7 days
make report ARGS="--top 30"    # more of the highest-scoring calls
make report-json               # machine-readable
make tail                      # watch calls as they happen
```

How to pick a threshold:

1. Look at **ANY (gate fires)**. This is how often you would be interrupted. Aim for a few percent of calls at most.
2. Read the **highest-scoring calls**. If the top of the list is mostly things you'd want to confirm, the threshold is right. If it's full of `rm -rf node_modules`, tune the questions in `lib.ts` before tuning the number.
3. Check **off_task by request type**. When you drive work with slash commands (`/build`, `/ship`), the "request" Jev sees is the command and its arguments, which is thin. If `command` rows flag much more than `prompt` rows, ignore `off_task` in enforce mode by raising the threshold, or remove that signal from `BLOCKING` in `lib.ts`.
4. Check **latency p95** and **errors**. Every gated call waits for Jev, and errors mean the gate was silently off.

## Working alongside other hooks and skills

- **agent-skills** and other Markdown skills don't register hooks, so nothing overlaps. The gate sees the tool calls those skills produce, the same as any others.
- **brain** and other plugins with their own `PreToolUse` hooks: Claude Code runs matching hooks in parallel. In shadow mode this hook never returns a decision, so it can't conflict with anything.
- The default matcher only covers built-in side-effecting tools. MCP tools aren't gated, so brain's search and memory tools don't pay the latency. To gate a specific MCP server, add it to the matcher, e.g. `^(Bash|Write|Edit|MultiEdit|NotebookEdit|WebFetch|mcp__github__.*)$`.

## Privacy

Each gated call sends the tool name, the tool input (truncated), the working directory, and your latest message to whatever `JEV_BASE_URL` points at. With hosted Jev, that's TypeSafe. With a gateway, it's the gateway and TypeSafe. The log stays local and holds a one-line summary of each call, not the full input.

To keep everything on your machine, run a `/v1/systemone`-compatible server locally (for example Kev) and set `JEV_BASE_URL` to it. Nothing else changes, and you can compare both logs with `make report ARGS="--log …"`.

## Development

```sh
make check   # tsc + bun test (22 end-to-end tests against a mock server)
```

The tests run `hook.ts` exactly as Claude Code does (JSON on stdin) against a mock `/v1/systemone` server, covering shadow and enforce output, ask vs deny, thresholds, every fail-open path, slash-command unwrapping, and the report.

## Files

- `hook.ts`: the hook.
- `lib.ts`: config, questions, the HTTP call, log format. Edit the questions here.
- `report.ts`: threshold report.
- `hooks/hooks.json`, `.claude-plugin/plugin.json`: plugin packaging.
- `settings.example.json`: settings-based install.
- `test/gate.test.ts`: tests.
