# Working on jev-gate

jev-gate is a Claude Code plugin with one feature: a PreToolUse hook that asks Jev, TypeSafe's decision model, whether a tool call is risky. `README.md` says what it does and how to install it. This file holds what an agent needs on every turn here.

## Commands

```
bun run check      # the gate: typecheck, lint, format, tests, version
bun run validate   # the Claude Code plugin validator
bun run report     # read the gate's log on this machine
bun run changeset  # a user-facing change gets one; the release workflow versions and tags from it
```

## Where things live

| What | Where |
|---|---|
| The hook and its parts: settings, questions, state, the Jev call, the log | `scripts/gate/` |
| The threshold report | `scripts/report/` |
| Release tooling: version sync, release notes, validator | `scripts/version/`, `scripts/release/`, `scripts/validate.ts` |
| The no-key reminder at session start | `scripts/gate/session-start.ts` |
| The hook registration Claude Code reads | `hooks/hooks.json` |
| The skills installed users get: `jev-gate:setup`, `jev-gate:report` | `skills/setup/SKILL.md`, `skills/report/SKILL.md` |
| The plugin manifest, with the `jev_api_key` option, and the repo's own one-plugin marketplace | `.claude-plugin/` |
| Tests | `__tests__/` beside the file under test, `bun:test` |

## Jev and the API key

Jev is a decision model from TypeSafe AI. It takes a `state` and typed questions and returns probabilities, not text. jev-gate needs the user's own TypeSafe API key. Without it, the PreToolUse hook logs every call as `skipped`, and the SessionStart hook prints a one-line reminder.

When a user asks how to get or set the key, follow `skills/setup/SKILL.md`. It is the one source for the steps, so update it there, not here. In short:

1. The user signs up at <https://console.typesafe.ai> with Google or an email code, and adds billing if asked.
2. The user creates a key on the **API Keys** page.
3. The user stores it in one of two places. The configure dialog is preferred: `/plugin configure jev-gate@acmelabs`, which keeps the key in secure storage. The other place is `"JEV_API_KEY": "<key>"` inside the `"env"` block of `~/.claude/settings.json`. The dialog's key wins when both are set.

Never ask the user to paste the key into the chat, and never write it into a file for them. `scripts/gate/config.ts` reads the key in this order: `CLAUDE_PLUGIN_OPTION_JEV_API_KEY` (the dialog), `JEV_API_KEY`, `TYPESAFE_API_KEY`. The tests check that `plugin.json`, the config and the setup skill agree on these names.

Working on the gate needs no key: `bun test` runs every path against a mock `/v1/systemone` server.

## Change discipline

- Bun 1.4.0 only. No Node runtime, no Python.
- The hook fails open on every error. A change that can make it block or hang a tool call on failure is a bug.
- The question wording lives in `scripts/gate/questions.ts` only. The report and the log read signal names from `BLOCKING`.
- A failing test first, then the code, then `bun run check` green before the commit.
- One commit per task. Stage the task's files by name.
- A decision that is the user's goes through the ask-user-question skill, one question per call.
