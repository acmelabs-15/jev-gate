# @acmelabs/jev-gate

## 0.2.0

### Minor Changes

- [#2](https://github.com/acmelabs-15/jev-gate/pull/2) [`7f560b6`](https://github.com/acmelabs-15/jev-gate/commit/7f560b61ff6d38e53a14903fa8dc9e0649cbbb41) - A new user can now get from install to a working key without leaving Claude Code. The install asks for a TypeSafe API key and keeps it in secure storage; `/plugin configure jev-gate@acmelabs` changes it later, and `JEV_API_KEY` in `~/.claude/settings.json` still works, with the dialog's key winning when both are set. A session started with no key opens with a one-line reminder, and the agent gets the context to help. Two skills ship with the plugin: `jev-gate:setup` explains Jev and walks through the TypeSafe signup, the key, and a check that it works; `jev-gate:report` runs the threshold report for installed users, who have no clone to run it from. The README and AGENTS.md document the signup, the cost, and where the key goes.

## 0.1.0

### Minor Changes

- First release. A PreToolUse hook asks Jev four questions about each Bash, Write, Edit, MultiEdit, NotebookEdit and WebFetch call: destructive, exfiltration, secrets, and off task against the user's latest request. Shadow mode, the default, only logs. Enforce mode answers a flagged call with `ask`, or with `deny` for headless runs. Every failure fails open. `bun run report` shows how many calls each threshold would flag.
