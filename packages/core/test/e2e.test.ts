import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AIProvider, CompletionRequest, CompletionResult, ModelDescriptor } from "../src/ai/router.js";
import { createOrbitServer } from "../src/server.js";
import { UndoStore } from "../src/tools/undo-store.js";
import { PathGuard } from "../src/security/path-guard.js";
import { AnthropicProvider } from "../src/ai/providers/anthropic.js";
import { InMemorySecretStore } from "../src/security/secret-store.js";
const model: ModelDescriptor = {
  provider: "anthropic",
  model: "fixture-model",
  contextWindow: 200000,
  inputCostPerMTok: 0,
  outputCostPerMTok: 0,
  tier: "balanced",
  supportsTools: true,
  local: false,
};
function result(text: string, toolName?: string, args: unknown = {}, id = ""): CompletionResult {
  return {
    text,
    toolCalls: toolName ? [{ toolCallId: id, toolName, arguments: args }] : [],
    usage: { inputTokens: 1, outputTokens: 1 },
    model: model.model,
  };
}
class FixtureProvider implements AIProvider {
  readonly id = "anthropic";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly mode: "fix" | "fail" | "hang" | "unconfigured" = "fix") {}
  isConfigured(): Promise<boolean> {
    return Promise.resolve(this.mode !== "unconfigured");
  }
  models(): ModelDescriptor[] {
    return [model];
  }
  complete(_model: string, request: CompletionRequest): Promise<CompletionResult> {
    const serializable = { ...request };
    delete serializable.signal;
    this.requests.push(structuredClone(serializable));
    const n = this.requests.length;
    if (this.mode === "hang") return new Promise(() => {});
    if (n === 1) return Promise.resolve(result("Run the tests, inspect math.js, propose a minimal fix, then verify."));
    if (this.mode === "fail") return Promise.resolve(result("I cannot repair this project."));
    if (n === 2) return Promise.resolve(result("", "TerminalTool.run", { command: "npm test" }, "call-test-before"));
    if (n === 3) return Promise.resolve(result("", "FileTool.read", { path: "src/math.js" }, "call-read"));
    if (n === 4)
      return Promise.resolve(
        result(
          "",
          "FileTool.write",
          { path: "src/math.js", content: "export function add(a, b) {\n  return a + b;\n}\n" },
          "call-write",
        ),
      );
    if (n === 5) return Promise.resolve(result("", "TerminalTool.run", { command: "npm test" }, "call-test-after"));
    return Promise.resolve(result("Fixed the arithmetic operation."));
  }
}
interface Status {
  current: null | { id: string; running: boolean; result?: { reason: string; verified: boolean } };
  pending: Array<{ id: string; kind: string }>;
  events: Array<{ type: string; data: Record<string, unknown> }>;
}
async function setup(
  mode: "fix" | "fail" | "hang" | "unconfigured",
  fn: (v: {
    base: string;
    root: string;
    state: string;
    provider: FixtureProvider;
    get: () => Promise<Status>;
    post: (url: string, data?: unknown) => Promise<Response>;
    token: string;
    origin: string;
  }) => Promise<void>,
) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-e2e-"));
  const root = path.join(base, "workspace"),
    state = path.join(base, "state");
  await fs.cp(path.resolve("demos/failing-add"), root, { recursive: true });
  const provider = new FixtureProvider(mode);
  const server = await createOrbitServer({
    workspace: root,
    stateDirectory: state,
    uiDirectory: process.cwd(),
    provider,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const origin = "http://127.0.0.1:" + addr.port;
  const html = await (await fetch(origin)).text(),
    token = /name="orbit-token" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(token);
  const post = (url: string, data: unknown = {}) =>
    fetch(origin + url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-orbit-token": token },
      body: JSON.stringify(data),
    });
  const get = async () => (await (await fetch(origin + "/api/status")).json()) as Status;
  try {
    await fn({ base, root, state, provider, get, post, token, origin });
  } finally {
    await post("/api/stop").catch(() => {});
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    if (path.dirname(path.resolve(base)) !== path.resolve(os.tmpdir()) || !path.basename(base).startsWith("orbit-e2e-"))
      assert.fail("Invalid cleanup root");
    await fs.rm(base, { recursive: true, force: true });
  }
}
async function finish(
  get: () => Promise<Status>,
  post: (url: string, data?: unknown) => Promise<Response>,
): Promise<Status> {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const s = await get();
    for (const p of s.pending) {
      const r = await post("/api/answer", { id: p.id, answer: p.kind === "permission" ? "once" : "approve" });
      assert.equal(r.status, 200);
    }
    if (s.current && !s.current.running) return s;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Acceptance test deadline exceeded");
}
test("real local HTTP flow: plan, tools, diff, permissions, tests, verification, audit, persistent undo", () =>
  setup("fix", async ({ root, state, provider, get, post }) => {
    const original = await fs.readFile(path.join(root, "src/math.js"), "utf8");
    assert.equal((await post("/api/task", { request: "Find and fix the failing test." })).status, 202);
    const s = await finish(get, post);
    assert.equal(s.current?.result?.reason, "completed");
    assert.equal(s.current?.result?.verified, true);
    assert.match(await fs.readFile(path.join(root, "src/math.js"), "utf8"), /return a \+ b/);
    for (const event of [
      "plan.created",
      "plan.approved",
      "diff.created",
      "diff.approved",
      "permission.required",
      "tool.started",
      "verification.passed",
      "agent.completed",
    ])
      assert.ok(
        s.events.some((e) => e.type === event),
        event,
      );
    const toolMessages = provider.requests.at(-1)!.messages.filter((m) => m.role === "tool");
    assert.deepEqual(
      toolMessages.map((m) => m.toolCallId),
      ["call-test-before", "call-read", "call-write", "call-test-after"],
    );
    assert.equal(toolMessages[0]!.status, "error");
    assert.equal(toolMessages.at(-1)?.status, "ok");
    const audit = await fs.readFile(path.join(state, "audit.jsonl"), "utf8");
    assert.match(audit, /tool.write/);
    assert.match(audit, /verification.passed/);
    const restarted = new UndoStore(path.join(state, "undo"));
    await restarted.restore(s.current.id, new PathGuard({ roots: [root] }));
    assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), original);
  }));
