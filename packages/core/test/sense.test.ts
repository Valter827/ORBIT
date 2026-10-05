import test from "node:test";
import { AnthropicProvider } from "../src/ai/providers/anthropic.js";
import { InMemorySecretStore } from "../src/security/secret-store.js";
import { createDesktopHost } from "../src/desktop/host.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { AIHub } from "../src/desktop/ai-hub.js";
import { createProfile, importProfile } from "../src/ai/profiles.js";
import {
  sanitizeSense,
  assertSenseTransfer,
  SenseSessionManager,
  senseDestination,
  sensePath,
  type SenseSnapshot,
} from "../src/sense/session.js";
import type { ModelDescriptor } from "../src/ai/router.js";
const snapshot = (): SenseSnapshot => ({
  scope: "current-window",
  window: { id: "1", title: "Sample", application: "fixture", processId: 1, started: "1", foreground: true },
  capturedAt: Date.now(),
  visibleText: "What is the capital of Canada?",
  nodes: [{ name: "Continue", role: "Button", focused: false }],
  ocrText: "",
  ocrStatus: "not-needed",
  image: null,
  protectedCount: 0,
  complete: true,
  warnings: [],
  url: null,
});
test("Sense defaults off and imports cannot grant screen capability", () => {
  const profile = createProfile();
  assert.equal(profile.senseEnabled, false);
  profile.senseEnabled = true;
  assert.equal(importProfile(profile).senseEnabled, false);
});
test("Sense session accepts explicit scopes and stop revokes the lease", () => {
  const manager = new SenseSessionManager();
  assert.equal(manager.active, undefined);
  assert.throws(() => manager.start("nova", "current-window", false), /disabled/);
  for (const scope of ["current-window", "application", "display"]) {
    const session = manager.start("nova", scope, true);
    assert.equal(manager.active, session);
    manager.stop();
    assert.equal(session.controller.signal.aborted, true);
    assert.equal(manager.active, undefined);
  }
  assert.throws(() => manager.start("nova", "all-applications-forever", true));
});
test("Sense transfer requires destination-bound consent and respects Local Only", () => {
  const config = { id: "cloud", type: "compatible", endpoint: "https://provider.example/v1/" };
  const destination = senseDestination(config, "model", "current-window");
  const input = {
    enabled: true,
    localOnly: false,
    local: false,
    localInferenceConfirmed: false,
    destination,
    acknowledgedDestination: "",
  };
  assert.throws(() => assertSenseTransfer(input), /Acknowledge/);
  assertSenseTransfer({ ...input, acknowledgedDestination: destination });
  assert.throws(
    () => assertSenseTransfer({ ...input, acknowledgedDestination: destination, localOnly: true }),
    /LOCAL ONLY/,
  );
  assert.throws(
    () =>
      assertSenseTransfer({
        ...input,
        acknowledgedDestination: destination,
        destination: senseDestination(config, "model", "display"),
      }),
    /Acknowledge/,
  );
  assert.throws(() => assertSenseTransfer({ ...input, local: true, localOnly: true }), /LOCAL ONLY/);
});
test("Sensitive visible text and protected controls suppress image transfer", () => {
  const raw = {
    ...snapshot(),
    visibleText: "API_KEY=abc123secret\npassword: short\nQuestion",
    image: "aGVsbG8=",
    ocrStatus: "available-confidence-unknown",
  };
  const clean = sanitizeSense(raw);
  assert.doesNotMatch(JSON.stringify(clean), /abc123secret|password: short/);
  assert.equal(clean.image, null);
  const splitLabel = sanitizeSense({ ...raw, visibleText: "Password\nshort-value", ocrText: "" });
  assert.doesNotMatch(splitLabel.visibleText, /short-value/);
  assert.equal(splitLabel.image, null);
  assert.ok(clean.warnings.some((w) => /Sensitive/.test(w)));
  assert.equal(sanitizeSense({ ...snapshot(), image: "aGVsbG8=", protectedCount: 1 }).image, null);
  assert.equal(sanitizeSense({ ...snapshot(), image: "aGVsbG8=", complete: false }).image, null);
});
test("Vision requires verified metadata, image opt-in and a clean snapshot", () => {
  const model: ModelDescriptor = {
    provider: "fixture",
    model: "fixture",
    contextWindow: 100000,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: false,
    local: true,
  };
  const raw = sanitizeSense({ ...snapshot(), image: "aGVsbG8=", ocrStatus: "available-confidence-unknown" });
  assert.equal(sensePath(model, raw, true), "structured-context");
  model.capabilities = {
    text: true,
    streaming: true,
    toolCalling: false,
    vision: true,
    structuredOutput: false,
    contextWindow: 100000,
  };
  assert.equal(sensePath(model, raw, false), "structured-context");
  assert.equal(sensePath(model, raw, true), "vision");
});
test("Sense uses real provider transport but never persists screen text or executes returned tools (fixture)", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "orbit-sense-test-"));
  const requests: Record<string, unknown>[] = [];
  let toolReply = false;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/models")) {
      res.end(
        JSON.stringify({
          data: [
            { id: "sense-fixture", capabilities: ["vision"], context_length: 100000 },
            { id: "sense-fixture-cloud", capabilities: ["vision"], context_length: 100000 },
          ],
        }),
      );
      return;
    }
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      requests.push(JSON.parse(body) as Record<string, unknown>);
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "The visible question asks about Canada. Ottawa.",
                ...(toolReply
                  ? {
                      tool_calls: [
                        { id: "forbidden", type: "function", function: { name: "computer__click", arguments: "{}" } },
                      ],
                    }
                  : {}),
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const config = {
    id: "sense-fixture",
    name: "Test fixture",
    type: "local" as const,
    endpoint: "http://127.0.0.1:" + address.port + "/v1/",
    remoteAcknowledged: true,
    localInferenceConfirmed: false,
  };
  const hub = new AIHub(directory, () => {});
  t.after(async () => {
    await hub.shutdown();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  hub.configure([config], {});
  const profile = createProfile("NOVA", config.id, "sense-fixture");
  profile.senseEnabled = true;
  hub.store.saveProfile(profile);
  const input = {
    profileId: profile.id,
    question: "Answer the visible Canada capital question",
    snapshot: snapshot(),
    acknowledgedDestination: senseDestination(config, profile.modelId, "current-window"),
    includeImage: false,
  };
  profile.senseEnabled = false;
  hub.store.saveProfile(profile);
  await assert.rejects(hub.sense(input, ""), /Enable Sense/);
  profile.senseEnabled = true;
  hub.store.saveProfile(profile);
  assert.equal(requests.length, 0);
  hub.store.setPreference("localOnly", "true");
  await assert.rejects(hub.sense(input, ""), /LOCAL ONLY/);
  assert.equal(requests.length, 0);
  hub.store.setPreference("localOnly", "false");
  profile.memory.user = true;
  hub.store.saveProfile(profile);
  hub.store.addMemory(profile, "", "user", "Use a concise answer.", false);
  await hub.knowledge.put(profile.id, "geography.md", "Canada capital question: Ottawa is the capital of Canada.");
  const result = await hub.sense(input, "");
  assert.match(result.text, /Ottawa/);
  assert.equal(result.path, "structured-context");
  assert.equal(requests[0]?.["tools"], undefined);
  assert.match(JSON.stringify(requests[0]), /UNTRUSTED SCREEN OBSERVATION/);
  assert.equal(hub.store.conversations(profile.id, "").length, 0);
  assert.equal(hub.store.memory(profile, "").length, 1);
  assert.ok(result.sources.some((s) => s.includes("geography.md")));
  assert.ok(!result.sources.includes("Enabled profile memory"), "Unrelated memory must not accompany screen context");
  const imageResult = await hub.sense(
    {
      ...input,
      includeImage: true,
      snapshot: { ...snapshot(), image: "aGVsbG8=", ocrStatus: "available-confidence-unknown" },
    },
    "",
  );
  assert.equal(imageResult.path, "vision");
  assert.match(JSON.stringify(requests.at(-1)), /image_url/);
  toolReply = true;
  await assert.rejects(hub.sense(input, ""), /cannot execute/);
  await assert.rejects(
    hub.sense({ ...input, snapshot: { ...snapshot(), capturedAt: Date.now() - 400000 } }, ""),
    /expired/,
  );

  config.localInferenceConfirmed = true;
  hub.configure([config], {});
  profile.modelId = "sense-fixture-cloud";
  hub.store.saveProfile(profile);
  const beforeCloud = requests.length;
  await assert.rejects(hub.sense({ ...input, acknowledgedDestination: "" }, ""), /Acknowledge/);
  assert.equal(requests.length, beforeCloud, "Cloud-backed local models require disclosure before sending context");
  hub.store.setPreference("localOnly", "true");
  await assert.rejects(
    hub.sense({ ...input, acknowledgedDestination: senseDestination(config, profile.modelId, "current-window") }, ""),
    /LOCAL ONLY/,
  );
  assert.equal(requests.length, beforeCloud);
});

