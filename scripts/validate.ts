/**
 * Run the Claude Code plugin validator.
 *
 *   bun run validate
 *
 * jev-gate is a Claude Code plugin only: its one feature is a PreToolUse hook. So, unlike brain,
 * there is no Antigravity step. The exit code is the first failure.
 */

type Step = { name: string; command: string[]; required: boolean };

export const steps: readonly Step[] = [
  { name: "claude", command: ["claude", "plugin", "validate", ".", "--strict"], required: true },
  {
    name: "claude manifest",
    command: ["claude", "plugin", "validate", ".claude-plugin/plugin.json", "--strict"],
    required: true,
  },
];

async function run(step: Step): Promise<number> {
  const binary = step.command[0] as string;
  if (Bun.which(binary) === null) {
    if (step.required) {
      console.error(`${step.name}: ${binary} is not on PATH`);
      return 1;
    }
    console.log(`${step.name}: skipped, ${binary} is not on PATH`);
    return 0;
  }
  const proc = Bun.spawn(step.command, { stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  console.log(`${step.name}: ${code === 0 ? "ok" : `exit ${code}`}`);
  return code;
}

let first = 0;
for (const step of steps) {
  const code = await run(step);
  if (code !== 0 && first === 0) {
    first = code;
  }
}
process.exit(first);