test("unfixed real test produces failed verification, never completed", () =>
  setup("fail", async ({ get, post }) => {
    await post("/api/task", { request: "Fix the failing test." });
    const s = await finish(get, post);
    assert.equal(s.current?.result?.reason, "failed");
    assert.equal(s.current?.result?.verified, false);
    assert.ok(s.events.some((e) => e.type === "verification.failed"));
  }));
test("HTTP cancellation before plan approval prevents tool execution", () =>
  setup("fix", async ({ get, post, root }) => {
    const original = await fs.readFile(path.join(root, "src/math.js"), "utf8");
    await post("/api/task", { request: "Fix the failing test." });
    await post("/api/stop");
    const s = await finish(get, post);
    assert.equal(s.current?.result?.reason, "cancelled");
    assert.ok(!s.events.some((e) => e.type === "tool.started"));
    assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), original);
  }));
test("HTTP missing provider returns typed configuration error", () =>
  setup("unconfigured", async ({ post }) => {
    const r = await post("/api/task", { request: "Fix." });
    assert.equal(r.status, 409);
    assert.equal(((await r.json()) as { code: string }).code, "AI_PROVIDER_NOT_CONFIGURED");
  }));
test("HTTP rejects cross-origin mutation without local token", () =>
  setup("fix", async ({ origin }) => {
    const r = await fetch(origin + "/api/stop", { method: "POST", headers: { origin: "https://untrusted.example" } });
    assert.equal(r.status, 403);
  }));
