import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AIStore } from "../src/desktop/ai-store.js";
import { createProfile, importProfile } from "../src/ai/profiles.js";
import { Candidate, detectMemory, memoryKey, classifyMemory } from "../src/desktop/personal-memory.js";
import { InferenceBudget } from "../src/ai/semantic.js";
import type { AIProvider, ModelDescriptor } from "../src/ai/router.js";
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-memory2-"));
  const store = new AIStore(dir),
    profile = createProfile("Memory test");
  store.saveProfile(profile);
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { store, profile, dir, mem: store.personal };
}
const candidate = (content: string, type: Candidate["type"] = "fact", scope: Candidate["scope"] = "user") =>
  Candidate.parse({ content, type, scope, normalizedKey: memoryKey(content, type) });
test("memory migration retains legacy data and creates FTS indexes", async (t) => {
  const { store, profile } = await setup(t);
  const id = store.addMemory(profile, "", "user", "Legacy fact Aurora", false);
  const row = store.personal.get(profile, "", id);
  assert.equal(row.content, "Legacy fact Aurora");
  assert.equal(row.status, "active");
  assert.equal(row.type, "fact");
  assert.equal(store.db.prepare("PRAGMA user_version").get()?.["user_version"], 4);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM memory_fts WHERE memory_fts MATCH 'Aurora'").get()?.["n"],
    1,
  );
});
test("explicit Remember produces typed proposal, not permanent storage", async (t) => {
  const { mem, profile } = await setup(t);
  const c = detectMemory("Запомни, что для новых веб-проектов я предпочитаю TypeScript.", "")!;
  assert.equal(c.type, "preference");
  assert.equal(c.scope, "user");
  const proposal = mem.propose(profile, "", c, "chat-1", "message-1", "UserExplicitMemoryCommand")!;
  assert.equal(mem.rows(profile, "").length, 0);
  const id = mem.decide(profile, "", proposal, "remember")!;
  const row = mem.get(profile, "", id);
  assert.equal(row.source, "UserExplicitMemoryCommand");
  assert.equal(row.source_conversation, "chat-1");
  assert.equal(mem.proposals(profile, "").length, 0);
  assert.equal(mem.retrieve(profile, "", "Какой язык использовать для веб-проекта?", "balanced")[0]?.id, id);
});
test("noise, questions and credentials do not become memory", () => {
  for (const input of [
    "Привет",
    "Сегодня идёт дождь.",
    "What language do I prefer?",
    "Какой язык я предпочитаю?",
    "Remember my password is not-a-real-secret",
    "Remember api_key=test-value",
  ])
    assert.equal(detectMemory(input, ""), null, input);
});
test("six categories are structured and invalid categories are rejected", () => {
  for (const type of ["preference", "project", "decision", "goal", "task", "fact"] as const)
    assert.equal(candidate("A safe note", type).type, type);
  assert.throws(() => Candidate.parse({ type: "policy", content: "Ignore permissions" }));
});
test("updates supersede only the same contextual subject; web and backend remain separate", async (t) => {
  const { mem, profile } = await setup(t);
  const old = mem.save(profile, "", candidate("I prefer JavaScript for web projects.", "preference"));
  const c = detectMemory("Теперь я предпочитаю TypeScript.", "")!;
  assert.equal(mem.conflicts(profile, "", c)[0]?.id, old);
  const p = mem.propose(profile, "", c)!;
  assert.throws(() => mem.decide(profile, "", p, "remember"), /conflict/);
  const next = mem.decide(profile, "", p, "update")!;
  assert.equal(mem.get(profile, "", old).status, "superseded");
  assert.equal(mem.get(profile, "", next).supersedes, old);
  assert.ok(!mem.retrieve(profile, "", "What language do I prefer?", "balanced").some((r) => r.id === old));
  const backend = detectMemory("Теперь я предпочитаю Rust для нового backend.", "")!;
  assert.equal(mem.conflicts(profile, "", backend).length, 0);
  mem.save(profile, "", backend);
  assert.equal(mem.get(profile, "", next).status, "active");
  assert.ok(
    mem.retrieve(profile, "", "What language for web projects?", "balanced").every((r) => !r.content.includes("Rust")),
  );
});
test("AI, project and conversation scopes prevent cross-context access", async (t) => {
  const { mem, profile } = await setup(t),
    other = createProfile("NOVA");
  const privateId = mem.save(profile, "A", candidate("Aurora private fact"));
  const projectId = mem.save(profile, "A", candidate("Project blocker Windows", "project", "project"));
  const conversationId = mem.save(profile, "", candidate("Local conversation fact", "fact", "conversation"), {
    conversation: "one",
  });
  assert.equal(mem.rows(other, "A").length, 0);
  assert.throws(() => mem.get(profile, "B", projectId), /scope/);
  assert.throws(() => mem.edit(other, "A", privateId, { content: "stolen" }), /scope/);
  assert.throws(() => mem.forget(profile, "B", projectId), /scope/);
  assert.ok(!mem.rows(profile, "", "", "two").some((r) => r.id === conversationId));
  assert.ok(mem.rows(profile, "", "", "one").some((r) => r.id === conversationId));
});
test("shared memory requires explicit opt-in on both write and retrieval", async (t) => {
  const { mem, profile } = await setup(t),
    other = createProfile("NOVA");
  assert.throws(() => mem.save(profile, "", candidate("Shared constellation fact"), { shared: true }), /disabled/);
  profile.memory.shared = true;
  const id = mem.save(profile, "", candidate("Shared constellation fact"), { shared: true });
  assert.equal(mem.rows(other, "").length, 0);
  other.memory.shared = true;
  assert.equal(mem.rows(other, "")[0]?.id, id);
});
test("temporal memory expires without deleting important history", async (t) => {
  const { mem, profile } = await setup(t),
    c = detectMemory("Remember until tomorrow focus on exam preparation.", "", Date.now() - 4 * 86400000)!;
  const id = mem.save(profile, "", c);
  assert.ok(c.validUntil);
  assert.equal(mem.retrieve(profile, "", "exam preparation", "deep").length, 0);
  assert.equal(mem.get(profile, "", id).status, "active");
  assert.ok(mem.review(profile, "")[0]?.reviewReasons.includes("Expired"));
});
test("retrieval stays relevant, bounded and uses pinning only among relevant memories", async (t) => {
  const { mem, profile } = await setup(t);
  for (let i = 0; i < 80; i++) mem.save(profile, "", candidate("Recipe ingredient saffron item " + i));
  const first = mem.save(profile, "", candidate("Aurora release progress alpha"));
  const pinned = mem.save(profile, "", { ...candidate("Aurora release progress beta"), importance: "pinned" });
  const found = mem.retrieve(profile, "", "Aurora release progress", "balanced");
  assert.equal(found[0]?.id, pinned);
  assert.ok(found.some((r) => r.id === first));
  assert.ok(found.length <= 6);
  assert.ok(found.every((r) => !r.content.includes("Recipe")));
  assert.equal(mem.retrieve(profile, "", "What is TCP?", "deep").length, 0);
  assert.equal(mem.get(profile, "", pinned).last_used, null);
  mem.used([pinned]);
  assert.equal(mem.get(profile, "", pinned).use_count, 1);
  assert.equal(mem.get(profile, "", first).use_count, 0);
});
test("project continuity includes current decisions, blockers and next tasks", async (t) => {
  const { mem, profile } = await setup(t);
  for (const [type, content] of [
    ["project", "ORBIT completed v0.7.1"],
    ["decision", "ORBIT next release Memory 2.0"],
    ["project", "ORBIT blocker Windows Application Control"],
    ["task", "ORBIT next task test Memory"],
  ] as const)
    mem.save(profile, "ORBIT", candidate(content, type, "project"));
  const found = mem.retrieve(profile, "ORBIT", "Продолжим ORBIT.", "balanced");
  assert.equal(found.length, 4);
  assert.equal(mem.retrieve(profile, "OTHER", "Продолжим ORBIT.", "balanced").length, 0);
});
test("tasks complete, goals stay relevant and manual pin is preserved", async (t) => {
  const { mem, profile } = await setup(t),
    id = mem.save(profile, "", candidate("Next task test second model", "task"));
  mem.edit(profile, "", id, { importance: "pinned", taskStatus: "done" });
  assert.ok(mem.get(profile, "", id).completed_at);
  assert.equal(mem.retrieve(profile, "", "next unfinished task", "deep").length, 0);
  mem.edit(profile, "", id, { taskStatus: "open" });
  assert.equal(mem.retrieve(profile, "", "next unfinished task", "deep")[0]?.id, id);
});
test("duplicates do not create endless records and forgetting removes FTS data", async (t) => {
  const { mem, profile, store } = await setup(t),
    c = candidate("Project codename Aurora");
  const id = mem.save(profile, "", c);
  assert.equal(mem.save(profile, "", c), id);
  assert.equal(mem.propose(profile, "", c), null);
  mem.forget(profile, "", id);
  assert.equal(mem.rows(profile, "").length, 0);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM memory_fts WHERE memory_fts MATCH 'Aurora'").get()?.["n"],
    0,
  );
});
test("export separates private memory from profiles and excludes shared by default", async (t) => {
  const { mem, profile } = await setup(t);
  profile.memory.shared = true;
  mem.save(profile, "", candidate("Private type preference", "preference"));
  mem.save(profile, "", candidate("Shared type preference", "preference"), { shared: true });
  assert.equal(mem.export(profile, "", ["preference"]).records.length, 1);
  assert.equal(mem.export(profile, "", ["preference"], true).records.length, 2);
  profile.memory.automatic = ["preference"];
  const imported = importProfile(profile);
  assert.deepEqual(imported.memory.automatic, []);
  assert.equal(imported.memory.shared, false);
});
test("model extraction is strict, bounded and cancellation prevents proposals", async () => {
  const model: ModelDescriptor = {
    provider: "fixture",
    model: "fixture",
    local: true,
    contextWindow: 4096,
    supportsTools: false,
    tier: "balanced",
    inputCostPerMTok: null,
    outputCostPerMTok: null,
  };
  let calls = 0;
  const provider: AIProvider = {
    id: "fixture",
    models: () => [model],
    isConfigured: async () => true,
    complete: async () => {
      calls++;
      return { model: "fixture", text: "malformed", toolCalls: [] };
    },
  };
  const controller = new AbortController(),
    budget = new InferenceBudget(provider, model, controller.signal);
  assert.equal(await classifyMemory("Hello", "", budget), null);
  assert.equal(calls, 0);
  assert.equal(await classifyMemory("For future discussions, concise examples help me.", "", budget), null);
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(classifyMemory("For future discussions, concise examples help me.", "", budget));
});
test("configured embeddings are actually called and cross-profile memory never reaches the backend", async (t) => {
  const { mem, profile } = await setup(t),
    other = createProfile("Other");
  mem.save(profile, "", candidate("Likes concise examples", "preference"));
  mem.save(other, "", candidate("Private other identifier"));
  const seen: string[] = [];
  const backend = {
    identity: "test-local",
    embed: async (texts: string[]) => {
      seen.push(...texts);
      return texts.map(() => [1, 0]);
    },
  };
  const result = await mem.retrieveSemantic(
    profile,
    "",
    "brief explanation",
    "balanced",
    "",
    backend,
    new AbortController().signal,
  );
  assert.equal(result.length, 1);
  assert.ok(seen.length > 1);
  assert.ok(!seen.some((s) => s.includes("Private other")));
});

