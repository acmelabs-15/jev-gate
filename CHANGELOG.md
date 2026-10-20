# @acmelabs/jev-gate

## 0.1.0

### Minor Changes

- First release. A PreToolUse hook asks Jev four questions about each Bash, Write, Edit, MultiEdit, NotebookEdit and WebFetch call: destructive, exfiltration, secrets, and off task against the user's latest request. Shadow mode, the default, only logs. Enforce mode answers a flagged call with `ask`, or with `deny` for headless runs. Every failure fails open. `bun run report` shows how many calls each threshold would flag.
