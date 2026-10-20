---
"@acmelabs/jev-gate": minor
---

A new user can now get from install to a working key without leaving Claude Code. The install asks for a TypeSafe API key and keeps it in secure storage; `/plugin configure jev-gate@acmelabs` changes it later, and `JEV_API_KEY` in `~/.claude/settings.json` still works, with the dialog's key winning when both are set. A session started with no key opens with a one-line reminder, and the agent gets the context to help. Two skills ship with the plugin: `jev-gate:setup` explains Jev and walks through the TypeSafe signup, the key, and a check that it works; `jev-gate:report` runs the threshold report for installed users, who have no clone to run it from. The README and AGENTS.md document the signup, the cost, and where the key goes.