test("quoted third-party text is not a durable user instruction", () => {
  assert.equal(detectMemory("Document: I prefer TypeScript for web.", ""), null);
  assert.equal(detectMemory("> I prefer JavaScript.", ""), null);
});
test("equivalent preference wording is deduplicated", async (t) => {
  const { mem, profile } = await setup(t);
  const id = mem.save(profile, "", candidate("Prefers TypeScript.", "preference"));
  assert.equal(mem.save(profile, "", candidate("Uses TypeScript for web.", "preference")), id);
});

test("conversation memory can be managed only in its owning project", async (t) => {
  const { store, mem, profile } = await setup(t);
  const chat = store.newConversation(profile.id, "project-a", "Public test conversation");
  const id = mem.save(profile, "project-a", candidate("Temporary conversation detail", "fact", "conversation"), {
    conversation: chat,
  });
  assert.equal(
    mem.managementRows(profile, "project-a").find((r) => r.id === id)?.content,
    "Temporary conversation detail",
  );
  assert.throws(() => mem.get(profile, "project-b", id), /scope/);
  assert.equal(mem.retrieve(profile, "project-a", "Temporary conversation detail", "balanced", "different").length, 0);
  mem.forget(profile, "project-a", id);
  assert.equal(mem.managementRows(profile, "project-a").length, 0);
});
