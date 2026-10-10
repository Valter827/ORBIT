import test from "node:test";
import assert from "node:assert/strict";
import {
  PermissionManager,
  type PermissionRequest,
  type ToolDomain,
  type DomainPolicy,
} from "../src/permissions/manager.js";
import {
  runAgent,
  PermissionDeniedError,
  type AgentDriver,
  type AgentDecision,
  type ToolOutcome,
} from "../src/agent/engine.js";
import { filterContext, type ContextSnapshot } from "../src/context/filter.js";

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

function request(over: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    domain: "files",
    action: "write",
    target: "src/auth/session.ts",
    reason: "Apply the fix to the session helper.",
    risk: "MEDIUM",
    taskId: "task_1",
    ...over,
  };
}

test("an allowed domain passes low-risk actions without prompting", () => {
  const pm = new PermissionManager({ policies });
  assert.equal(pm.evaluate(request({ risk: "LOW" })).outcome, "allow");
});

test("a denied domain can never be granted", () => {
  const pm = new PermissionManager({ policies });
  const d = pm.evaluate(request({ domain: "screen", action: "capture", risk: "LOW" }));
  assert.equal(d.outcome, "deny");
});

test("CRITICAL actions always prompt, even with a standing grant", () => {
  const pm = new PermissionManager({ policies });
  const req = request({ domain: "terminal", action: "run", target: "rm -rf dist", risk: "CRITICAL" });
  pm.resolve(req, "always");
  assert.equal(pm.evaluate(req).outcome, "ask");
});

test("'allow once' is consumed after a single use", () => {
  const pm = new PermissionManager({ policies });
  const req = request({ domain: "terminal", action: "run", target: "npm test", risk: "MEDIUM" });
  assert.equal(pm.evaluate(req).outcome, "ask");
  pm.resolve(req, "once");
  assert.equal(pm.evaluate(req).outcome, "ask");
  assert.equal(pm.evaluate(req).outcome, "ask");
});

test("'always' on a HIGH-risk action is downgraded to task scope", () => {
  const pm = new PermissionManager({ policies });
  const req = request({ domain: "terminal", action: "run", target: "curl https://x", risk: "HIGH" });
  pm.resolve(req, "always");
  assert.equal(pm.evaluate(req).outcome, "allow");
  pm.endTask("task_1");
  assert.equal(pm.evaluate(req).outcome, "ask");
});

test("a grant for one target does not cover another", () => {
  const pm = new PermissionManager({ policies });
  pm.resolve(request({ domain: "terminal", action: "run", target: "npm test" }), "task");
  const other = request({ domain: "terminal", action: "run", target: "npm publish" });
  assert.equal(pm.evaluate(other).outcome, "ask");
});

test("a grant for one task does not leak into another task", () => {
  const pm = new PermissionManager({ policies });
  pm.resolve(request({ domain: "terminal", action: "run", target: "npm test" }), "task");
  const otherTask = request({ domain: "terminal", action: "run", target: "npm test", taskId: "task_2" });
  assert.equal(pm.evaluate(otherTask).outcome, "ask");
});

test("'always' grants expire", () => {
  let now = 1_000;
  const pm = new PermissionManager({ policies, now: () => now, alwaysTtlMs: 500 });
  const req = request({ domain: "git", action: "commit", target: "*", risk: "MEDIUM" });
  pm.resolve(req, "always");
  assert.equal(pm.evaluate(req).outcome, "allow");
  now = 2_000;
  assert.equal(pm.evaluate(req).outcome, "ask");
});

// --- Agent engine ------------------------------------------------------

function driverOf(decisions: AgentDecision[], execute: (i: number) => ToolOutcome, verifyOk = true): AgentDriver {
  let calls = 0;
  return {
    async next(history) {
      return decisions[Math.min(history.length, decisions.length - 1)] as AgentDecision;
    },
    async execute() {
      return execute(calls++);
    },
    async verify() {
      return { ok: verifyOk, summary: verifyOk ? "Tests pass." : "Tests still fail." };
    },
  };
}

test("a task completes only after verification passes", async () => {
  const driver = driverOf(
    [
      { label: "Read file", call: { tool: "FileTool", action: "read", input: { path: "a.ts" } } },
      { label: "Done", call: null, done: true },
    ],
    () => ({ ok: true, summary: "read" }),
  );
  const result = await runAgent({ taskId: "t", driver });
  assert.equal(result.reason, "completed");
  assert.equal(result.verified, true);
});

test("failed verification does not report success", async () => {
  const driver = driverOf([{ label: "Done", call: null, done: true }], () => ({ ok: true, summary: "" }), false);
  const result = await runAgent({ taskId: "t", driver });
  assert.equal(result.reason, "failed");
  assert.equal(result.verified, false);
});

