import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRequest,
  planContext,
  IntelligenceSettings,
  chooseModel,
  capabilityRecord,
  verifyAnswer,
  selectEvidence,
  layeredContext,
  guardActionClaims,
  relevance,
} from "../src/ai/intelligence.js";
import { createProfile, importProfile } from "../src/ai/profiles.js";
import { estimateTokens } from "../src/ai/context.js";
import type { AIMessage, ModelDescriptor } from "../src/ai/router.js";

test("analyzer routes Russian and English requests without a model call", () => {
  assert.equal(analyzeRequest("Привет").casual, true);
  assert.equal(analyzeRequest("Что написано в моих заметках про auth?").knowledge, true);
  assert.equal(analyzeRequest("Какой язык я предпочитаю?").memory, true);
  assert.equal(analyzeRequest("Что на экране?").sense, true);
  assert.equal(analyzeRequest("Почему падает этот тест?").kind, "project");
  assert.equal(analyzeRequest("What is TCP?").kind, "factual");
  assert.equal(analyzeRequest("Проверь этот ответ").verify, true);
});
test("planner excludes unrelated personal and screen context, even in Deep", () => {
  for (const mode of ["fast", "balanced", "deep"] as const) {
    const hello = planContext("Привет", mode);
    assert.equal(hello.knowledge, false);
    assert.equal(hello.memory, false);
    assert.equal(hello.sense, false);
    assert.equal(planContext("What is React?", mode).sense, false);
  }
  assert.equal(planContext("What does my document say?", "fast").knowledge, true);
  assert.equal(planContext("What project preference did I save?", "balanced").memory, true);
  assert.equal(planContext("What is TCP?", "fast").knowledge, false);
});
const model = (id: string, changes: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  provider: "local",
  model: id,
  contextWindow: 8192,
  inputCostPerMTok: null,
  outputCostPerMTok: null,
  tier: "balanced",
  supportsTools: false,
  local: true,
  capabilities: {
    text: true,
    streaming: true,
    vision: false,
    toolCalling: false,
    structuredOutput: null,
    contextWindow: 8192,
  },
  ...changes,
});
test("Auto requires confirmed vision/tools, respects manual choice and explains no match", () => {
  const plain = model("plain"),
    vision = model("visual", { capabilities: { ...plain.capabilities!, vision: true } }),
    tools = model("tools", { supportsTools: true, capabilities: { ...plain.capabilities!, toolCalling: true } });
  const settings = IntelligenceSettings.parse({});
  assert.equal(chooseModel([plain, vision, tools], settings, { vision: true }).model, "visual");
  assert.equal(chooseModel([plain, vision, tools], settings, { tools: true }).model, "tools");
  assert.equal(chooseModel([plain, vision], settings, {}, false, { provider: "local", model: "plain" }).model, "plain");
  assert.throws(() => chooseModel([plain], settings, { vision: true }), /Vision/);
  assert.throws(() => chooseModel([plain], settings, { context: 16000 }), /context/);
});
test("Local Only rejects remote providers and cloud-backed local runtime models", () => {
  const remote = model("remote", { local: false, provider: "remote" }),
    cloud = model("model:cloud"),
    hidden = model("hidden", { metadata: { remote: true } });
  assert.throws(
    () => chooseModel([remote, cloud, hidden], IntelligenceSettings.parse({}), {}, true),
    /does not support/,
  );
  const unknown = model("unknown");
  delete unknown.capabilities;
  assert.equal(capabilityRecord(unknown).vision, null);
});
test("profile defaults and imported profiles cannot grant automatic cloud spending", () => {
  const profile = createProfile();
  assert.equal(profile.intelligence.cloud, "never");
  assert.equal(profile.intelligence.local, true);
  profile.intelligence.cloud = "allow";
  profile.intelligence.anthropic = true;
  profile.intelligence.compatible = true;
  const imported = importProfile(profile);
  assert.equal(imported.intelligence.cloud, "never");
  assert.equal(imported.intelligence.anthropic, false);
  assert.equal(imported.intelligence.compatible, false);
});
test("verification replaces a wrong draft using actual evidence, never model agreement", () => {
  const checked = verifyAnswer("What is the hottest planet?", "Mercury is the hottest planet.", [
    { sourceId: "nasa", name: "NASA evidence", text: "Venus is the hottest planet in our solar system." },
  ]);
  assert.doesNotMatch(checked.text, /Mercury/);
  assert.match(checked.text, /Venus/);
  assert.equal(checked.verification.status, "Partially verified");
  assert.equal(checked.verification.sources[0]?.text, "Venus is the hottest planet in our solar system.");
  assert.equal(verifyAnswer("What is the hottest planet?", "Mercury", []).verification.status, "Could not verify");
});
test("verification discloses contradictory sources and does not fabricate certainty", () => {
  const checked = verifyAnswer("What is the silver planet?", "The silver planet is Nereon.", [
    { sourceId: "a", name: "a.md", text: "The silver planet is Nereon." },
    { sourceId: "b", name: "b.md", text: "The silver planet is Xeron." },
  ]);
  assert.equal(checked.verification.status, "Sources found");
  assert.match(checked.text, /sources disagree/);
  assert.match(checked.text, /Nereon/);
  assert.match(checked.text, /Xeron/);
});
test("retrieval drops irrelevant and duplicate chunks and retains exact excerpts", () => {
  const sources = [
    { sourceId: "a", text: "Silver planet Nereon" },
    { sourceId: "b", text: "Silver planet Nereon" },
    { sourceId: "c", text: "Banana bread recipe" },
  ];
  assert.deepEqual(selectEvidence("silver planet", sources), [sources[0]]);
  assert.ok(relevance("Какой язык я предпочитаю?", "Preferred language = JavaScript.") > 0);
  assert.ok(relevance("Какая планета самая горячая?", "Venus is the hottest planet.") > 0);
});
test("long context preserves latest facts and complete tool exchanges within budget", () => {
  const messages: AIMessage[] = [];
  for (let n = 0; n < 35; n++)
    messages.push(
      {
        role: "user",
        content:
          n === 0 ? "Project goal: build Aurora." : "Old filler " + n + " ".repeat(10) + "paragraph ".repeat(100),
      },
      { role: "assistant", content: "Acknowledged." },
    );
  messages.push(
    { role: "user", content: "I now prefer TypeScript. Inspect current test." },
    { role: "assistant", content: "", toolCalls: [{ toolCallId: "t1", toolName: "read", arguments: {} }] },
    { role: "tool", toolCallId: "t1", toolName: "read", status: "ok", output: "current result" },
    { role: "assistant", content: "The current test uses TypeScript." },
  );
  const result = layeredContext({ system: "policy", messages, maxTokens: 512 }, 4096);
  assert.ok(result.removedTurns > 0);
  assert.match(result.summary, /Aurora/);
  assert.match(JSON.stringify(result.request.messages), /now prefer TypeScript/);
  assert.equal(result.request.messages.filter((m) => m.role === "tool").length, 1);
  assert.ok(estimateTokens({ system: result.request.system, messages: result.request.messages }) + 512 + 512 <= 4096);
});
test("cancelled context work stops before verification/model work", () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => layeredContext({ system: "", messages: [], maxTokens: 512, signal: controller.signal }, 4096),
    /abort|cancel|stopped/i,
  );
});
test("unperformed actions are not reported as successful", () => {
  assert.doesNotMatch(guardActionClaims("I changed your project.", false), /I changed/);
  assert.doesNotMatch(guardActionClaims("Я проверил экран.", false), /Я проверил/);
  assert.equal(guardActionClaims("Here is an example function.", false), "Here is an example function.");
});

test("a shared generic word does not attach an irrelevant Knowledge passage", () => {
  const result = selectEvidence("Какая планета самая горячая?", [
    { sourceId: "nasa", text: "Venus is the hottest planet." },
    { sourceId: "story", text: "The silver planet is Nereon." },
  ]);
  assert.deepEqual(
    result.map((s) => s.sourceId),
    ["nasa"],
  );
});
