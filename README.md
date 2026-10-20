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

The install asks for a **TypeSafe API key**. If you don't have one yet, leave it empty and follow [Get a TypeSafe API key](#get-a-typesafe-api-key). Without a key, every call is logged as `skipped`, and each new session opens with a one-line reminder.

Not sure what to do? Ask Claude "how do I set up jev-gate?". The plugin ships a `jev-gate:setup` skill that explains Jev, walks you through the signup, and checks the result.

To run it from a clone instead, add the clone as its own marketplace with `/plugin marketplace add <path to the clone>` and install `jev-gate@jev-gate`. `settings.example.json` shows the same hook wired straight into settings, with no plugin.

## Get a TypeSafe API key

Jev is a decision model from [TypeSafe AI](https://typesafe.ai). It returns probabilities instead of text, in about 70 to 500 ms. jev-gate calls it once per gated tool call, so it needs your own TypeSafe account and key.

1. **Sign up.** Go to [console.typesafe.ai](https://console.typesafe.ai) and sign in with Google or an email code. There's no password.
2. **Add billing if asked.** TypeSafe suspended its $5 free credit for new accounts in late September 2026, so the console may ask for a card. A low spending limit, such as $5 or $10, is plenty.
3. **Create a key.** Open **API Keys**, create a key named something like `jev-gate`, and copy it at once. It may be shown only once.
4. **Store it.** Pick one:

   | Where | How | Notes |
   | --- | --- | --- |
   | The plugin's configure dialog (recommended) | Run `/plugin configure jev-gate@acmelabs`, or open `/plugin`, select jev-gate on the **Installed** tab, and choose **Configure**. Paste the key into **TypeSafe API key**. | Masked input. Claude Code keeps the key in secure storage, not in `settings.json`. |
   | `~/.claude/settings.json` | Add `"JEV_API_KEY": "<your key>"` inside the `"env"` block. If the file already has an `"env"` block, add the line inside it; a second `"env"` block replaces the first. | Plain text. Use it where the dialog isn't available. |

   When both are set, the dialog's key wins.

5. **Check it.** Restart Claude Code, run any command, then read the report (see [Read the log](#read-the-log)). `scored` should go up. An `HTTP 401` or `403` error means TypeSafe rejected the key.

**What it costs.** $0.042 per million input tokens, and output tokens are free (TypeSafe's published rates, October 2026). Each gated call sends about 1,000 to 2,000 tokens, so 1,000 calls a day cost about $2 a month.

**Don't paste the key into a chat.** A key in a transcript counts as exposed. If that happens, revoke it on the API Keys page and create a new one.

**No TypeSafe account?** Vercel's AI Gateway serves Jev too: set `JEV_BASE_URL` to `https://ai-gateway.vercel.sh/typesafe`, `JEV_MODEL` to `typesafe-ai/jev`, and `JEV_API_KEY` to your AI Gateway key. Or run a local `/v1/systemone` server such as Kev, which needs no key at all.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `JEV_API_KEY` | — | TypeSafe key (`TYPESAFE_API_KEY` also works). The key from the configure dialog wins over both. With no key against the hosted API, calls are logged as `skipped`. |
| `JEV_BASE_URL` | `https://api.typesafe.ai` | Any `/v1/systemone` server: hosted Jev, a gateway (OpenRouter, Vercel), or a local Kev server. |
| `JEV_MODEL` | `jev-latest` | The model name sent in the request. |
| `JEV_GATE_MODE` | `shadow` | `shadow` logs only. `enforce` acts on a flag. |
| `JEV_GATE_ON_FLAG` | `ask` | In enforce mode: `ask` prompts you; `deny` sends the agent back with the reason. Use `deny` for headless or autonomous runs, where `ask` would wait for a human. Use `deny` in Cursor too: Cursor does not enforce `ask` for `preToolUse` ([Cursor hooks](https://cursor.com/docs/hooks)). |
| `JEV_GATE_THRESHOLD` | `0.9` | A blocking signal at or above this counts as a flag. |
| `JEV_TIMEOUT_MS` | `1500` | The limit per call. On a timeout the call goes ahead and an error is logged. |
| `JEV_GATE_LOG` | `~/.claude/jev-gate/log.jsonl` | Where the log goes. |
| `JEV_GATE_MAX_FIELD` | `4000` | Characters kept per string sent to Jev, such as file contents in `Write`. |

## Read the log

Installed from the marketplace: ask Claude to "show the jev-gate report", or run `/jev-gate:report`. The `jev-gate:report` skill runs the report script that ships with the plugin and walks through the results. Add a time span or a count to the request, such as "for the last 7 days" or "top 30".

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
