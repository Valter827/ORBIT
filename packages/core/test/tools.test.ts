import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PathGuard } from "../src/security/path-guard.js";
import { UndoStore } from "../src/tools/undo-store.js";
import {
  createReadTool,
  createWriteTool,
  createDeleteTool,
  createMoveTool,
  createSearchTool,
  FileToolError,
} from "../src/tools/file-tool.js";
import { createRunTool, TerminalToolError } from "../src/tools/terminal-tool.js";
import { ToolRegistry, type ToolContext } from "../src/tools/types.js";
import { ToolDispatcher } from "../src/tools/dispatcher.js";
import { PermissionManager, type ToolDomain, type DomainPolicy } from "../src/permissions/manager.js";
import { InMemoryAuditSink } from "../src/audit/sink.js";

async function withWorkspace<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "orbit-test-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function ctxFor(root: string, taskId = "t1"): ToolContext {
  return { taskId, workspaceRoot: root, signal: new AbortController().signal, log: () => {} };
}

// ── FileTool: real disk ops ─────────────────────────────────────────

test("write then read round-trips real content on disk", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const write = createWriteTool(guard, new UndoStore());
    const read = createReadTool(guard);

    const result = await write.execute({ path: "src/a.ts", content: "export const x = 1;\n" }, ctxFor(root));
    assert.equal(result.created, true);
    assert.equal(result.insertions, 1);

    const onDisk = await readFile(path.join(root, "src/a.ts"), "utf8");
    assert.equal(onDisk, "export const x = 1;\n");

    const readBack = await read.execute({ path: "src/a.ts" }, ctxFor(root));
    assert.equal(readBack.content, "export const x = 1;\n");
  }));

test("write refuses a path that escapes the workspace", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const write = createWriteTool(guard, new UndoStore());
    await assert.rejects(
      () => write.execute({ path: "../../etc/cron.d/evil", content: "* * * * * root rm -rf /" }, ctxFor(root)),
      FileToolError,
    );
  }));

test("delete refuses to remove a directory", () =>
  withWorkspace(async (root) => {
    await mkdir(path.join(root, "src"));
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const del = createDeleteTool(guard, new UndoStore());
    await assert.rejects(() => del.execute({ path: "src" }, ctxFor(root)), FileToolError);
  }));

test("delete backs up content so undo can restore it", () =>
  withWorkspace(async (root) => {
    await writeFile(path.join(root, "keep.txt"), "important\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const undo = new UndoStore();
    const del = createDeleteTool(guard, undo);

    await del.execute({ path: "keep.txt" }, ctxFor(root, "task-x"));
    await assert.rejects(readFile(path.join(root, "keep.txt")));

    const plan = undo.planUndo("task-x");
    assert.equal(plan.length, 1);
    assert.equal(plan[0]!.restoreContent, "important\n");
  }));

test("undo restores the original state, not an intermediate write", () =>
  withWorkspace(async (root) => {
    await writeFile(path.join(root, "f.txt"), "v0\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const undo = new UndoStore();
    const write = createWriteTool(guard, undo);

    await write.execute({ path: "f.txt", content: "v1\n" }, ctxFor(root, "task-y"));
    await write.execute({ path: "f.txt", content: "v2\n" }, ctxFor(root, "task-y"));

    const plan = undo.planUndo("task-y");
    assert.equal(plan.length, 1);
    assert.equal(plan[0]!.restoreContent, "v0\n"); // not v1
  }));

test("move rejects when the source does not exist", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const move = createMoveTool(guard, new UndoStore());
    await assert.rejects(() => move.execute({ from: "ghost.ts", to: "real.ts" }, ctxFor(root)), FileToolError);
  }));

test("search never returns matches outside the workspace root", () =>
  withWorkspace(async (root) => {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "a.ts"), "const SECRET_TOKEN = 1;\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const search = createSearchTool(guard, root);
    const result = await search.execute({ query: "SECRET_TOKEN" }, ctxFor(root));
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]!.path, "src/a.ts");
  }));

test("search skips node_modules and .git", () =>
  withWorkspace(async (root) => {
    await mkdir(path.join(root, "node_modules"));
    await writeFile(path.join(root, "node_modules", "x.js"), "needle\n");
    await writeFile(path.join(root, "app.js"), "needle\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const search = createSearchTool(guard, root);
    const result = await search.execute({ query: "needle" }, ctxFor(root));
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]!.path, "app.js");
  }));

// ── TerminalTool: real spawned processes ────────────────────────────

test("a real command actually executes and returns real stdout", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const run = createRunTool(guard, root);
    const result = await run.execute({ command: "echo hello-orbit" }, ctxFor(root));
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /hello-orbit/);
  }));

test("a nonzero exit code is reported, not swallowed", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const run = createRunTool(guard, root);
    const result = await run.execute({ command: "exit 7" }, ctxFor(root));
    assert.equal(result.exitCode, 7);
  }));

test("a long-running command is killed at the timeout", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const run = createRunTool(guard, root);
    const result = await run.execute({ command: 'node -e "setTimeout(() => {}, 5000)"', timeoutMs: 200 }, ctxFor(root));
    assert.equal(result.timedOut, true);
  }));