test("Anthropic native tool IDs and tool_result wire format are preserved", async () => {
  const saved = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    assert.equal(typeof init?.body, "string");
    body = JSON.parse(init?.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        model: "model",
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: "tool_use", id: "id-next", name: "FileTool__read", input: { path: "a" } }],
      }),
      { status: 200 },
    );
  };
  try {
    const store = new InMemorySecretStore();
    store.set("ANTHROPIC_API_KEY", "fixture-only");
    const r = await new AnthropicProvider(store).complete("model", {
      system: "system",
      maxTokens: 10,
      messages: [
        { role: "user", content: "read" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ toolCallId: "id-before", toolName: "FileTool.read", arguments: { path: "a" } }],
        },
        { role: "tool", toolCallId: "id-before", toolName: "FileTool.read", status: "ok", output: "content" },
      ],
    });
    assert.equal(r.toolCalls[0]?.toolCallId, "id-next");
    assert.equal(r.toolCalls[0]?.toolName, "FileTool.read");
    const text = JSON.stringify(body);
    assert.match(text, /"tool_use_id":"id-before"/);
    assert.match(text, /"type":"tool_result"/);
    assert.match(text, /"name":"FileTool__read"/);
  } finally {
    globalThis.fetch = saved;
  }
});

test("rejecting a real diff leaves the file unchanged", () =>
  setup("fix", async ({ root, get, post }) => {
    const original = await fs.readFile(path.join(root, "src/math.js"), "utf8");
    await post("/api/task", { request: "Fix the failing test." });
    const end = Date.now() + 10000;
    let rejected = false;
    while (Date.now() < end) {
      const s = await get();
      for (const p of s.pending) {
        const answer = p.kind === "diff" ? "reject" : p.kind === "permission" ? "once" : "approve";
        if (p.kind === "diff") rejected = true;
        await post("/api/answer", { id: p.id, answer });
      }
      if (s.current && !s.current.running) {
        assert.notEqual(s.current.result?.reason, "completed");
        break;
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.equal(rejected, true);
    assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), original);
    assert.ok((await get()).events.some((e) => e.type === "diff.rejected"));
  }));
test("verification rejects tampered test input even when command would pass", () =>
  setup("fail", async ({ root, get, post }) => {
    await post("/api/task", { request: "Fix." });
    await fs.writeFile(path.join(root, "test/math.test.js"), 'import test from "node:test";test("fake",()=>{});');
    const s = await finish(get, post);
    assert.equal(s.current?.result?.reason, "failed");
    assert.ok(s.events.some((e) => e.type === "verification.failed"));
  }));
test("stale permission response after stop cannot start the command", () =>
  setup("fix", async ({ get, post }) => {
    await post("/api/task", { request: "Fix." });
    let pendingId = "";
    const end = Date.now() + 5000;
    while (Date.now() < end && !pendingId) {
      const s = await get();
      for (const p of s.pending) {
        if (p.kind === "plan") await post("/api/answer", { id: p.id, answer: "approve" });
        else if (p.kind === "permission") pendingId = p.id;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(pendingId);
    await post("/api/stop");
    assert.equal((await post("/api/answer", { id: pendingId, answer: "once" })).status, 409);
    const s = await finish(get, post);
    assert.equal(s.current?.result?.reason, "cancelled");
    assert.ok(!s.events.some((e) => e.type === "tool.started"));
  }));

test("a file changed while write permission is pending is not overwritten by a stale diff", () =>
  setup("fix", async ({ root, get, post }) => {
    await post("/api/task", { request: "Fix the failing test." });
    let reviewed = false,
      changed = false;
    const end = Date.now() + 12000;
    const manual = "export function add() { return 9; }\n";
    while (Date.now() < end) {
      const s = await get();
      for (const p of s.pending) {
        if (p.kind === "diff") reviewed = true;
        else if (p.kind === "permission" && reviewed && !changed) {
          await fs.writeFile(path.join(root, "src/math.js"), manual);
          changed = true;
        }
        await post("/api/answer", { id: p.id, answer: p.kind === "permission" ? "once" : "approve" });
      }
      if (s.current && !s.current.running) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.equal(changed, true);
    assert.equal(await fs.readFile(path.join(root, "src/math.js"), "utf8"), manual);
    assert.notEqual((await get()).current?.result?.reason, "completed");
  }));