test("loop detection stops a repeating agent", async () => {
  const same = { label: "Reading", call: { tool: "FileTool", action: "read", input: { path: "a.ts" } } };
  const driver = driverOf([same], () => ({ ok: true, summary: "read" }));
  const result = await runAgent({ taskId: "t", driver, limits: { repeatThreshold: 3 } });
  assert.equal(result.reason, "loop_detected");
});

test("the step limit is enforced even when each call differs", async () => {
  let i = 0;
  const driver: AgentDriver = {
    async next() {
      return { label: `Step ${i}`, call: { tool: "FileTool", action: "read", input: { n: i++ } } };
    },
    async execute() {
      return { ok: true, summary: "ok" };
    },
    async verify() {
      return { ok: true, summary: "" };
    },
  };
  const result = await runAgent({ taskId: "t", driver, limits: { maxSteps: 5 } });
  assert.equal(result.reason, "step_limit");
  assert.ok(result.steps.length <= 5);
});

test("a denied permission ends the task immediately", async () => {
  const driver: AgentDriver = {
    async next() {
      return { label: "Delete", call: { tool: "TerminalTool", action: "run", input: { cmd: "rm -rf x" } } };
    },
    async execute() {
      throw new PermissionDeniedError("You declined this action.");
    },
    async verify() {
      return { ok: true, summary: "" };
    },
  };
  const result = await runAgent({ taskId: "t", driver });
  assert.equal(result.reason, "denied");
  assert.equal(result.verified, false);
});

test("repeated failures stop at the retry limit", async () => {
  const driver = driverOf(
    [{ label: "Build", call: { tool: "TerminalTool", action: "run", input: { cmd: "npm run build" } } }],
    () => ({ ok: false, summary: "build failed" }),
  );
  const result = await runAgent({ taskId: "t", driver, limits: { maxRetriesPerStep: 2, repeatThreshold: 99 } });
  assert.equal(result.reason, "retry_limit");
});

test("cancellation is honoured", async () => {
  const controller = new AbortController();
  controller.abort();
  const driver = driverOf([{ label: "x", call: null }], () => ({ ok: true, summary: "" }));
  const result = await runAgent({ taskId: "t", driver, signal: controller.signal });
  assert.equal(result.reason, "cancelled");
});

test("the timeout budget stops long tasks", async () => {
  let clock = 0;
  const driver: AgentDriver = {
    async next() {
      clock += 1000;
      return { label: "tick", call: null };
    },
    async execute() {
      return { ok: true, summary: "" };
    },
    async verify() {
      return { ok: true, summary: "" };
    },
  };
  const result = await runAgent({
    taskId: "t",
    driver,
    now: () => clock,
    limits: { maxDurationMs: 3000, maxSteps: 100 },
  });
  assert.equal(result.reason, "timeout");
});

// --- Context filter ----------------------------------------------------

const snapshot: ContextSnapshot = {
  capturedAt: 1,
  project: { name: "DevMemory", root: "/p", stack: ["Next.js", "Prisma"] },
  activeApplication: { name: "Code", title: "session.ts" },
  activeFile: { path: "src/auth/session.ts", language: "ts" },
  workspace: { openFiles: ["a.ts"] },
  terminalState: { cwd: "/p", recentCommands: ["npm test"], recentOutput: ["TOKEN=ghp_AAAAAAAAAAAAAAAAAAAAAAAAA"] },
  gitState: { branch: "main", modified: ["src/auth/session.ts"], recentCommits: ["fix auth"] },
  browserState: { tabs: [{ title: "docs", url: "https://x" }] },
  screenState: { enabled: false, capturedAt: null },
  recentActions: [],
  recentErrors: ["JWT malformed"],
};

test("screen state is excluded while Screen Mode is off", () => {
  const r = filterContext(snapshot, { budgetChars: 10_000, disabled: new Set(), query: "what is on my screen" });
  assert.ok(r.droppedKeys.includes("screenState"));
});

test("disabled sources never reach the prompt", () => {
  const r = filterContext(snapshot, {
    budgetChars: 10_000,
    disabled: new Set(["browserState"]),
    query: "check my open tabs",
  });
  assert.ok(!r.includedKeys.includes("browserState"));
});

test("the filter redacts secrets it carries through", () => {
  const r = filterContext(snapshot, { budgetChars: 10_000, disabled: new Set(), query: "terminal error" });
  assert.ok(!JSON.stringify(r.snapshot).includes("ghp_AAAAAAAAAAAAAAAAAAAAAAAAA"));
});

test("a tight budget drops low-priority sources first", () => {
  const r = filterContext(snapshot, { budgetChars: 120, disabled: new Set(), query: "why is auth broken" });
  assert.ok(r.approxChars <= 400);
  assert.ok(r.droppedKeys.length > 0);
});
