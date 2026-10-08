import test from "node:test";
import assert from "node:assert/strict";
import { brainResponse, type Brain } from "../src/ai/brain-fallback.js";
import { AIProviderError } from "../src/ai/transport.js";
import type { CompletionRequest } from "../src/ai/router.js";
const request: CompletionRequest = { system: "Test", messages: [{ role: "user", content: "Hello" }], maxTokens: 100 };
const brain = (name: string): Brain => ({
  model: {
    provider: "local",
    model: name,
    contextWindow: 8000,
    local: true,
    supportsTools: false,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
  },
  provider: {
    id: "local",
    models: () => [],
    isConfigured: async () => true,
    complete: async () => ({ model: name, text: "ok", toolCalls: [] }),
  },
});
test("automatic fallback switches once only before output", async () => {
  const first = brain("first"),
    second = brain("second");
  let switches = 0;
  first.provider.complete = async () => {
    throw new AIProviderError("network", "offline");
  };
  const results = [];
  for await (const event of brainResponse(first, request, async () => {
    switches++;
    return second;
  }))
    results.push(event);
  assert.equal(switches, 1);
  assert.equal(results[0]?.type, "result");
  second.provider.complete = (...args) => first.provider.complete(...args);
  await assert.rejects(async () => {
    for await (const _event of brainResponse(first, request, async () => {
      switches++;
      return second;
    })) {
      void _event;
    }
  }, /offline/);
  assert.equal(switches, 2);
});
test("partial output, explicit cancellation and manual selection never silently switch", async () => {
  const first = brain("first");
  let switches = 0;
  first.provider.stream = async function* () {
    yield { type: "text", text: "partial" };
    throw new AIProviderError("network", "interrupted");
  };
  await assert.rejects(async () => {
    for await (const _event of brainResponse(first, request, async () => {
      switches++;
      return brain("second");
    })) {
      void _event;
    }
  }, /interrupted/);
  assert.equal(switches, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(async () => {
    for await (const _event of brainResponse(first, { ...request, signal: controller.signal }, async () => {
      switches++;
      return brain("second");
    })) {
      void _event;
    }
  }, /stopped/);
  assert.equal(switches, 0);
  delete first.provider.stream;
  first.provider.complete = async () => {
    throw new AIProviderError("network", "offline");
  };
  await assert.rejects(async () => {
    for await (const _event of brainResponse(first, request)) {
      void _event;
    }
  }, /offline/);
});
