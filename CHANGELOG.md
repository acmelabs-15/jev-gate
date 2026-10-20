# @acmelabs/jev-gate

## 0.2.1

### Patch Changes

- [#5](https://github.com/acmelabs-15/jev-gate/pull/5) [`6ef510e`](https://github.com/acmelabs-15/jev-gate/commit/6ef510e623ca6caf153b1fca42e5ed157dc40686) - The hooks now run in Cursor. For an imported Claude Code plugin hook, Cursor runs only the `command` string and ignores `args`. jev-gate put its script path in `args`, so Cursor ran bare `bun`, which printed its help text. Cursor read that as invalid JSON and blocked every Write, Edit and WebFetch call. Both hooks now name their script in the command string, such as `bun "${CLAUDE_PLUGIN_ROOT}/scripts/gate/hook.ts"`, which Claude Code runs the same way. `settings.example.json` uses the same form. The README now says to use `JEV_GATE_ON_FLAG=deny` in Cursor, because Cursor does not enforce `ask` for `preToolUse`.

## 0.2.0

### Minor Changes

- [#2](https://github.com/acmelabs-15/jev-gate/pull/2) [`7f560b6`](https://github.com/acmelabs-15/jev-gate/commit/7f560b61ff6d38e53a14903fa8dc9e0649cbbb41) - A new user can now get from install to a working key without leaving Claude Code. The install asks for a TypeSafe API key and keeps it in secure storage; `/plugin configure jev-gate@acmelabs` changes it later, and `JEV_API_KEY` in `~/.claude/settings.json` still works, with the dialog's key winning when both are set. A session started with no key opens with a one-line reminder, and the agent gets the context to help. Two skills ship with the plugin: `jev-gate:setup` explains Jev and walks through the TypeSafe signup, the key, and a check that it works; `jev-gate:report` runs the threshold report for installed users, who have no clone to run it from. The README and AGENTS.md document the signup, the cost, and where the key goes.

## 0.1.0

### Minor Changes

- First release. A PreToolUse hook asks Jev four questions about each Bash, Write, Edit, MultiEdit, NotebookEdit and WebFetch call: destructive, exfiltration, secrets, and off task against the user's latest request. Shadow mode, the default, only logs. Enforce mode answers a flagged call with `ask`, or with `deny` for headless runs. Every failure fails open. `bun run report` shows how many calls each threshold would flag.
