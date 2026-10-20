---
name: setup
description: Explains jev-gate and Jev, TypeSafe's decision model, and walks the user through creating a TypeSafe account and API key and storing the key where jev-gate reads it. Use when the user asks what Jev or jev-gate is, how to get or set a TypeSafe or Jev API key, or why jev-gate is not checking tool calls, and when the session-start message says jev-gate has no API key.
---

# Set up jev-gate

jev-gate is a Claude Code plugin. Before each Bash, Write, Edit, MultiEdit, NotebookEdit or WebFetch call runs, its hook asks Jev four questions about the call: is it destructive, does it send data off the machine, does it touch secrets, and did the user ask for it. Jev is a decision model from TypeSafe AI. It returns probabilities, not text, in about 70 to 500 ms. jev-gate starts in shadow mode: it only writes a log line per call and never changes what Claude Code does.

Without a TypeSafe API key, jev-gate skips every call. This skill gets the user a key and puts it where jev-gate reads it.

## Rules for you

- Never ask the user to paste the key into the chat. A key in a transcript counts as exposed.
- Never write the key into a file yourself. The user types it into the configure dialog, or edits `~/.claude/settings.json` themselves.
- If the user pastes a key into the chat anyway, tell them to revoke it on the API Keys page and create a new one, then continue with the new key.
- The user does the account steps in their browser. You explain them and check the result.

## Steps

1. **Check where things stand.** Run the report for the last day:

   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/report/report.ts" --since 1d
   ```

   A `skipped` count with "no API key set" confirms the key is missing. "No log" means no gated call has run yet. Both are normal before setup.

2. **Tell the user what the key costs and what it sends, then ask whether to go on.**
   - Price, from TypeSafe's published rates in October 2026: $0.042 per million input tokens, and output tokens are free. Each gated call sends about 1,000 to 2,000 tokens, so 1,000 calls a day cost about $2 a month.
   - TypeSafe suspended its $5 free credit for new accounts in late September 2026. The console may ask for a card before the key works.
   - Each gated call sends the tool name, the tool input (cut to 4,000 characters per field), the working directory and the user's latest message to TypeSafe. The log stays on the user's machine.

3. **Create the account.** The user goes to <https://console.typesafe.ai> and signs in with Google or an email code. There is no password. If the console asks for billing, the user can set a low spending limit there, such as $5 or $10.

4. **Create the key.** In the console, the user opens **API Keys**, creates a key (a name such as `jev-gate` helps), and copies it at once. The console may show it only once.

5. **Store the key.** Give the user both options and recommend the first:

   | Where | How | Notes |
   |---|---|---|
   | The plugin's configure dialog (recommended) | The user runs `/plugin configure jev-gate@acmelabs`, or opens `/plugin`, selects jev-gate on the **Installed** tab, and chooses **Configure**. They type the key into the **TypeSafe API key** field. | The input is masked and the key goes to secure storage, not `settings.json`. Only the user can run this command. |
   | `~/.claude/settings.json` | The user adds `"JEV_API_KEY": "<their key>"` inside the `"env"` block. If the file already has an `"env"` block, the line goes inside it; a second `"env"` block replaces the first. | The key sits in a plain-text file. Use this when the dialog is not available. |

   When both are set, the dialog's key wins. If the plugin came from a marketplace other than `acmelabs`, the command uses that name: `/plugin configure jev-gate@<marketplace>`.

6. **Check that it works.** After the user stores the key, run one harmless command, such as `ls`, then run the report again:

   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/report/report.ts" --since 10m
   ```

   | What the report shows | What it means | What to do |
   |---|---|---|
   | `scored` goes up | jev-gate works | Done. Tell the user shadow mode only logs, and point them to the README for enforce mode. |
   | Still `skipped` | Claude Code has not picked up the key | The user restarts Claude Code, then check again. |
   | `errors` with `HTTP 401` or `HTTP 403` | TypeSafe rejected the key | The key is wrong or revoked. The user creates a new one and stores it again. |
   | `errors` with `HTTP 402` | The account has no balance | The user adds billing in the console. |

## Other routes

- **Vercel AI Gateway.** For a user who cannot or will not create a TypeSafe account. They set `JEV_BASE_URL` to `https://ai-gateway.vercel.sh/typesafe`, `JEV_MODEL` to `typesafe-ai/jev`, and `JEV_API_KEY` to their AI Gateway key, all in the `env` block of `~/.claude/settings.json`. Tool calls then pass through Vercel as well as TypeSafe.
- **A local server.** Point `JEV_BASE_URL` at a local `/v1/systemone`-compatible server, such as Kev. It needs no key, and nothing leaves the machine.

The README at <https://github.com/acmelabs-15/jev-gate> covers every setting, the threshold report, and enforce mode.
