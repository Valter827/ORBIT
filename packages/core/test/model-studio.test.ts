import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRuntime } from "../src/ai/runtime-discovery.js";
import { CompatibleProvider } from "../src/ai/providers/compatible.js";
import { AIStore } from "../src/desktop/ai-store.js";
import { ModelStudioStore } from "../src/ai/model-studio.js";
import { chooseModel, IntelligenceSettings } from "../src/ai/intelligence.js";
import type { Fetcher } from "../src/ai/transport.js";
import { estimateModelFit } from "../src/ai/model-fit.js";
import type { ModelDescriptor } from "../src/ai/router.js";

const endpoint = "http://127.0.0.1:11434/v1/";
const tags = { models: [{ name: "test:one", digest: "digest-1", size: 1234 }] };
test("role preferences cannot defeat capability or Local Only gates", () => {
  const plain: ModelDescriptor = {
    provider: "local",
    model: "plain",
    contextWindow: 8192,
    local: true,
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
  const remote = { ...plain, provider: "cloud", model: "code-by-name", local: false };
  const settings = IntelligenceSettings.parse({
    auto: true,
    roles: { Code: { provider: "cloud", model: remote.model }, Vision: { provider: "local", model: plain.model } },
  });
  assert.equal(chooseModel([remote, plain], settings, { kind: "coding" }, true).model, "plain");
  assert.throws(() => chooseModel([plain], settings, { vision: true }, true), /Vision/);
  const measured = {
    ...plain,
    model: "unnamed",
    metadata: { benchmarkSuite: "same", benchmarkPassRate: 0.8, codePassRate: 1 },
  };
  const bad = {
    ...plain,
    model: "super-coder",
    metadata: { benchmarkSuite: "same", benchmarkPassRate: 0.8, codePassRate: 0 },
  };
  assert.equal(chooseModel([bad, measured], IntelligenceSettings.parse({}), { kind: "coding" }).model, "unnamed");
});
test("memory-fit labels are estimates and absent sizes remain unknown", () => {
  const model: ModelDescriptor = {
    provider: "local",
    model: "any",
    local: true,
    contextWindow: 0,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: false,
  };
  const hardware = { freeRamBytes: 8 * 2 ** 30, vramBytes: null };
  assert.equal(estimateModelFit(model, hardware).status, "UNKNOWN");
  assert.equal(
    estimateModelFit({ ...model, metadata: { sizeBytes: 10 * 2 ** 30 } }, hardware).status,
    "LIKELY_TOO_LARGE",
  );
  assert.equal(estimateModelFit({ ...model, metadata: { sizeBytes: 1 * 2 ** 30 } }, hardware).status, "LIKELY_FITS");
});
test("Ollama discovery validates native tags, never depends on OpenAI compatibility", async () => {
  const urls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    urls.push(new URL(url).pathname);
    return Response.json(tags);
  };
  const found = await detectRuntime("Ollama", endpoint, {
    fetcher,
    cli: async () => {
      throw new Error("CLI should not run");
    },
  });
  assert.equal(found.state, "READY");
  assert.equal(found.evidence, "HTTP_API");
  assert.deepEqual(urls, ["/api/tags"]);
  assert.equal(found.models[0]?.id, "test:one");
});
test("runtime states distinguish empty, missing and decoy service", async () => {
  assert.equal(
    (await detectRuntime("Ollama", endpoint, { fetcher: async () => Response.json({ models: [] }) })).state,
    "NO_MODELS",
  );
  assert.equal(
    (await detectRuntime("Ollama", endpoint, { selected: "gone", fetcher: async () => Response.json(tags) })).state,
    "SELECTED_MISSING",
  );
  for (const value of [{ data: [{ id: "test" }] }, { models: [{ name: "test" }] }, "<html>ok</html>"]) {
    const found = await detectRuntime("Ollama", endpoint, {
      fetcher: async () => Response.json(value),
      cli: async () => {
        throw new Error("Must not override invalid service");
      },
    });
    assert.equal(found.state, "INVALID_SERVICE");
    assert.equal(found.running, false);
  }
});
test("CLI installation and model list are not proof of HTTP inference readiness", async () => {
  const fetcher: Fetcher = async () => {
    throw new Error("connection refused");
  };
  const installed = await detectRuntime("Ollama", endpoint, {
    fetcher,
    cli: async () => ({ installed: true, models: ["test:one"], version: "1.2.3" }),
  });
  assert.equal(installed.state, "INSTALLED_NOT_RUNNING");
  assert.equal(installed.running, false);
  assert.equal(
    (await detectRuntime("Ollama", endpoint, { fetcher, cli: async () => ({ installed: false }) })).state,
    "NOT_INSTALLED",
  );
});
test("discovery rejects remote or credential-bearing local endpoints before network", async () => {
  for (const url of ["https://example.com/", "http://user:pass@127.0.0.1:11434/", "http://localhost:11434/"]) {
    await assert.rejects(
      detectRuntime("Ollama", url, {
        fetcher: async () => {
          throw new Error("must not fetch");
        },
      }),
    );
  }
});
test("Ollama inventory works on custom ports, excludes embedding from chat, retains digests", async () => {
  const provider = new CompatibleProvider(
    "local",
    "http://127.0.0.1:12345/v1/",
    true,
    async () => null,
    async (url, init) => {
      const path = new URL(url).pathname;
      if (path === "/api/tags")
        return Response.json({ models: [...tags.models, { name: "embed", digest: "d2", size: 9 }] });
      if (path === "/api/version") return Response.json({ version: "0.20.0" });
      if (path === "/api/show")
        return Response.json({
          capabilities: (typeof init.body === "string" ? init.body : "").includes('"embed"')
            ? ["embedding"]
            : ["completion"],
          model_info: { "x.context_length": 8192 },
        });
      throw new Error("OpenAI models endpoint must not be required");
    },
  );
  const models = await provider.listModels();
  assert.equal(models.length, 2);
  assert.equal(models[0]?.metadata?.["digest"], "digest-1");
  assert.equal(models[1]?.capabilities?.text, false);
  assert.equal(chooseModel(models, IntelligenceSettings.parse({}), {}).model, "test:one");
});
test("model studio migration preserves chats and capability records across restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-studio-test-"));
  try {
    const store = new AIStore(directory),
      profile = store.profiles()[0]!;
    const conversation = store.newConversation(profile.id, "", "Kept chat");
    store.saveTurn(conversation, { role: "user", content: "hello" }, { role: "assistant", content: "hi" }, false);
    const studio = new ModelStudioStore(store.db);
    studio.saveCapabilities("digest-A", { chat: "SUPPORTED", tools: "UNKNOWN" });
    store.close();
    const reopened = new AIStore(directory);
    try {
      assert.equal(reopened.messages(conversation, profile.id, "").length, 2);
      assert.equal(new ModelStudioStore(reopened.db).capabilities("digest-A")["chat"], "SUPPORTED");
      assert.deepEqual(new ModelStudioStore(reopened.db).capabilities("digest-B"), {});
      assert.equal(reopened.db.prepare("PRAGMA user_version").get()?.["user_version"], 4);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
