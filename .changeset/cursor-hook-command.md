---
"@acmelabs/jev-gate": patch
---

The hooks now run in Cursor. For an imported Claude Code plugin hook, Cursor runs only the `command` string and ignores `args`. jev-gate put its script path in `args`, so Cursor ran bare `bun`, which printed its help text. Cursor read that as invalid JSON and blocked every Write, Edit and WebFetch call. Both hooks now name their script in the command string, such as `bun "${CLAUDE_PLUGIN_ROOT}/scripts/gate/hook.ts"`, which Claude Code runs the same way. `settings.example.json` uses the same form. The README now says to use `JEV_GATE_ON_FLAG=deny` in Cursor, because Cursor does not enforce `ask` for `preToolUse`.
