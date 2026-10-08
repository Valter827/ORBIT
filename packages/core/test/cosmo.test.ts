import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { AIStore } from "../src/desktop/ai-store.js";
import { AIHub } from "../src/desktop/ai-hub.js";
import { COSMO_ID, createCosmo } from "../src/ai/cosmo.js";
import { createProfile, importProfile } from "../src/ai/profiles.js";
import { LocalDownload, assertDiskSpace } from "../src/desktop/local-setup.js";
async function until(fn: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out");
}
test("COSMO seed is idempotent; preferences, custom AIs and chats survive restart", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-cosmo-"));
  let store = new AIStore(dir);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const p = store.profile(COSMO_ID);
  assert.equal(p.builtin?.version, "1.0");
  assert.equal(p.name, "COSMO");
  assert.equal(p.senseEnabled, false);
  assert.deepEqual(p.memory, {
    conversation: true,
    project: false,
    user: true,
    shared: false,
    suggestions: true,
    automatic: [],
  });
  p.instructions = "Use short answers";
  p.modelId = "my-brain";
  store.saveProfile(p);
  const custom = store.saveProfile(createProfile("USER AI"));
  store.setPreference("selected", custom.id);
  const chat = store.newConversation(p.id, "", "First");
  store.addMessage(chat, { role: "user", content: "hello" });
  store.close();
  store = new AIStore(dir);
  assert.equal(store.profiles().filter((p) => p.builtin).length, 1);
  assert.equal(store.profile(COSMO_ID).instructions, "Use short answers");
  assert.equal(store.profile(COSMO_ID).modelId, "my-brain");
  assert.equal(store.preference("selected"), custom.id);
  assert.equal(store.messages(chat, COSMO_ID, "").length, 1);
  assert.throws(() => store.deleteProfile(COSMO_ID), /built in/);
  assert.equal(importProfile(p).builtin, undefined);
});
test("COSMO duplication becomes a user AI and does not copy memory implicitly", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-cosmo-"));
  const hub = new AIHub(dir, () => {});
  t.after(async () => {
    await hub.shutdown();
    await rm(dir, { recursive: true, force: true });
  });
  const p = hub.store.profile(COSMO_ID);
  hub.store.addMemory(p, "", "user", "Private preference", false);
  const copy = (await hub.operation("ai.duplicate", { id: p.id }, "")) as ReturnType<typeof createCosmo>;
  assert.notEqual(copy.id, p.id);
  assert.equal(copy.builtin, undefined);
  assert.equal(copy.senseEnabled, false);
  assert.equal(hub.store.memory(copy, "").length, 0);
  await assert.rejects(
    hub.operation("ai.saveProfile", { ...copy, builtin: { id: "cosmo", version: "1.0" } }, ""),
    /reserved/,
  );
  assert.deepEqual(await hub.operation("ai.brainHealth", { profileId: p.id }, ""), { status: "Needs setup" });
  await assert.rejects(hub.operation("ai.brainTest", { profileId: p.id }, ""), /provider/);
});
test("COSMO real HTTP protocol fixture: chat, sources, multiple conversations, regeneration, health and persistence", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-cosmo-"));
  let hub = new AIHub(dir, () => {});
  let present = true;
  const bodies: Array<{ messages: Array<{ role: string; content: string }>; tools?: unknown }> = [];
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    void (async () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/models") {
        res.end(
          JSON.stringify({
            data: present ? [{ id: "cosmo-fixture", capabilities: ["completion"], context_length: 4096 }] : [],
          }),
        );
        return;
      }
      let raw = "";
      for await (const part of req) raw += String(part);
      bodies.push(JSON.parse(raw) as (typeof bodies)[number]);
      if ((JSON.parse(raw) as { stream?: boolean }).stream) {
        res.setHeader("content-type", "text/event-stream");
        res.end(
          'data: {"choices":[{"delta":{"content":"Fixture response"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
      } else res.end(JSON.stringify({ choices: [{ message: { content: "Fixture test", tool_calls: [] } }] }));
    })().catch(() => {
      res.statusCode = 500;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const config = [
    {
      id: "cosmo-local",
      name: "Fixture only",
      type: "local" as const,
      endpoint: "http://127.0.0.1:" + addr.port + "/v1/",
      remoteAcknowledged: false,
      localInferenceConfirmed: true,
    },
  ];
  hub.configure(config, {});
  t.after(async () => {
    await hub.shutdown();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  });
  const p = hub.store.profile(COSMO_ID);
  p.modelId = "cosmo-fixture";
  p.intelligence.auto = false; // This case verifies an explicitly selected manual brain.
  hub.store.saveProfile(p);
  await hub.operation("ai.localOnly", { enabled: true }, "");
  await hub.knowledge.put(p.id, "aurora.md", "Aurora uses the silver launch plan.");
  hub.store.addMemory(p, "", "user", "Prefer brief answers.", false);
  const first = hub.chat({ profileId: p.id, request: "What is the Aurora launch plan?" }, "");
  await until(() => !hub.busy());
  assert.equal(hub.chatStatus()?.error, undefined);
  assert.equal(hub.store.messages(first.conversationId, p.id, "").length, 2);
  assert.match(JSON.stringify(bodies[0]), /silver launch/);
  assert.doesNotMatch(
    JSON.stringify(bodies[0]),
    /Prefer brief/,
    "Unrelated personal memory stays out of factual context",
  );
  assert.equal(bodies[0]?.tools, undefined);
  hub.chat(
    {
      profileId: p.id,
      request: "What is the Aurora launch plan?",
      conversationId: first.conversationId,
      regenerate: true,
    },
    "",
  );
  await until(() => !hub.busy());
  assert.equal(hub.store.messages(first.conversationId, p.id, "").length, 2);
  assert.equal(
    bodies.length,
    4,
    "Each factual draft can have one bounded evidence check; malformed critic falls back safely",
  );
  const second = hub.chat({ profileId: p.id, request: "A separate chat" }, "");
  await until(() => !hub.busy());
  assert.notEqual(first.conversationId, second.conversationId);
  await assert.rejects(hub.resolve(p.id, true), /does not support/);
  const before = hub.store.profile(p.id);
  before.providerId = "cosmo-local";
  hub.store.saveProfile(before);
  await hub.operation("ai.brainTest", { profileId: p.id }, "");
  assert.equal(
    ((await hub.operation("ai.brainHealth", { profileId: p.id }, "")) as { status: string }).status,
    "Ready",
  );
  const senseProfile = hub.store.profile(p.id);
  senseProfile.senseEnabled = true;
  hub.store.saveProfile(senseProfile);
  const sense = await hub.sense(
    {
      profileId: p.id,
      question: "Answer the visible question",
      acknowledgedDestination: "",
      includeImage: false,
      snapshot: {
        scope: "current-window",
        window: {
          id: "fixture",
          title: "Question",
          application: "fixture",
          processId: 1,
          started: "1",
          foreground: true,
        },
        capturedAt: Date.now(),
        visibleText: "What is the capital of France?",
        nodes: [],
        ocrText: "",
        ocrStatus: "not-needed",
        image: null,
        protectedCount: 0,
        complete: true,
        warnings: [],
        url: null,
      },
    },
    "",
  );
  assert.equal(sense.path, "structured-context");
  assert.match(JSON.stringify(bodies.at(-1)), /capital of France/);
  present = false;
  assert.equal(
    ((await hub.operation("ai.brainHealth", { profileId: p.id }, "")) as { status: string }).status,
    "Model unavailable",
  );
  await hub.shutdown();
  hub = new AIHub(dir, () => {});
  hub.configure(config, {});
  assert.equal(hub.store.conversations(p.id, "").length, 2);
  assert.equal(hub.store.messages(first.conversationId, p.id, "").length, 2);
  hub.configure([{ ...config[0]!, endpoint: "http://127.0.0.1:1/v1/" }], {});
  assert.equal(
    ((await hub.operation("ai.brainHealth", { profileId: p.id }, "")) as { status: string }).status,
    "Offline",
  );
});
test("model download rejects insufficient or unknown disk and missing explicit consent", async () => {
  assert.throws(() => assertDiskSpace(1, 100), /Not enough/);
  assert.throws(() => assertDiskSpace(null, 100), /Cannot verify/);
  const dl = new LocalDownload(
    async () => ({ diskAvailableBytes: 0 }),
    () => {
      throw new Error("must not contact runtime");
    },
  );
  await assert.rejects(dl.start({ model: "gemma3:1b", confirmed: true, storageConfirmed: true }), /Not enough/);
  await assert.rejects(dl.start({ model: "gemma3:1b" }));
  assert.notEqual(dl.state().status, "complete");
});
test("download NDJSON progress, cancellation and completion are runtime-driven (fixture)", async () => {
  let abort: AbortSignal | undefined;
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const dl = new LocalDownload(
    async () => ({ diskAvailableBytes: 50e9 }),
    (_url, init) => {
      abort = init.signal ?? undefined;
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              stream = c;
              c.enqueue(new TextEncoder().encode('{"status":"pulling","completed":10,"total":100}\n'));
              abort?.addEventListener("abort", () => c.error(new Error("aborted")));
            },
          }),
        ),
      );
    },
  );
  await dl.start({ model: "gemma3:1b", confirmed: true, storageConfirmed: true });
  await until(() => dl.state().total === 100);
  assert.equal(dl.state().completed, 10);
  assert.equal(dl.cancel().status, "cancelled");
  assert.equal(abort?.aborted, true);
  await until(() => dl.state().status === "cancelled");
  assert.ok(stream);
  const done = new LocalDownload(
    async () => ({ diskAvailableBytes: 50e9 }),
    () => Promise.resolve(new Response('{"status":"success"}\n')),
  );
  await done.start({ model: "gemma3:1b", confirmed: true, storageConfirmed: true });
  await until(() => done.state().status === "complete");
});
test("cancel during disk detection cannot start a later download (fixture)", async () => {
  let release: ((value: { diskAvailableBytes: number }) => void) | undefined;
  let calls = 0;
  const dl = new LocalDownload(
    () =>
      new Promise((r) => {
        release = r;
      }),
    () => {
      calls++;
      throw new Error("unexpected");
    },
  );
  const pending = dl.start({ model: "gemma3:1b", confirmed: true, storageConfirmed: true });
  dl.cancel();
  release?.({ diskAvailableBytes: 50e9 });
  await assert.rejects(pending, /cancelled/);
  assert.equal(calls, 0);
  assert.equal(dl.state().status, "cancelled");
});

test("Stop during COSMO model discovery cannot start late inference (fixture)", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-cosmo-cancel-"));
  const hub = new AIHub(dir, () => {});
  let observed = false,
    posts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    if (req.url === "/v1/models") {
      observed = true;
      const timer = setTimeout(() => res.end(JSON.stringify({ data: [{ id: "delayed-model" }] })), 500);
      res.on("close", () => clearTimeout(timer));
    } else {
      posts++;
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(async () => {
    await hub.shutdown();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  });
  hub.configure(
    [
      {
        id: "cosmo-local",
        name: "Cancellation fixture",
        type: "local",
        endpoint: "http://127.0.0.1:" + address.port + "/v1/",
        localInferenceConfirmed: true,
        remoteAcknowledged: false,
      },
    ],
    {},
  );
  hub.store.saveProfile({ ...createCosmo(), modelId: "delayed-model" });
  const result = assert.rejects(hub.operation("ai.brainTest", { profileId: COSMO_ID }, ""));
  await until(() => observed);
  await hub.operation("chat.stop", {}, "");
  await result;
  assert.equal(posts, 0);
  assert.equal(hub.busy(), false);
});
