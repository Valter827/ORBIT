import test from "node:test";
import assert from "node:assert/strict";
import { AnthropicProvider, AIProviderError } from "../src/ai/providers/anthropic.js";
import { InMemorySecretStore } from "../src/security/secret-store.js";

test("isConfigured is false with no key set", async () => {
  const provider = new AnthropicProvider(new InMemorySecretStore());
  assert.equal(await provider.isConfigured(), false);
});

test("isConfigured is true once a key is set", async () => {
  const secrets = new InMemorySecretStore();
  secrets.set("ANTHROPIC_API_KEY", "sk-ant-test-not-real");
  const provider = new AnthropicProvider(secrets);
  assert.equal(await provider.isConfigured(), true);
});

test("complete() refuses to call out with no key configured, no network attempted", async () => {
  const provider = new AnthropicProvider(new InMemorySecretStore());
  await assert.rejects(
    () =>
      provider.complete("claude-sonnet-4-6", {
        system: "",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
      }),
    (err: unknown) => err instanceof AIProviderError && err.kind === "not_configured",
  );
});

// Real network call to the real endpoint. No key is available in this
// environment, so this exercises the failure path — but it is a genuine
// HTTP round trip to api.anthropic.com, not a mock.
test(
  "complete() against the real API with an invalid key returns a clean auth error, not a raw exception",
  { skip: process.env["ORBIT_LIVE_TESTS"] !== "1", timeout: 15000 },
  async () => {
    const secrets = new InMemorySecretStore();
    secrets.set("ANTHROPIC_API_KEY", "sk-ant-definitely-invalid-test-key");
    const provider = new AnthropicProvider(secrets);

    await assert.rejects(
      () =>
        provider.complete("claude-sonnet-4-6", {
          system: "You are terse.",
          messages: [{ role: "user", content: "hi" }],
          maxTokens: 10,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AIProviderError);
        assert.equal(err.kind, "auth");
        // The invalid key must never appear in the surfaced error message.
        assert.ok(!err.message.includes("sk-ant-definitely-invalid-test-key"));
        return true;
      },
    );
  },
);

test("models() lists at least one tool-capable model", () => {
  const provider = new AnthropicProvider(new InMemorySecretStore());
  const models = provider.models();
  assert.ok(models.length > 0);
  assert.ok(models.every((m) => m.provider === "anthropic"));
  assert.ok(models.some((m) => m.supportsTools));
});