test("Anthropic vision payload uses an image block (mock transport only)", async () => {
  const secrets = new InMemorySecretStore();
  secrets.set("ANTHROPIC_API_KEY", "synthetic-fixture-key");
  let sent = "";
  const provider = new AnthropicProvider(secrets, async (_url, init) => {
    assert.equal(typeof init?.body, "string");
    sent = typeof init?.body === "string" ? init.body : "";
    return Response.json({
      id: "fixture",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: "Fixture response" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  });
  await provider.complete("claude-sonnet-4-6", {
    system: "Read only.",
    maxTokens: 64,
    messages: [{ role: "user", content: "Explain", images: [{ mediaType: "image/jpeg", data: "aGVsbG8=" }] }],
  });
  assert.match(sent, /"type":"image"/);
  assert.match(sent, /"media_type":"image\/jpeg"/);
  assert.match(sent, /"data":"aGVsbG8="/);
});
test("Stopped native Sense epochs cannot begin a late provider request", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "orbit-sense-epoch-"));
  const host = createDesktopHost(() => {});
  t.after(async () => {
    await host.request("shutdown");
    await rm(directory, { recursive: true, force: true });
  });
  await host.request("configure", { workspace: null, stateDirectory: directory });
  await host.request("sense.cancel", { epoch: 7 });
  await assert.rejects(host.request("sense.analyze", { epoch: 6, input: {} }), /Sense stopped/);
  await assert.rejects(host.request("sense.analyze", { epoch: 7, input: {} }), /Sense stopped/);
});
