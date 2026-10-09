import test from "node:test";
import assert from "node:assert/strict";
import { probeModel } from "../src/ai/probes.js";
import type { AIProvider, ModelDescriptor, CompletionRequest } from "../src/ai/router.js";

test("empty bounded probe answers remain unknown and request explicit local reasoning control", async () => {
  const requests: CompletionRequest[] = [];
  const model: ModelDescriptor = {
    provider: "local",
    model: "thinking",
    local: true,
    contextWindow: 4096,
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
      contextWindow: 4096,
    },
  };
  const provider: AIProvider = {
    id: "local",
    models: () => [model],
    isConfigured: async () => true,
    complete: async (_model, request) => {
      requests.push(request);
      return {
        text: "",
        model: "thinking",
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: request.maxTokens },
      };
    },
  };
  const result = await probeModel(provider, model, "http://127.0.0.1:11434/v1/", new AbortController().signal);
  assert.equal(result.chat, "NOT TESTED");
  assert.equal(result.structured, "NOT TESTED");
  assert.equal(result.russian, "NOT TESTED");
  assert.ok(requests.length >= 3);
  assert.ok(requests.every((r) => r.localReasoningEffort === "none"));
});
