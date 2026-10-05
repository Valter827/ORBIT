import { checkAbort } from "../agent/abort.js";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { ToolDefinition, ToolContext } from "./types.js";
import type { PathGuard } from "../security/path-guard.js";
import { assessCommand } from "../security/command-risk.js";

const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

const RunInput = z.object({
  command: z.string().min(1),
  /** Relative to the workspace root; defaults to the root itself. */
  cwd: z.string().optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(10 * 60 * 1000)
    .optional(),
});

const RunOutput = z.object({
  command: z.string(),
  exitCode: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
  durationMs: z.number(),
});

export class TerminalToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalToolError";
  }
}

/**
 * The tool itself does not decide whether to run a CRITICAL command — that
 * decision belongs to the Permission Manager, invoked by the dispatcher
 * before `execute` is ever called. `assess` exists so the dispatcher can
 * price the *specific* command the model wants to run, not just the tool's
 * static baseRisk.
 */
export function createRunTool(
  guard: PathGuard,
  workspaceRoot: string,
  platform: NodeJS.Platform = process.platform,
): ToolDefinition<z.infer<typeof RunInput>, z.infer<typeof RunOutput>> {
  const shell = platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellFlag = platform === "win32" ? "/d /s /c" : "-c";

  return {
    name: "TerminalTool.run",
    domain: "terminal",
    action: "run",
    description: "Runs a shell command with its working directory inside the current workspace.",
    input: RunInput,
    jsonSchema: {
      type: "object",
      properties: { command: { type: "string" }, cwd: { type: "string" }, timeoutMs: { type: "integer" } },
      required: ["command"],
    },
    output: RunOutput,
    baseRisk: "MEDIUM",
    assess: (input) => assessCommand(input.command).level,
    describe: (input) => {
      const risk = assessCommand(input.command);
      return `Run "${input.command}" — ${risk.reason}`;
    },
    async validate(input) {
      await guard.validate(input.cwd ?? ".", "read");
      if (assessCommand(input.command).level === "CRITICAL")
        throw new TerminalToolError("blocked", "Critical shell commands are unavailable in this MVP");
    },
    async execute(input, ctx: ToolContext) {
      checkAbort(ctx.signal);
      if (assessCommand(input.command).level === "CRITICAL")
        throw new TerminalToolError("blocked", "Critical shell commands are unavailable in this MVP");
      const targetDir = input.cwd ?? ".";
      let resolved: string;
      try {
        resolved = await guard.validate(targetDir, "read");
      } catch {
        throw new TerminalToolError("path_denied", "Working directory rejected");
      }
      const decision = guard.check(targetDir, "read");
      if (!decision.allowed) {
        throw new TerminalToolError(decision.reason, `Working directory rejected: ${decision.detail}`);
      }

      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const startedAt = Date.now();

      return await new Promise<z.infer<typeof RunOutput>>((resolve, reject) => {
        checkAbort(ctx.signal);
        const child = spawn(
          shell,
          [...shellFlag.split(" "), platform === "win32" ? '"' + input.command + '"' : input.command],
          {
            cwd: resolved,
            detached: platform !== "win32",
            env: sanitizedEnv(),
            windowsHide: true,
            windowsVerbatimArguments: platform === "win32",
          },
        );

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const killTree = () => {
          if (!child.pid) return;
          if (platform === "win32") {
            const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
            killer.on("error", () => {
              child.kill();
            });
          } else {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };
        const timer = setTimeout(() => {
          timedOut = true;
          killTree();
        }, timeoutMs);

        const onAbort = () => killTree();
        ctx.signal.addEventListener("abort", onAbort, { once: true });
        if (ctx.signal.aborted) onAbort();

        child.stdout.on("data", (chunk: Buffer) => {
          if (stdout.length < MAX_OUTPUT_CHARS)
            stdout += chunk.toString("utf8").slice(0, MAX_OUTPUT_CHARS - stdout.length);
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (stderr.length < MAX_OUTPUT_CHARS)
            stderr += chunk.toString("utf8").slice(0, MAX_OUTPUT_CHARS - stderr.length);
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          ctx.signal.removeEventListener("abort", onAbort);
          reject(new TerminalToolError("spawn_failed", err.message));
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          ctx.signal.removeEventListener("abort", onAbort);
          ctx.log(`ran "${input.command}" -> exit ${code ?? "null"}${timedOut ? " (timed out)" : ""}`);
          resolve({
            command: input.command,
            exitCode: code,
            stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
            stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
            timedOut,
            durationMs: Date.now() - startedAt,
          });
        });
      });
    },
  };
}

/**
 * Strips anything that looks like a credential from the child's environment.
 * A build tool does not need ORBIT's own provider keys, and if a project's
 * .env was somehow loaded into this process it should not be inherited.
 */
function sanitizedEnv(): NodeJS.ProcessEnv {
  const blocked = /SECRET|TOKEN|API_KEY|APIKEY|PASSWORD|PRIVATE_KEY|CREDENTIAL/i;
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (
      !blocked.test(k) &&
      /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|CI|NODE_ENV)$/i.test(
        k,
      )
    )
      out[k] = v;
  }
  return out;
}

export function registerTerminalTools(
  registry: { register: (t: ToolDefinition<never, unknown>) => void },
  guard: PathGuard,
  workspaceRoot: string,
): void {
  registry.register(createRunTool(guard, workspaceRoot) as ToolDefinition<never, unknown>);
}
