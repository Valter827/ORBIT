import test from "node:test";
import assert from "node:assert/strict";
import { evaluatedBrains, evaluatedRoleBindings } from "../src/ai/evaluated-brains.js";
import type { ModelDescriptor } from "../src/ai/router.js";
test("measured presets require exact hardware, runtime and digests and never authorize cloud inference", () => {
  const models: ModelDescriptor[] = Object.entries(evaluatedBrains.assignments).map(([role, a]) => ({
    provider: "custom-local-id",
    model: a.model,
    local: true,
    contextWindow: 4096,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: false,
    metadata: { digest: a.digest, runtime: evaluatedBrains.runtime, runtimeVersion: evaluatedBrains.runtimeVersion },
    capabilities: {
      text: role !== "Embedding",
      streaming: true,
      vision: role === "Vision",
      toolCalling: false,
      structuredOutput: null,
      contextWindow: 4096,
    },
  }));
  const hardware = { ...evaluatedBrains.hardware };
  assert.equal(Object.keys(evaluatedRoleBindings(models, hardware)).length, 6);
  assert.equal(evaluatedRoleBindings(models, hardware).Logic?.model, "deepseek-r1:8b");
  assert.equal(evaluatedRoleBindings(models, hardware).Main?.provider, "custom-local-id");
  assert.deepEqual(evaluatedRoleBindings(models, { ...hardware, ramBytes: 1 }), {});
  assert.deepEqual(
    evaluatedRoleBindings(
      models.map((m) => ({ ...m, local: false })),
      hardware,
    ),
    {},
  );
  assert.deepEqual(
    evaluatedRoleBindings(
      models.map((m) => ({ ...m, metadata: { ...m.metadata, digest: "changed" } })),
      hardware,
    ),
    {},
  );
  assert.deepEqual(
    evaluatedRoleBindings(
      models.map((m) => ({ ...m, metadata: { ...m.metadata, runtimeVersion: "different" } })),
      hardware,
    ),
    {},
  );
  assert.equal(
    evaluatedRoleBindings(
      models.map((m) => ({ ...m, capabilities: { ...m.capabilities!, vision: false } })),
      hardware,
    ).Vision,
    undefined,
  );
});
