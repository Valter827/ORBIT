import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PathGuard } from "../src/security/path-guard.js";
import { assessCommand, type RiskLevel, type SideEffect } from "../src/security/command-risk.js";
import { PermissionManager } from "../src/permissions/manager.js";
import { ToolRegistry, type ToolContext } from "../src/tools/types.js";
import { ToolDispatcher } from "../src/tools/dispatcher.js";
import { InMemoryAuditSink } from "../src/audit/sink.js";
import { UndoStore } from "../src/tools/undo-store.js";
import {
  createReadTool,
  createWriteTool,
  createDeleteTool,
  createMoveTool,
  createSearchTool,
} from "../src/tools/file-tool.js";
import { diffLines } from "../src/tools/diff.js";
import { runAgent, type AgentDriver } from "../src/agent/engine.js";
import { AIRouter, AIProviderNotConfiguredError, type AIProvider } from "../src/ai/router.js";
import { z } from "zod";

const policies = {
  files: "ask",
  terminal: "ask",
  browser: "deny",
  git: "ask",
  github: "deny",
  screen: "deny",
  system: "deny",
  search: "allow",
} as const;
async function fixture(fn: (root: string, outside: string, storage: string) => Promise<void>) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-hardening-"));
  const root = path.join(base, "workspace"),
    outside = path.join(base, "outside"),
    storage = path.join(base, "state");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  try {
    await fn(root, outside, storage);
  } finally {
    if (
      path.dirname(path.resolve(base)) !== path.resolve(os.tmpdir()) ||
      !path.basename(base).startsWith("orbit-hardening-")
    )
      assert.fail("Invalid cleanup root");
    await fs.rm(base, { recursive: true, force: true });
  }
}
const ctx = (root: string, signal = new AbortController().signal): ToolContext => ({
  taskId: "task",
  workspaceRoot: root,
  signal,
  log: () => {},
});
for (const input of ["../secret.txt", "../../secret.txt"])
  test("canonical traversal rejects " + input, () =>
    fixture(async (root) => {
      await assert.rejects(new PathGuard({ roots: [root] }).validate(input, "read"));
    }),
  );
test("absolute outside target denied", () =>
  fixture(async (root, outside) => {
    await assert.rejects(new PathGuard({ roots: [root] }).validate(path.join(outside, "x"), "write"));
  }));
for (const action of ["read", "write", "delete", "move-from", "move-to"])
  test("outside directory alias blocks " + action, () =>
    fixture(async (root, outside, storage) => {
      await fs.writeFile(path.join(outside, "secret.txt"), "outside");
      await fs.writeFile(path.join(root, "inside.txt"), "inside");
      await fs.symlink(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir");
      const guard = new PathGuard({ roots: [root] }),
        undo = new UndoStore(storage),
        c = ctx(root);
      const operation =
        action === "read"
          ? () => createReadTool(guard).execute({ path: "link/secret.txt" }, c)
          : action === "write"
            ? () => createWriteTool(guard, undo).execute({ path: "link/secret.txt", content: "changed" }, c)
            : action === "delete"
              ? () => createDeleteTool(guard, undo).execute({ path: "link/secret.txt" }, c)
              : action === "move-from"
                ? () => createMoveTool(guard, undo).execute({ from: "link/secret.txt", to: "x" }, c)
                : () => createMoveTool(guard, undo).execute({ from: "inside.txt", to: "link/x" }, c);
      await assert.rejects(operation);
      assert.equal(await fs.readFile(path.join(outside, "secret.txt"), "utf8"), "outside");
    }),
  );
test("internal directory alias remains usable", () =>
  fixture(async (root) => {
    await fs.mkdir(path.join(root, "actual"));
    await fs.writeFile(path.join(root, "actual", "a.txt"), "hello");
    await fs.symlink(
      path.join(root, "actual"),
      path.join(root, "link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const r = await createReadTool(new PathGuard({ roots: [root] })).execute({ path: "link/a.txt" }, ctx(root));
    assert.equal(r.content, "hello");
  }));
test("file symlink escape denied where OS permits symlinks", async (t) =>
  fixture(async (root, outside) => {
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    try {
      await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "alias.txt"), "file");
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "EPERM") {
        t.skip("Windows file symlink privilege unavailable; junction tests still run");
        return;
      }
      throw e;
    }
    await assert.rejects(new PathGuard({ roots: [root] }).validate("alias.txt", "read"));
  }));
