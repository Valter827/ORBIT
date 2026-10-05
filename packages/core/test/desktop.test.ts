import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDesktopHost } from "../src/desktop/host.js";
import { DesktopStore } from "../src/desktop/store.js";
import { FixtureProvider } from "./fixtures/desktop-provider.js";
import { createOrbitService } from "../src/service.js";
import type { AIProvider, CompletionRequest, CompletionResult } from "../src/ai/router.js";
interface Status {
  busy: boolean;
  configured: boolean;
  current: null | { id: string; running: boolean; result?: { reason: string; verified: boolean } };
  pending: { id: string; kind: string }[];
}
async function setup(
  fn: (v: {
    root: string;
    state: string;
    host: ReturnType<typeof createDesktopHost>;
    configure: () => Promise<unknown>;
  }) => Promise<void>,
  mode: "fix" | "hang" | "unconfigured" = "fix",
) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-desktop-"));
  const root = path.join(base, "workspace"),
    state = path.join(base, "state");
  await fs.cp(path.resolve("demos/failing-add"), root, { recursive: true });
  const host = createDesktopHost(() => {}, new FixtureProvider(mode));
  const configure = () => host.request("configure", { workspace: root, stateDirectory: state });
  try {
    await configure();
    await fn({ root, state, host, configure });
  } finally {
    await host.request("shutdown").catch(() => {});
    assert.ok(base.startsWith(os.tmpdir()));
    await fs.rm(base, { recursive: true, force: true });
  }
}
async function complete(host: ReturnType<typeof createDesktopHost>) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = (await host.request("status")) as Status;
    for (const p of status.pending)
      await host.request("answer", { id: p.id, answer: p.kind === "permission" ? "once" : "approve" });
    if (status.current && !status.busy) return status;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Desktop task did not settle");
}
test("desktop service: real file fix, tests, SQLite history, restart and undo without HTTP", () =>
  setup(async ({ root, state, host }) => {
    const before = await fs.readFile(path.join(root, "src/math.js"), "utf8");
    const { taskId } = (await host.request("start", { request: "Find and fix the failing test." })) as {
      taskId: string;
    };
    const status = await complete(host);
    assert.equal(status.current?.result?.reason, "completed");
    assert.equal(status.current?.result?.verified, true);
    assert.notEqual(await fs.readFile(path.join(root, "src/math.js"), "utf8"), before);
    const history = (await host.request("history")) as { status: string }[];
    assert.equal(history[0]?.status, "COMPLETED");
    await host.request("shutdown");
    const restarted = createDesktopHost(() => {});
    try {
      await restarted.request("configure", { workspace: root, stateDirectory: state });
      assert.equal(((await restarted.request("history")) as { status: string }[])[0]?.status, "COMPLETED");
      await restarted.request("undo", { taskId });
      assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), before);
      assert.equal(((await restarted.request("history")) as { status: string }[])[0]?.status, "UNDONE");
    } finally {
      await restarted.request("shutdown");
    }
  }));
test("desktop rejects workspace reconfiguration and undo during an active task", () =>
  setup(async ({ host, configure }) => {
    const { taskId } = (await host.request("start", { request: "Wait for approval" })) as { taskId: string };
    await assert.rejects(configure(), /active task/);
    await assert.rejects(host.request("undo", { taskId }), /running task/);
    await host.request("stop");
    const status = await complete(host);
    assert.equal(status.current?.result?.reason, "cancelled");
  }, "hang"));
test("desktop startup without API key and project still supports history", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-no-key-"));
  const host = createDesktopHost(() => {});
  try {
    await host.request("configure", { workspace: null, stateDirectory: base });
    assert.equal(((await host.request("status")) as Status).configured, false);
    assert.deepEqual(await host.request("history"), []);
    await assert.rejects(host.request("start", { request: "hello" }), /Select a project/);
    await assert.rejects(host.request("testConnection"), /No Anthropic/);
  } finally {
    await host.request("shutdown");
    await fs.rm(base, { recursive: true, force: true });
  }
});
test("desktop does not expose arbitrary shell or file operations", () =>
  setup(async ({ host, root }) => {
    await fs.writeFile(path.join(root, ".env"), "PRIVATE_KEY=secret");
    await assert.rejects(host.request("execute_any_shell_command", { command: "whoami" }), /Unknown desktop/);
    await assert.rejects(host.request("read", { file: ".env" }));
    await assert.rejects(host.request("read", { file: "../state/database/orbit.sqlite" }));
    await assert.rejects(host.request("files", { directory: ".." }));
  }));
test("desktop permission toggles block explicit file previews", () =>
  setup(async ({ host, root, state }) => {
    await host.request("configure", { workspace: root, stateDirectory: state, filesEnabled: false });
    await assert.rejects(host.request("read", { file: "src/math.js" }), /disabled/);
    await assert.rejects(host.request("files", {}), /disabled/);
  }));
