import test from "node:test";
import assert from "node:assert/strict";
import { AnthropicProvider } from "../src/ai/providers/anthropic.js";
test(
  "v04 opt-in live Anthropic discovery, completion and streaming",
  {
    skip:
      process.env["ORBIT_LIVE_AI_TESTS"] !== "1"
        ? "Set ORBIT_LIVE_AI_TESTS=1 to allow live requests"
        : !process.env["ANTHROPIC_API_KEY"]
          ? "ANTHROPIC_API_KEY is absent"
          : false,
    timeout: 90000,
  },
  async () => {
    const provider = new AnthropicProvider({ get: () => Promise.resolve(process.env["ANTHROPIC_API_KEY"] ?? null) });
    const models = await provider.listModels(AbortSignal.timeout(20000));
    const model =
      models.find((m) => m.model === process.env["ORBIT_LIVE_MODEL"]) ??
      (!process.env["ORBIT_LIVE_MODEL"] ? models[0] : undefined);
    assert.ok(model, "Requested model must be accessible; no fallback for an explicit model");
    const input = {
      system: "Reply briefly.",
      messages: [{ role: "user" as const, content: "Say OK." }],
      maxTokens: 64,
      signal: AbortSignal.timeout(25000),
    };
    const result = await provider.complete(model.model, input);
    assert.ok(result.text.length);
    assert.ok(result.usage);
    let text = "",
      finished = false;
    for await (const event of provider.stream(model.model, { ...input, signal: AbortSignal.timeout(25000) })) {
      if (event.type === "text") text += event.text;
      else {
        finished = true;
        assert.ok(event.result.usage);
      }
    }
    assert.ok(finished);
    assert.ok(text.length);
  },
);