test("canonical target cannot alias a blocked credential filename", async (t) =>
  fixture(async (root) => {
    await fs.writeFile(path.join(root, ".env"), "secret");
    try {
      await fs.symlink(path.join(root, ".env"), path.join(root, "alias.txt"), "file");
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "EPERM") {
        t.skip("File symlink privilege unavailable");
        return;
      }
      throw e;
    }
    await assert.rejects(new PathGuard({ roots: [root] }).validate("alias.txt", "read"));
  }));
test("Windows actual path case and slash aliases", { skip: process.platform !== "win32" }, () =>
  fixture(async (root) => {
    await fs.writeFile(path.join(root, "Case.txt"), "hello");
    assert.equal(
      await new PathGuard({ roots: [root] }).validate(root.toUpperCase().replaceAll("\\", "/") + "/case.txt", "read"),
      await fs.realpath(path.join(root, "Case.txt")),
    );
  }),
);
test("Windows ADS and device aliases rejected", { skip: process.platform !== "win32" }, () =>
  fixture(async (root) => {
    for (const p of ["file.txt:stream", "NUL.txt", "file.txt."])
      await assert.rejects(new PathGuard({ roots: [root] }).validate(p, "write"));
  }),
);
const matrix: Array<[string, RiskLevel, SideEffect]> = [
  ["npm test", "LOW", "EXECUTION"],
  ["npm run build", "LOW", "EXECUTION"],
  ["npm install", "MEDIUM", "INSTALL"],
  ["git status", "LOW", "READ_ONLY"],
  ["git diff", "LOW", "READ_ONLY"],
  ["git branch", "LOW", "READ_ONLY"],
  ["git branch -D feature", "HIGH", "DELETE"],
  ["git reset --hard", "CRITICAL", "DELETE"],
  ["git clean -fd", "CRITICAL", "DELETE"],
  ["git push", "HIGH", "NETWORK"],
  ["git push --force", "CRITICAL", "DELETE"],
  ["echo hello", "LOW", "READ_ONLY"],
  ["echo hello > file", "HIGH", "WRITE"],
  ["echo hello >> file", "HIGH", "WRITE"],
  ["cat file", "LOW", "READ_ONLY"],
  ["cat file | grep test", "LOW", "READ_ONLY"],
  ["python script.py", "HIGH", "UNKNOWN"],
  ["python -c 'print(1)'", "HIGH", "UNKNOWN"],
  ["node -e 'console.log(1)'", "HIGH", "UNKNOWN"],
  ["cmd /c echo hello", "HIGH", "UNKNOWN"],
  ["powershell -Command 'Remove-Item x'", "HIGH", "DELETE"],
  ["Remove-Item x", "HIGH", "DELETE"],
  ["echo ok && rm -rf x", "CRITICAL", "DELETE"],
  ["echo ok || rm -rf x", "CRITICAL", "DELETE"],
  ["echo ok ; rm -rf x", "CRITICAL", "DELETE"],
  ["echo ok | rm -rf x", "CRITICAL", "DELETE"],
  ["echo $(whoami)", "HIGH", "UNKNOWN"],
  ["echo `whoami`", "HIGH", "UNKNOWN"],
  ["echo x 2> f", "HIGH", "WRITE"],
  ["echo x 2>> f", "HIGH", "WRITE"],
  ["echo x &> f", "HIGH", "WRITE"],
  ["cat < f", "HIGH", "WRITE"],
  ["echo ok & python -c x", "HIGH", "UNKNOWN"],
  ["Set-Content x hello", "HIGH", "WRITE"],
  ["Add-Content x hi", "HIGH", "WRITE"],
  ["Move-Item x y", "HIGH", "WRITE"],
  ["Invoke-Expression x", "CRITICAL", "SYSTEM"],
  ["Start-Process x", "HIGH", "SYSTEM"],
  ['cmd /c "git reset --hard"', "CRITICAL", "DELETE"],
  ["git branch feature", "MEDIUM", "WRITE"],
];
for (const [cmd, risk, effect] of matrix)
  test("command matrix: " + cmd, () => {
    const result = assessCommand(cmd);
    assert.equal(result.level, risk);
    assert.ok(result.effects.includes(effect));
  });