test("the working directory cannot escape the workspace", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const run = createRunTool(guard, root);
    await assert.rejects(() => run.execute({ command: "echo hi", cwd: "../../" }, ctxFor(root)), TerminalToolError);
  }));

test("secrets in the parent environment are not inherited by the child", () =>
  withWorkspace(async (root) => {
    process.env["ORBIT_TEST_API_KEY"] = "sk-should-not-leak";
    try {
      const guard = new PathGuard({ roots: [root], platform: "linux" });
      const run = createRunTool(guard, root);
      const result = await run.execute({ command: "echo $ORBIT_TEST_API_KEY" }, ctxFor(root));
      assert.ok(!result.stdout.includes("sk-should-not-leak"));
    } finally {
      delete process.env["ORBIT_TEST_API_KEY"];
    }
  }));

// ── ToolDispatcher: the only legitimate path to execute() ───────────

const policies: Record<ToolDomain, DomainPolicy> = {
  files: "allow",
  terminal: "ask",
  browser: "allow",
  git: "ask",
  github: "ask",
  screen: "deny",
  system: "ask",
  search: "allow",
};

test("dispatcher blocks execution when input fails schema validation", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const registry = new ToolRegistry();
    registry.register(createReadTool(guard));
    const dispatcher = new ToolDispatcher(registry, new PermissionManager({ policies }), new InMemoryAuditSink());

    await assert.rejects(() =>
      dispatcher.dispatch({
        taskId: "t",
        userId: "u",
        toolName: "FileTool.read",
        input: { path: 123 }, // wrong type — never reaches fs
        workspaceRoot: root,
        signal: new AbortController().signal,
        askUser: async () => "deny",
      }),
    );
  }));

test("dispatcher denies and never executes when the user declines", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const registry = new ToolRegistry();
    registry.register(createRunTool(guard, root));
    const audit = new InMemoryAuditSink();
    const dispatcher = new ToolDispatcher(registry, new PermissionManager({ policies }), audit);

    let askedRisk: string | null = null;
    await assert.rejects(
      () =>
        dispatcher.dispatch({
          taskId: "t",
          userId: "u",
          toolName: "TerminalTool.run",
          input: { command: "rm -rf /" },
          workspaceRoot: root,
          signal: new AbortController().signal,
          askUser: async (req) => {
            askedRisk = req.risk;
            return "deny";
          },
        }),
      Error,
    );
    assert.equal(askedRisk, null);
    // Critical commands are rejected before permission in the hardened MVP.
    assert.ok(!audit.list().some((e) => e.event === "tool.run"));
  }));

test("dispatcher executes and audits after the user allows once", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const registry = new ToolRegistry();
    registry.register(createRunTool(guard, root));
    const audit = new InMemoryAuditSink();
    const dispatcher = new ToolDispatcher(registry, new PermissionManager({ policies }), audit);

    const result = await dispatcher.dispatch({
      taskId: "t",
      userId: "u",
      toolName: "TerminalTool.run",
      input: { command: "echo dispatched" },
      workspaceRoot: root,
      signal: new AbortController().signal,
      askUser: async () => "once",
    });

    assert.match((result as { stdout: string }).stdout, /dispatched/);
    assert.ok(audit.list().some((e) => e.event === "tool.run"));
  }));

test("a CRITICAL command stays blocked after a HIGH-risk task grant", () =>
  withWorkspace(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const registry = new ToolRegistry();
    registry.register(createRunTool(guard, root));
    const pm = new PermissionManager({ policies });
    const dispatcher = new ToolDispatcher(registry, pm, new InMemoryAuditSink());

    // Grant "always" on a HIGH-risk command elsewhere in the same domain/action.
    let askCount = 0;
    await dispatcher.dispatch({
      taskId: "t",
      userId: "u",
      toolName: "TerminalTool.run",
      input: { command: 'node -e "console.log(1)"' },
      workspaceRoot: root,
      signal: new AbortController().signal,
      askUser: async () => {
        askCount++;
        return "always";
      },
    });
    assert.equal(askCount, 1);

    // A CRITICAL command must still prompt, never silently reuse a grant.
    await assert.rejects(() =>
      dispatcher.dispatch({
        taskId: "t",
        userId: "u",
        toolName: "TerminalTool.run",
        input: { command: "rm -rf /" },
        workspaceRoot: root,
        signal: new AbortController().signal,
        askUser: async () => {
          askCount++;
          return "deny";
        },
      }),
    );
    assert.equal(askCount, 1);
  }));

test("dispatcher rejects a tool name that isn't registered", () =>
  withWorkspace(async (root) => {
    const dispatcher = new ToolDispatcher(
      new ToolRegistry(),
      new PermissionManager({ policies }),
      new InMemoryAuditSink(),
    );
    await assert.rejects(() =>
      dispatcher.dispatch({
        taskId: "t",
        userId: "u",
        toolName: "GhostTool.run",
        input: {},
        workspaceRoot: root,
        signal: new AbortController().signal,
        askUser: async () => "deny",
      }),
    );
  }));
