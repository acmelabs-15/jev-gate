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
| The hook registration Claude Code reads | `hooks/hooks.json` |
| The plugin manifest and the repo's own one-plugin marketplace | `.claude-plugin/` |
| Tests | `__tests__/` beside the file under test, `bun:test` |

## Change discipline

- Bun 1.4.0 only. No Node runtime, no Python.
- The hook fails open on every error. A change that can make it block or hang a tool call on failure is a bug.
- The question wording lives in `scripts/gate/questions.ts` only. The report and the log read signal names from `BLOCKING`.
- A failing test first, then the code, then `bun run check` green before the commit.
- One commit per task. Stage the task's files by name.
- A decision that is the user's goes through the ask-user-question skill, one question per call.