test("desktop private state cannot be selected as workspace", () =>
  setup(async ({ host, state }) => {
    await assert.rejects(
      host.request("configure", { workspace: path.join(state, "database"), stateDirectory: state }),
      /private state/,
    );
  }));
test("desktop schema rejects unknown configuration fields", () =>
  setup(async ({ host, root, state }) => {
    await assert.rejects(host.request("configure", { workspace: root, stateDirectory: state, execute: "anything" }));
  }));
test("SQLite migrations are idempotent and crash recovery marks running tasks interrupted", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-sqlite-"));
  const first = new DesktopStore(directory);
  first.record(
    {
      type: "agent.created",
      taskId: "00000000-0000-4000-8000-000000000000",
      at: Date.now(),
      data: { request: "Repair" },
    },
    directory,
  );
  first.close();
  const second = new DesktopStore(directory);
  try {
    assert.equal(second.history()[0]?.["status"], "INTERRUPTED");
    assert.equal(second.events("00000000-0000-4000-8000-000000000000").length, 1);
  } finally {
    second.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("shutdown cancels a provider lookup before any task tools start", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-prepare-")),
    root = path.join(base, "workspace");
  await fs.mkdir(root);
  const provider: AIProvider = {
    id: "anthropic",
    isConfigured: () => new Promise(() => {}),
    models: () => [],
    complete: () => Promise.reject(new Error("Must not execute")),
  };
  const service = await createOrbitService({ workspace: root, stateDirectory: path.join(base, "state"), provider });
  try {
    const task = service.start({ request: "test" });
    const rejected = assert.rejects(task, /closing/);
    await service.shutdown();
    await rejected;
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("desktop pause prevents new tasks until resume", () =>
  setup(async ({ host }) => {
    await host.request("pause");
    await assert.rejects(host.request("start", { request: "test" }), /paused/);
    await host.request("resume");
    await host.request("start", { request: "test" });
    await host.request("stop");
    await complete(host);
  }, "hang"));

test("pausing an active task holds its next tool until resume", () =>
  setup(async ({ host, root }) => {
    const original = await fs.readFile(path.join(root, "src/math.js"), "utf8");
    await host.request("start", { request: "Find and fix the failing test." });
    let plan: Status["pending"][number] | undefined;
    for (let i = 0; i < 50 && !plan; i++) {
      plan = ((await host.request("status")) as Status).pending.find((p) => p.kind === "plan");
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(plan);
    await host.request("pause");
    await host.request("answer", { id: plan.id, answer: "approve" });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(((await host.request("status")) as Status).pending.length, 0);
    assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), original);
    await host.request("resume");
    assert.equal((await complete(host)).current?.result?.reason, "completed");
  }));
test("shutdown waits for terminal cancellation and audit before closing SQLite", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-shutdown-")),
    root = path.join(base, "workspace"),
    state = path.join(base, "state");
  await fs.cp(path.resolve("demos/failing-add"), root, { recursive: true });
  await fs.writeFile(
    path.join(root, "slow.cjs"),
    'setTimeout(()=>require("node:fs").writeFileSync("late.txt","unexpected"),1500);',
  );
  class SlowProvider extends FixtureProvider {
    override async complete(model: string, request: CompletionRequest): Promise<CompletionResult> {
      const result = await super.complete(model, request);
      if (this.requests.length === 2)
        return {
          ...result,
          toolCalls: [{ toolCallId: "slow", toolName: "TerminalTool.run", arguments: { command: "node slow.cjs" } }],
        };
      return result;
    }
  }
  let started = false;
  const host = createDesktopHost((topic, payload) => {
    if (topic === "event" && (payload as { type: string }).type === "tool.started") started = true;
  }, new SlowProvider());
  try {
    await host.request("configure", { workspace: root, stateDirectory: state });
    await host.request("start", { request: "Run the slow test" });
    for (let i = 0; i < 100 && !started; i++) {
      const status = (await host.request("status")) as Status;
      for (const pending of status.pending)
        await host.request("answer", { id: pending.id, answer: pending.kind === "permission" ? "once" : "approve" });
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(started);
    await new Promise((r) => setTimeout(r, 100));
    await host.request("shutdown");
    const audit = await fs.readFile(path.join(state, "logs/audit.jsonl"), "utf8");
    assert.ok(audit.includes("agent.cancelled"));
    await new Promise((r) => setTimeout(r, 1600));
    await assert.rejects(fs.stat(path.join(root, "late.txt")));
  } finally {
    await host.request("shutdown").catch(() => {});
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("desktop previews reject binary, oversized and malformed UTF-8 files", () =>
  setup(async ({ host, root }) => {
    await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0, 1, 2]));
    await fs.writeFile(path.join(root, "invalid.txt"), Buffer.from([0xff, 0xfe]));
    await fs.writeFile(path.join(root, "large.txt"), "a".repeat(200001));
    for (const file of ["binary.bin", "invalid.txt", "large.txt"]) await assert.rejects(host.request("read", { file }));
  }));
