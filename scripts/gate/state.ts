/**
 * What the gate sends Jev as `state`: the tool call, the working directory, and the user's latest
 * request from the transcript. Also the one-line summary the log and the report show.
 */

/** The part of Claude Code's PreToolUse input the gate reads. */
export type HookInput = {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
};

/** `prompt` is typed text; `command` is a slash command such as `/build`; `none` is no request. */
export type RequestKind = "prompt" | "command" | "none";

export type UserRequest = { text: string; kind: Exclude<RequestKind, "none"> };

const TRANSCRIPT_TAIL_BYTES = 512 * 1024;
const MAX_REQUEST_CHARS = 2000;
const MAX_SUMMARY_CHARS = 300;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Cuts every long string in a JSON value, so the request stays small. */
export function truncateDeep(value: unknown, max: number): unknown {
  if (typeof value === "string") {
    return value.length > max ? `${value.slice(0, max)}…[+${value.length - max} chars]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateDeep(item, max));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        truncateDeep(item, max),
      ]),
    );
  }
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickSummary(tool: string, input: Record<string, unknown>): string {
  if (tool === "Bash") {
    return text(input.command);
  }
  if (EDIT_TOOLS.has(tool)) {
    return text(input.file_path) || text(input.notebook_path);
  }
  if (tool === "WebFetch") {
    return text(input.url);
  }
  return JSON.stringify(input);
}

/** One line that names the call, for the log and the report. */
export function summarize(tool: string, input: Record<string, unknown> = {}): string {
  const line = pickSummary(tool, input).replaceAll(/\s+/gu, " ").trim();
  return line.length > MAX_SUMMARY_CHARS ? `${line.slice(0, MAX_SUMMARY_CHARS)}…` : line;
}

/**
 * Slash commands (agent-skills' `/spec`, `/plan`, `/build` …) sit in the transcript wrapped in
 * `<command-name>` and `<command-args>` tags. This unwraps them, so Jev sees
 * `/build add retry to the uploader`, and marks them, so the report can show the off-task signal
 * apart: a bare `/build` says little about what the user wants.
 */
export function normalizeRequest(raw: string): UserRequest {
  const name = raw.match(/<command-name>\s*(?<name>[^<]*?)\s*<\/command-name>/u)?.groups?.name;
  if (name === undefined) {
    return { text: raw, kind: "prompt" };
  }
  const args =
    raw.match(/<command-args>\s*(?<args>[\s\S]*?)\s*<\/command-args>/u)?.groups?.args ?? "";
  const command = name.startsWith("/") ? name : `/${name}`;
  return { text: `${command} ${args}`.trim(), kind: "command" };
}

type TranscriptBlock = { type?: string; text?: string };
type TranscriptEntry = {
  type?: string;
  isMeta?: boolean;
  message?: { content?: string | TranscriptBlock[] };
};

function parseEntry(line: string): TranscriptEntry | undefined {
  try {
    return JSON.parse(line) as TranscriptEntry;
  } catch {
    // The first line of the tail may be cut in half.
    return undefined;
  }
}

/** The typed text of a user entry, or "" for tool results, meta entries and non-user entries. */
function userText(entry: TranscriptEntry): string {
  if (entry.type !== "user" || entry.isMeta === true) {
    return "";
  }
  const content = entry.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content) || content.some((block) => block.type === "tool_result")) {
    return "";
  }
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

/** The last user text in a transcript's JSONL, read from the end. */
export function lastUserText(jsonl: string): string | undefined {
  const lines = jsonl.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    const entry = line ? parseEntry(line) : undefined;
    const found = entry ? userText(entry) : "";
    if (found) {
      return found.length > MAX_REQUEST_CHARS ? `${found.slice(0, MAX_REQUEST_CHARS)}…` : found;
    }
  }
  return undefined;
}

/** The user's latest request, from the tail of the transcript file. Best effort. */
export async function lastUserRequest(path?: string): Promise<UserRequest | undefined> {
  if (path === undefined || path === "") {
    return undefined;
  }
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return undefined;
    }
    const tail = await file.slice(Math.max(0, file.size - TRANSCRIPT_TAIL_BYTES), file.size).text();
    const raw = lastUserText(tail);
    return raw === undefined ? undefined : normalizeRequest(raw);
  } catch {
    return undefined;
  }
}
