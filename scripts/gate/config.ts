/**
 * The gate's settings. Every value comes from the environment, so `~/.claude/settings.json`
 * (its `env` block) is the one place a user changes anything.
 */

/** `shadow` logs only. `enforce` acts on a flag. */
export type Mode = "shadow" | "enforce";

/**
 * What enforce mode does on a flag. `ask` prompts the user, for interactive sessions. `deny` sends
 * the agent back with the reason, for headless runs, where `ask` would wait for a human.
 */
export type OnFlag = "ask" | "deny";

export type Config = {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: Mode;
  onFlag: OnFlag;
  threshold: number;
  timeoutMs: number;
  logPath: string;
  maxField: number;
};

/** The hosted endpoint. Any server that speaks TypeSafe's `/v1/systemone` format also works. */
export const HOSTED_BASE_URL = "https://api.typesafe.ai";

/**
 * The `userConfig` option in `.claude-plugin/plugin.json` that holds the key. Claude Code asks for
 * it in the plugin's configure dialog, keeps it in secure storage, and gives it to every hook as
 * `CLAUDE_PLUGIN_OPTION_JEV_API_KEY`.
 */
export const KEY_OPTION = "jev_api_key";

/** The first value that is set and not empty. */
function firstSet(...values: (string | undefined)[]): string {
  return values.find((value) => value !== undefined && value !== "") ?? "";
}

function expandHome(path: string, home: string): string {
  return path.startsWith("~/") ? `${home}${path.slice(1)}` : path;
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value === undefined || value === "" || Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Reads the settings from an environment. Defaults keep the gate in shadow mode.
 *
 * The key comes from the configure dialog first, then `JEV_API_KEY` or `TYPESAFE_API_KEY` in the
 * `env` block of `~/.claude/settings.json`. An empty value counts as not set.
 */
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    apiKey: firstSet(
      env[`CLAUDE_PLUGIN_OPTION_${KEY_OPTION.toUpperCase()}`],
      env.JEV_API_KEY,
      env.TYPESAFE_API_KEY,
    ),
    baseUrl: (env.JEV_BASE_URL ?? HOSTED_BASE_URL).replace(/\/+$/u, ""),
    model: env.JEV_MODEL ?? "jev-latest",
    mode: env.JEV_GATE_MODE === "enforce" ? "enforce" : "shadow",
    onFlag: env.JEV_GATE_ON_FLAG === "deny" ? "deny" : "ask",
    threshold: numberOr(env.JEV_GATE_THRESHOLD, 0.9),
    timeoutMs: numberOr(env.JEV_TIMEOUT_MS, 1500),
    logPath: expandHome(env.JEV_GATE_LOG ?? "~/.claude/jev-gate/log.jsonl", env.HOME ?? ""),
    maxField: numberOr(env.JEV_GATE_MAX_FIELD, 4000),
  };
}

/** True when the gate would call the hosted API without a key: the call is skipped and logged. */
export function missingKey(config: Config): boolean {
  return config.apiKey === "" && config.baseUrl.includes("typesafe.ai");
}
