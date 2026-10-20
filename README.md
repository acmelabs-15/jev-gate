# jev-gate

A Claude Code plugin with one `PreToolUse` hook. Before each Bash, Write, Edit, MultiEdit, NotebookEdit or WebFetch call runs, the hook asks [Jev](https://typesafe.ai), TypeSafe's decision model, four questions about it:

| Signal | Question |
| --- | --- |
| `destructive` | Would this delete or irreversibly change something that isn't a build or cache artifact? |
| `exfiltration` | Does this send local files, code, env vars, or credentials to a remote host? |
| `secrets` | Does this read, print, or write secrets (.env, keys, tokens)? |
| `off_task` | Is this something the user didn't ask for? Asked only when the transcript holds a user request. |

It also logs a 4-level `risk` score for reference. That score never triggers the gate.

The hook starts in **shadow mode**: it never changes what Claude Code does, it only appends one JSONL line per call. After a week or so, `bun run report` shows how many calls each threshold would have flagged and lists the highest-scoring ones, so you can check them for false positives. Then you decide whether to turn on enforce mode.

Pure Bun, no runtime dependencies. Every failure (no key, timeout, HTTP error, bad response) fails open.

## Install

From the ACMElabs marketplace, the documented route:

```
/plugin marketplace add acmelabs-15/marketplace
/plugin install jev-gate@acmelabs
```

Then put a TypeSafe key in the `env` block of `~/.claude/settings.json` and restart Claude Code:

```json
{ "env": { "JEV_API_KEY": "<your key>" } }
```

Get a key at [console.typesafe.ai](https://console.typesafe.ai). Without one, every call is logged as `skipped` and nothing else happens.

To run it from a clone instead, add the clone as its own marketplace with `/plugin marketplace add <path to the clone>` and install `jev-gate@jev-gate`. `settings.example.json` shows the same hook wired straight into settings, with no plugin.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `JEV_API_KEY` | — | TypeSafe key (`TYPESAFE_API_KEY` also works). With no key against the hosted API, calls are logged as `skipped`. |
| `JEV_BASE_URL` | `https://api.typesafe.ai` | Any `/v1/systemone` server: hosted Jev, a gateway (OpenRouter, Vercel), or a local Kev server. |
| `JEV_MODEL` | `jev-latest` | The model name sent in the request. |
| `JEV_GATE_MODE` | `shadow` | `shadow` logs only. `enforce` acts on a flag. |
| `JEV_GATE_ON_FLAG` | `ask` | In enforce mode: `ask` prompts you; `deny` sends the agent back with the reason. Use `deny` for headless or autonomous runs, where `ask` would wait for a human. |
| `JEV_GATE_THRESHOLD` | `0.9` | A blocking signal at or above this counts as a flag. |
| `JEV_TIMEOUT_MS` | `1500` | The limit per call. On a timeout the call goes ahead and an error is logged. |
| `JEV_GATE_LOG` | `~/.claude/jev-gate/log.jsonl` | Where the log goes. |
| `JEV_GATE_MAX_FIELD` | `4000` | Characters kept per string sent to Jev, such as file contents in `Write`. |

## Read the log

From a clone of this repo:

```
bun run report                    # everything
bun run report -- --since 7d      # the last 7 days
bun run report -- --top 30        # more of the highest-scoring calls
bun run report -- --json          # machine-readable
```

To pick a threshold:

1. Look at **ANY (gate fires)**. It is how often you would be interrupted. Aim for a few percent of calls at most.
2. Read the **highest-scoring calls**. If the top of the list is mostly calls you'd want to confirm, the threshold is right. If it is full of `rm -rf node_modules`, change the questions in `scripts/gate/questions.ts` before you change the number.
3. Check **off_task by request type**. When you drive work with slash commands (`/build`, `/ship`), the request Jev sees is the command and its arguments, which is thin. If `command` rows flag much more than `prompt` rows, keep `off_task` out of enforce mode: raise the threshold, or take it out of `BLOCKING` in `scripts/gate/questions.ts`.
4. Check **latency p95** and **errors**. Every gated call waits for Jev, and an error means the gate was off for that call.

## Alongside other hooks and skills

- Markdown skill packs such as agent-skills register no hooks, so nothing overlaps. The gate sees the tool calls those skills make, the same as any others.
- Plugins with their own `PreToolUse` hooks, brain among them: Claude Code runs matching hooks in parallel. In shadow mode this hook never returns a decision, so it cannot conflict with anything.
- The matcher covers built-in side-effecting tools only. MCP tools are not gated, so search and memory tools pay no latency. To gate an MCP server, add it to the matcher in `hooks/hooks.json`, for example `^(Bash|Write|Edit|MultiEdit|NotebookEdit|WebFetch|mcp__github__.*)$`.

## Privacy

Each gated call sends the tool name, the tool input (cut to `JEV_GATE_MAX_FIELD`), the working directory and your latest message to the server `JEV_BASE_URL` names. With hosted Jev, that is TypeSafe. Through a gateway, it is the gateway and TypeSafe. The log stays on your machine and holds a one-line summary of each call, not the full input.

To keep everything on your machine, run a `/v1/systemone`-compatible server locally, such as Kev, and point `JEV_BASE_URL` at it.

## Develop

```
bun install
bun run check      # typecheck, lint, format, tests, version
bun run validate   # claude plugin validate --strict
```

`AGENTS.md` has the repo rules. Releases follow `.changeset/README.md`: a user-facing change gets a changeset, and merging the `ci: Version Packages` pull request tags `v<version>` and moves `latest`, which the marketplace follows.

## License

MIT