function rig() {
  let count = 0;
  const registry = new ToolRegistry(),
    schema = z.object({ path: z.string() });
  registry.register({
    name: "test",
    description: "Test tool",
    domain: "files",
    action: "write",
    baseRisk: "HIGH",
    input: schema,
    output: z.number(),
    describe: () => "test",
    execute: async () => ++count,
  });
  const permissions = new PermissionManager({ policies });
  return {
    dispatcher: new ToolDispatcher(registry, permissions, new InMemoryAuditSink()),
    permissions,
    count: () => count,
  };
}
function request(
  root: string,
  askUser: () => Promise<"once" | "task" | "always" | "deny">,
  signal = new AbortController().signal,
  taskId = "t",
) {
  return { taskId, userId: "u", toolName: "test", input: { path: "a" }, workspaceRoot: root, signal, askUser };
}
test("dispatcher once authorizes exactly one execution", async () => {
  const r = rig();
  let prompts = 0;
  const req = request("root", async () => {
    prompts++;
    return "once";
  });
  await r.dispatcher.dispatch(req);
  await r.dispatcher.dispatch(req);
  assert.equal(prompts, 2);
  assert.equal(r.count(), 2);
});
test("concurrent identical requests cannot reuse once", async () => {
  const r = rig();
  let prompts = 0;
  const req = request("root", async () => {
    const own = ++prompts;
    await Promise.resolve();
    return own === 1 ? "once" : "deny";
  });
  const settled = await Promise.allSettled([r.dispatcher.dispatch(req), r.dispatcher.dispatch(req)]);
  assert.equal(prompts, 2);
  assert.ok(r.count() <= 1);
  assert.ok(settled.some((s) => s.status === "rejected"));
});
test("task grants do not cross task boundaries", async () => {
  const r = rig();
  let prompts = 0;
  const ask = async () => {
    prompts++;
    return "task" as const;
  };
  await r.dispatcher.dispatch(request("root", ask));
  await r.dispatcher.dispatch(request("root", ask));
  await r.dispatcher.dispatch(request("root", ask, undefined, "other"));
  assert.equal(prompts, 2);
});
test("cancellation while permission pending executes nothing", async () => {
  const r = rig(),
    ac = new AbortController();
  let release: (s: "once") => void = () => {};
  const answer = new Promise<"once">((resolve) => {
    release = resolve;
  });
  const dispatched = r.dispatcher.dispatch(request("root", () => answer, ac.signal));
  ac.abort();
  release("once");
  await assert.rejects(dispatched);
  assert.equal(r.count(), 0);
});
const noop = async () => ({ ok: true, summary: "ok" });
test("cancel after model response prevents tool", async () => {
  const ac = new AbortController();
  let calls = 0;
  const driver: AgentDriver = {
    next: async () => {
      ac.abort();
      return { label: "x", call: { tool: "x", action: "x", input: {} } };
    },
    execute: async () => {
      calls++;
      return noop();
    },
    verify: noop,
  };
  const r = await runAgent({ taskId: "t", driver, signal: ac.signal });
  assert.equal(r.reason, "cancelled");
  assert.equal(calls, 0);
});
test("hanging model obeys real deadline", async () => {
  const driver: AgentDriver = { next: () => new Promise(() => {}), execute: noop, verify: noop };
  const start = Date.now();
  const r = await runAgent({ taskId: "t", driver, limits: { maxDurationMs: 30 } });
  assert.equal(r.reason, "timeout");
  assert.ok(Date.now() - start < 1000);
});
test("cancel while model pending resolves promptly", async () => {
  const ac = new AbortController();
  const driver: AgentDriver = { next: () => new Promise(() => {}), execute: noop, verify: noop };
  const promise = runAgent({ taskId: "t", driver, signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  assert.equal((await promise).reason, "cancelled");
});
test("timeout during hanging tool", async () => {
  const driver: AgentDriver = {
    next: async () => ({ label: "x", call: { tool: "x", action: "x", input: {} } }),
    execute: () => new Promise(() => {}),
    verify: noop,
  };
  assert.equal((await runAgent({ taskId: "t", driver, limits: { maxDurationMs: 25 } })).reason, "timeout");
});
test("deadline at completion cannot become completed", async () => {
  let clock = 0;
  let verified = false;
  const driver: AgentDriver = {
    next: async () => {
      clock = 10;
      return { label: "done", call: null, done: true };
    },
    execute: noop,
    verify: async () => {
      verified = true;
      return noop();
    },
  };
  const r = await runAgent({ taskId: "t", driver, now: () => clock, limits: { maxDurationMs: 10 } });
  assert.equal(r.reason, "timeout");
  assert.equal(verified, false);
});
test("timeout inside verification cannot become completed", async () => {
  let clock = 0;
  const driver: AgentDriver = {
    next: async () => ({ label: "done", call: null, done: true }),
    execute: noop,
    verify: async () => {
      clock = 11;
      return noop();
    },
  };
  assert.equal(
    (await runAgent({ taskId: "t", driver, now: () => clock, limits: { maxDurationMs: 10 } })).reason,
    "timeout",
  );
});
test("cancel after first tool prevents second", async () => {
  const ac = new AbortController();
  let calls = 0;
  const driver: AgentDriver = {
    next: async () => ({ label: "x", call: { tool: "x", action: "x", input: {} } }),
    execute: async () => {
      calls++;
      ac.abort();
      return noop();
    },
    verify: noop,
  };
  assert.equal((await runAgent({ taskId: "t", driver, signal: ac.signal })).reason, "cancelled");
  assert.equal(calls, 1);
});
for (const op of ["create", "update", "delete", "rename", "move", "overwrite"])
  test("persistent undo restores " + op, () =>
    fixture(async (root, _outside, storage) => {
      const guard = new PathGuard({ roots: [root] }),
        undo = new UndoStore(storage),
        c = ctx(root);
      if (op !== "create") await fs.writeFile(path.join(root, "a.txt"), "original");
      if (op === "overwrite") await fs.writeFile(path.join(root, "b.txt"), "destination");
      if (op === "create" || op === "update")
        await createWriteTool(guard, undo).execute({ path: "a.txt", content: "changed" }, c);
      else if (op === "delete") await createDeleteTool(guard, undo).execute({ path: "a.txt" }, c);
      else
        await createMoveTool(guard, undo).execute(
          { from: "a.txt", to: op === "move" ? "nested/b.txt" : "b.txt", overwrite: op === "overwrite" },
          c,
        );
      const restarted = new UndoStore(storage);
      assert.ok(restarted.manifestFor("task").length);
      await restarted.restore("task", guard);
      if (op === "create") await assert.rejects(fs.access(path.join(root, "a.txt")));
      else assert.equal(await fs.readFile(path.join(root, "a.txt"), "utf8"), "original");
      if (op === "overwrite") assert.equal(await fs.readFile(path.join(root, "b.txt"), "utf8"), "destination");
    }),
  );
test("move rejects an existing destination without explicit overwrite", () =>
  fixture(async (root, _outside, storage) => {
    await fs.writeFile(path.join(root, "a"), "a");
    await fs.writeFile(path.join(root, "b"), "b");
    await assert.rejects(
      createMoveTool(new PathGuard({ roots: [root] }), new UndoStore(storage)).execute(
        { from: "a", to: "b" },
        ctx(root),
      ),
    );
    assert.equal(await fs.readFile(path.join(root, "b"), "utf8"), "b");
  }));
test("large diff has bounded memory and time", () => {
  const a = "a\n".repeat(30000),
    b = "b\n".repeat(30000),
    start = Date.now();
  assert.equal(diffLines(a, b).length, 60000);
  assert.ok(Date.now() - start < 2000);
});
test("large text and binary reads/writes rejected", () =>
  fixture(async (root, _outside, storage) => {
    const guard = new PathGuard({ roots: [root] }),
      undo = new UndoStore(storage),
      c = ctx(root);
    await fs.writeFile(path.join(root, "big"), "x".repeat(2_000_001));
    await fs.writeFile(path.join(root, "binary"), Buffer.from([0, 255, 1]));
    await assert.rejects(createReadTool(guard).execute({ path: "big" }, c));
    await assert.rejects(createReadTool(guard).execute({ path: "binary" }, c));
    await assert.rejects(createWriteTool(guard, undo).execute({ path: "minified", content: "x".repeat(1_000_001) }, c));
    await assert.rejects(createWriteTool(guard, undo).execute({ path: "binary2", content: "x\0y" }, c));
    await createWriteTool(guard, undo).execute({ path: "longline", content: "x".repeat(100000) }, c);
  }));
test("search bounds results and skips binary and huge files", () =>
  fixture(async (root) => {
    await fs.writeFile(path.join(root, "huge"), "needle".repeat(50000));
    await fs.writeFile(path.join(root, "binary"), "needle\0");
    for (let i = 0; i < 120; i++) await fs.writeFile(path.join(root, "f" + i), "needle");
    const result = await createSearchTool(new PathGuard({ roots: [root] }), root).execute(
      { query: "needle" },
      ctx(root),
    );
    assert.equal(result.matches.length, 100);
    assert.equal(result.truncated, true);
    assert.ok(!result.matches.some((m) => ["huge", "binary"].includes(m.path)));
  }));
test("router rejects unconfigured provider", async () => {
  const provider: AIProvider = {
    id: "anthropic",
    isConfigured: async () => false,
    models: () => [],
    complete: () => {
      throw new Error("Must not call");
    },
  };
  await assert.rejects(
    new AIRouter(new Map([["anthropic", provider]]), []).route({
      kind: "code",
      offline: false,
      requireTools: true,
      approxInputTokens: 1,
    }),
    AIProviderNotConfiguredError,
  );
});
