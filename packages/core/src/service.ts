import { type AIProfile, authorizeProfile, capabilityFor } from "./ai/profiles.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { PathGuard } from "./security/path-guard.js";
import { readText } from "./tools/safe-fs.js";
import { UndoStore } from "./tools/undo-store.js";
import { ToolRegistry } from "./tools/types.js";
import { registerFileTools } from "./tools/file-tool.js";
import { registerTerminalTools } from "./tools/terminal-tool.js";
import { PermissionManager } from "./permissions/manager.js";
import { ToolDispatcher } from "./tools/dispatcher.js";
import { FileAuditSink } from "./audit/file-sink.js";
import { AnthropicProvider } from "./ai/providers/anthropic.js";
import { EnvSecretStore } from "./security/secret-store.js";
import { AIRouter, type AIProvider } from "./ai/router.js";
import { RealAgentDriver } from "./agent/driver.js";
import { runAgent, type AgentResult } from "./agent/engine.js";
import type { OrbitEvent, EmitEvent } from "./agent/events.js";
import { filterContext } from "./context/filter.js";
import { ProjectScanner } from "./project/scanner.js";
import { checkAbort, abortable } from "./agent/abort.js";
import { redactDeep } from "./security/redactor.js";

interface Pending {
  id: string;
  kind: "plan" | "diff" | "permission";
  data: unknown;
  resolve: (answer: string) => void;
}
interface Task {
  id: string;
  controller: AbortController;
  result?: AgentResult;
  running: boolean;
  done?: Promise<void>;
}
export interface ServiceOptions {
  workspace: string;
  stateDirectory: string;
  auditDirectory?: string;
  onEvent?: (event: OrbitEvent) => void;
  onPending?: () => void;
  filesEnabled?: boolean;
  terminalEnabled?: boolean;
  model?: string;
  provider?: AIProvider;
  profile?: AIProfile;
  profileContext?: string;
  verificationCommand?: string;
}
export async function createOrbitService(options: ServiceOptions) {
  const root = await fs.realpath(options.workspace),
    guard = new PathGuard({ roots: [root] });
  await fs.mkdir(options.stateDirectory, { recursive: true, mode: 0o700 });
  const stateRoot = await fs.realpath(options.stateDirectory);
  const stateRelative = path.relative(root, stateRoot);
  const workspaceRelative = path.relative(stateRoot, root);
  if (
    workspaceRelative === "" ||
    (!path.isAbsolute(workspaceRelative) &&
      workspaceRelative !== ".." &&
      !workspaceRelative.startsWith(".." + path.sep))
  )
    throw new Error("Workspace cannot be inside private state");
  if (
    stateRelative === "" ||
    (!path.isAbsolute(stateRelative) && stateRelative !== ".." && !stateRelative.startsWith(".." + path.sep))
  )
    throw new Error("State directory must be outside the workspace");
  const provider = options.provider ?? new AnthropicProvider(new EnvSecretStore());
  const router = new AIRouter(new Map([[provider.id, provider]]), []);
  const audit = new FileAuditSink(path.join(options.auditDirectory ?? options.stateDirectory, "audit.jsonl"));
  const undo = new UndoStore(path.join(options.stateDirectory, "undo"));
  const registry = new ToolRegistry();
  registerFileTools(registry, guard, undo, root);
  registerTerminalTools(registry, guard, root);
  const permissions = new PermissionManager({
    policies: {
      files: options.filesEnabled === false ? "deny" : "ask",
      terminal: options.terminalEnabled === false ? "deny" : "ask",
      browser: "deny",
      git: "deny",
      github: "deny",
      screen: "deny",
      system: "deny",
      search: "allow",
    },
  });
  const authorize = options.profile
    ? (tool: string, input: unknown) =>
        authorizeProfile(options.profile!, tool, input, options.verificationCommand ?? "npm test")
    : undefined;
  const dispatcher = new ToolDispatcher(
    registry,
    permissions,
    audit,
    authorize,
    options.profile
      ? (tool, input) => {
          const cap = capabilityFor(tool, input, options.verificationCommand ?? "npm test");
          return cap ? options.profile!.permissionPolicy[cap] : "disabled";
        }
      : undefined,
  );
  const events: OrbitEvent[] = [],
    pending = new Map<string, Pending>(),
    tasks = new Map<string, Task>();
  let current: Task | undefined;
  const broadcast = (event: OrbitEvent) => {
    events.push(event);
    if (events.length > 500) events.shift();
    options.onEvent?.(event);
  };
  const emitFor =
    (taskId: string): EmitEvent =>
    async (type, data = {}) => {
      const event: OrbitEvent = { type, taskId, at: Date.now(), data: redactDeep(data).value };
      await audit.record({
        userId: "local",
        event: type,
        actor: "orbit",
        target: taskId,
        detail: event.data,
        at: event.at,
      });
      broadcast(event);
    };
  const ask = async (task: Task, kind: Pending["kind"], data: unknown): Promise<string> => {
    checkAbort(task.controller.signal);
    return new Promise<string>((resolve, reject) => {
      const id = randomUUID();
      const clean = () => {
        pending.delete(id);
        task.controller.signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        clean();
        reject(new Error("Cancelled"));
      };
      pending.set(id, {
        id,
        kind,
        data,
        resolve: (answer) => {
          clean();
          resolve(answer);
        },
      });
      task.controller.signal.addEventListener("abort", abort, { once: true });
      options.onPending?.();
    });
  };
  let paused = false;
  async function waitForResume(signal: AbortSignal) {
    while (paused) {
      checkAbort(signal);
      await new Promise((r) => setTimeout(r, 50));
    }
    checkAbort(signal);
  }
  let preparing = false,
    restoring: Promise<void> | undefined,
    closed = false;
  async function start(value: unknown) {
    const input = z.object({ request: z.string().min(1).max(10000) }).parse(value);
    const task: Task = { id: randomUUID(), controller: new AbortController(), running: true };
    current = task;
    tasks.set(task.id, task);
    const model = await abortable(async () => {
      if (options.model) {
        if (!(await provider.isConfigured())) throw new Error("AI provider not configured.");
        const selected = provider.models().find((m) => m.model === options.model);
        if (!selected)
          throw new Error("Selected model is unavailable. Refresh models; ORBIT will not switch automatically.");
        if (!selected.supportsTools)
          throw new Error("This model does not support the capabilities required for Agent Mode.");
        return selected;
      }
      return router.route({
        kind: "code",
        approxInputTokens: 10000,
        offline: false,
        requireTools: true,
      });
    }, task.controller.signal);
    checkAbort(task.controller.signal);
    const emit = emitFor(task.id);
    // Integrity baseline is outside model control; test and package edits invalidate completion.
    const baseline = new Map<string, string>();
    let capturedEntries = 0;
    async function capture(dir: string): Promise<void> {
      checkAbort(task.controller.signal);
      for (const e of await fs.readdir(await guard.validate(dir, "read"), { withFileTypes: true })) {
        if (++capturedEntries > 20000) throw new Error("Project scan limit exceeded");
        if (e.isSymbolicLink() || ["node_modules", ".git", ".orbit"].includes(e.name)) continue;
        const file = path.join(dir, e.name);
        if (e.isDirectory()) await capture(file);
        else if (e.name === "package.json" || /\.(test|spec)\.[cm]?[jt]s$/.test(e.name))
          baseline.set(
            file,
            createHash("sha256")
              .update(await fs.readFile(await guard.validate(file, "read")))
              .digest("hex"),
          );
      }
    }
    try {
      await capture(root);
    } catch (e) {
      task.running = false;
      throw e;
    }
    const verifyIntegrity = async () => {
      for (const [file, hash] of baseline)
        if (
          createHash("sha256")
            .update(await fs.readFile(await guard.validate(file, "read")))
            .digest("hex") !== hash
        )
          throw new Error("Verification inputs changed: " + path.basename(file));
    };
    let overview;
    try {
      overview =
        options.profile &&
        (!options.profile.capabilities.includes("read") || options.profile.permissionPolicy.read === "disabled")
          ? { name: path.basename(root), stack: [] }
          : await new ProjectScanner(guard).scan(root);
    } catch (error) {
      task.running = false;
      throw error;
    }
    const context = filterContext(
      {
        capturedAt: Date.now(),
        project: { name: overview.name, root, stack: overview.stack },
        activeApplication: null,
        activeFile: null,
        workspace: { openFiles: [] },
        terminalState: null,
        gitState: null,
        browserState: null,
        screenState: { enabled: false, capturedAt: null },
        recentActions: [],
        recentErrors: [],
      },
      { budgetChars: 10000, disabled: new Set(), query: input.request },
    );
    const driver = new RealAgentDriver({
      taskId: task.id,
      workspaceRoot: root,
      request: input.request,
      context,
      provider,
      model: options.model ?? model.model,
      registry,
      ...(options.profile
        ? {
            profileContext: options.profileContext ?? JSON.stringify(options.profile),
            maxTokens: options.profile.maxTokens,
            authorize: authorize!,
            allowedTool: (tool: string) => {
              if (tool === "TerminalTool.run")
                return ["tests", "terminal", "gitRead"].some(
                  (c) =>
                    options.profile!.capabilities.includes(c as "tests") &&
                    options.profile!.permissionPolicy[c as "tests"] !== "disabled",
                );
              try {
                authorize!(tool, {});
                return true;
              } catch {
                return false;
              }
            },
          }
        : {}),
      dispatcher,
      guard,
      emit,
      approvePlan: async (plan) => (await ask(task, "plan", { plan })) === "approve",
      approveDiff: async (file, diff) => (await ask(task, "diff", { path: file, diff })) === "approve",
      askUser: async (request, description) => {
        await emit("permission.required", { request, description });
        const answer = z
          .enum(["once", "task", "always", "deny"])
          .parse(await ask(task, "permission", { request, description }));
        checkAbort(task.controller.signal);
        await emit(answer === "deny" ? "permission.denied" : "permission.granted", { mode: answer });
        return answer;
      },
      verificationCommand: options.verificationCommand ?? "npm test",
      verifyIntegrity,
    });
    await emit("agent.created", { request: input.request });
    await emit("agent.started");
    const driverOperations = new Set<Promise<unknown>>();
    const track = <T>(operation: Promise<T>): Promise<T> => {
      driverOperations.add(operation);
      const clean = () => {
        driverOperations.delete(operation);
      };
      void operation.then(clean, clean);
      return operation;
    };
    task.done = (async () => {
      try {
        const result = await runAgent({
          taskId: task.id,
          driver: {
            next: (history, signal) =>
              track(
                (async () => {
                  await waitForResume(signal);
                  return driver.next(history, signal);
                })(),
              ),
            execute: (call, signal) =>
              track(
                (async () => {
                  await waitForResume(signal);
                  return driver.execute(call, signal);
                })(),
              ),
            verify: (history, signal) =>
              track(
                (async () => {
                  await waitForResume(signal);
                  return driver.verify(history, signal);
                })(),
              ),
          },
          signal: task.controller.signal,
          onEvent: (event) => {
            if (event.type === "step.started" || event.type === "step.completed")
              broadcast({
                type: event.type === "step.completed" && !event.ok ? "step.failed" : event.type,
                taskId: task.id,
                at: Date.now(),
                data: { ...event },
              });
          },
        });
        await Promise.allSettled([...driverOperations]);
        await dispatcher.settled();
        task.result = result;
        await emit(
          result.reason === "completed"
            ? "agent.completed"
            : result.reason === "cancelled"
              ? "agent.cancelled"
              : result.reason === "timeout"
                ? "agent.timed_out"
                : "agent.failed",
          { reason: result.reason, message: result.message },
        );
      } catch (e) {
        await emit("agent.failed", { message: e instanceof Error ? e.message : "Task failed" });
      } finally {
        await Promise.allSettled([...driverOperations]);
        await dispatcher.settled();
        task.running = false;
        permissions.endTask(task.id);
        for (const p of [...pending.values()]) p.resolve("deny");
      }
    })();
    return { taskId: task.id };
  }

  return {
    async status() {
      return {
        configured: await provider.isConfigured(),
        paused,
        workspace: root,
        busy: preparing || !!restoring || !!current?.running,
        current: current ? { id: current.id, running: current.running, result: current.result } : null,
        pending: [...pending.values()].map(({ id, kind, data }) => ({ id, kind, data })),
        events,
      };
    },
    pause() {
      paused = true;
      return { ok: true };
    },
    resume() {
      paused = false;
      return { ok: true };
    },
    async start(value: unknown) {
      if (paused) throw new Error("Agents are paused. Resume agents first.");
      if (closed || preparing || restoring || current?.running) throw new Error("A task or restore is already active");
      preparing = true;
      try {
        return await start(value);
      } catch (e) {
        if (current) current.running = false;
        throw e;
      } finally {
        preparing = false;
      }
    },
    answer(value: unknown) {
      const input = z
        .object({ id: z.string(), answer: z.enum(["approve", "reject", "once", "task", "always", "deny"]) })
        .parse(value);
      const p = pending.get(input.id);
      if (!p) throw new Error("This request is no longer pending");
      if (
        p.kind === "permission"
          ? !["once", "task", "always", "deny"].includes(input.answer)
          : !["approve", "reject"].includes(input.answer)
      )
        throw new Error("Invalid answer");
      p.resolve(input.answer);
      return { ok: true };
    },
    stop() {
      current?.controller.abort(new Error("User stopped task"));
      return { ok: true };
    },
    async undo(value: unknown) {
      if (closed || preparing || restoring || current?.running) throw new Error("Stop the running task first");
      const { taskId } = z.object({ taskId: z.string().uuid() }).parse(value);
      if (!undo.manifestFor(taskId).length) throw new Error("No undo manifest");
      restoring = (async () => {
        await undo.restore(taskId, guard);
        await audit.record({ userId: "local", event: "task.undone", actor: "user", target: taskId, at: Date.now() });
      })();
      try {
        await restoring;
        return { ok: true };
      } finally {
        restoring = undefined;
      }
    },
    async files(value: unknown) {
      if (options.filesEnabled === false) throw new Error("Files access is disabled");
      const { directory } = z.object({ directory: z.string().max(2000).default(".") }).parse(value);
      const target = await guard.validate(directory, "read");
      const entries = await fs.readdir(target, { withFileTypes: true });
      await audit.record({ userId: "local", event: "files.list", actor: "user", target, at: Date.now() });
      return entries
        .filter(
          (e) =>
            !e.isSymbolicLink() &&
            ![".git", "node_modules"].includes(e.name) &&
            guard.check(path.join(target, e.name), "read").allowed,
        )
        .slice(0, 500)
        .map((e) => ({
          name: e.name,
          directory: e.isDirectory(),
          path: path.relative(root, path.join(target, e.name)),
        }));
    },
    async read(value: unknown) {
      if (options.filesEnabled === false) throw new Error("Files access is disabled");
      const { file } = z.object({ file: z.string().max(2000) }).parse(value);
      const target = await guard.validate(file, "read");
      const { content } = await readText(await guard.validate(file, "read"), 200000);
      await audit.record({ userId: "local", event: "files.preview", actor: "user", target, at: Date.now() });
      return { content: redactDeep(content).value };
    },
    async shutdown() {
      closed = true;
      current?.controller.abort(new Error("Application closing"));
      while (preparing) await new Promise((r) => setTimeout(r, 10));
      current?.controller.abort(new Error("Application closing"));
      await current?.done;
      await dispatcher.settled();
      await restoring;
    },
  };
}
