import test from "node:test";
import assert from "node:assert/strict";
import { resolveBrainAliases, modelProvenance, brainLabel } from "../src/ai/brain-aliases.js";
import { candidateCatalog } from "../src/ai/candidate-catalog.js";
import { strongerBrainCases, practicalCoreScore, coreWeights } from "../src/ai/brain-eval.js";
import { IntelligenceSettings, chooseModel } from "../src/ai/intelligence.js";
import type { ModelDescriptor } from "../src/ai/router.js";

test("role aliases preserve exact underlying identity and disclose unknown provenance", () => {
  const roles = resolveBrainAliases({
    Main: { provider: "local", model: "third-party:8b", digest: "d1", benchmarkId: "b1" },
  });
  assert.equal(roles[0]?.alias, "COSMO Core");
  assert.equal(roles[0]?.underlyingModelId, "third-party:8b");
  assert.equal(roles[0]?.benchmarkId, "b1");
  assert.equal(brainLabel({ auto: true }), "COSMO · Auto");
  assert.equal(modelProvenance({ model: "custom:8b", provider: "local" }).license, "UNKNOWN");
});
test("catalog provenance requires exact digest, not an attractive model name", () => {
  const c = candidateCatalog[0];
  assert.equal(modelProvenance({ model: c.model, provider: "local", metadata: { digest: c.digest } }).source, c.source);
  assert.equal(
    modelProvenance({ model: c.model, provider: "local", metadata: { digest: "modified" } }).source,
    "UNKNOWN",
  );
  assert.ok(candidateCatalog.every((c) => c.downloadBytes > 0 && /^[a-f0-9]{64}$/.test(c.digest)));
});
test("expanded suite has independent final-answer tasks and transparent missing scores", () => {
  assert.ok(strongerBrainCases.filter((c) => c.category === "reasoning").length >= 10);
  assert.equal(practicalCoreScore([]), null);
  assert.ok(Math.abs(Object.values(coreWeights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(practicalCoreScore(Object.keys(coreWeights).map((category) => ({ category, passed: true }))), 1);
  for (const language of ["english", "russian", "ukrainian"])
    assert.ok(strongerBrainCases.filter((c) => c.category === language).length >= 5);
});
test("Logic role cannot bypass local privacy or verified image capability", () => {
  const base: ModelDescriptor = {
    provider: "local",
    model: "baseline",
    local: true,
    contextWindow: 8192,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: false,
    capabilities: {
      text: true,
      streaming: true,
      vision: false,
      toolCalling: false,
      structuredOutput: null,
      contextWindow: 8192,
    },
  };
  const other = { ...base, model: "logic" };
  const settings = IntelligenceSettings.parse({
    auto: true,
    mode: "deep",
    roles: { Logic: { provider: "local", model: "logic" } },
  });
  assert.equal(chooseModel([base, other], settings).model, "logic");
  assert.equal(chooseModel([base, { ...other, local: false }], settings, {}, true).model, "baseline");
  assert.throws(() => chooseModel([other], settings, { vision: true }), /Vision/);
});

test("session stickiness requires comparable quality and preserves manual, privacy and capability gates", () => {
  const old: ModelDescriptor = {
    provider: "local",
    model: "old",
    local: true,
    contextWindow: 8192,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: false,
    metadata: { digest: "old-d", benchmarkSuite: "same", benchmarkPassRate: 0.8, coreScore: 0.8 },
    capabilities: {
      text: true,
      streaming: true,
      vision: false,
      toolCalling: false,
      structuredOutput: true,
      contextWindow: 8192,
    },
  };
  const newer: ModelDescriptor = {
    ...old,
    model: "new",
    metadata: { digest: "new-d", benchmarkSuite: "same", benchmarkPassRate: 0.83, coreScore: 0.83 },
  };
  const needs = { previousBrain: { provider: "local", model: "old", digest: "old-d" } };
  const settings = IntelligenceSettings.parse({ auto: true, roles: { Main: { provider: "local", model: "new" } } });
  assert.equal(chooseModel([old, newer], settings, needs, true).model, "old");
  assert.equal(
    chooseModel([old, newer], settings, { previousBrain: { ...needs.previousBrain, digest: "changed" } }, true).model,
    "new",
  );
  assert.equal(chooseModel([{ ...old, local: false }, newer], settings, needs, true).model, "new");
  assert.equal(
    chooseModel([old, { ...newer, metadata: { ...newer.metadata, coreScore: 0.95 } }], settings, needs, true).model,
    "new",
  );
  assert.equal(chooseModel([old, newer], { ...settings, manualRole: "Main" }, needs, true).model, "new");
  assert.equal(chooseModel([old, newer], settings, needs, true, { provider: "local", model: "new" }).model, "new");
  assert.equal(
    chooseModel(
      [old, { ...newer, capabilities: { ...newer.capabilities!, vision: true } }],
      settings,
      { ...needs, vision: true },
      true,
    ).model,
    "new",
  );
});
