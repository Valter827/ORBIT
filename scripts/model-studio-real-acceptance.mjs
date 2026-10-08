import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { AIHub } from "../dist/packages/core/src/desktop/ai-hub.js";
import { Candidate } from "../dist/packages/core/src/desktop/personal-memory.js";
import { LocalEmbeddings } from "../dist/packages/core/src/desktop/knowledge.js";
import { discoverLocalRuntimes } from "../dist/packages/core/src/ai/runtime-discovery.js";

const output = "validation/model-studio-real-010.json";
await fs.mkdir("validation", { recursive: true });
const directory = path.resolve(".desktop-cache", "model-studio-acceptance-" + Date.now());
const configuration = [{ id: "cosmo-local", name: "Ollama", type: "local", endpoint: "http://127.0.0.1:11434/v1/", localInferenceConfirmed: true, remoteAcknowledged: false }];
const evidence = { version: "0.10.0", at: new Date().toISOString(), fixture: false, steps: {} };
const save = () => fs.writeFile(output, JSON.stringify(evidence, null, 2));
const step = async (name, action) => { try { evidence.steps[name] = { status: "PASS", ...await action() }; } catch (e) { evidence.steps[name] = { status: "FAIL", error: String(e) }; } await save(); console.log(name + ": " + evidence.steps[name].status); };
let hub;
const start = () => { hub = new AIHub(directory, () => {}); hub.configure(configuration, {}); hub.store.setPreference("localOnly", "true"); };
start();
try {
  await step("runtime", async () => {
    const runtimes = await discoverLocalRuntimes(); assert.equal(runtimes[0].state, "READY");
    const inventory = await hub.models("cosmo-local", true); assert.ok(inventory.some(m => m.model === "gemma3:4b"));
    return { runtimes, inventory };
  });
  await step("benchmark", async () => {
    const result = await hub.operation("ai.studioBenchmark", { providerId: "cosmo-local", modelId: "gemma3:4b", repetitions: 2 }, "");
    assert.equal(result.status, "COMPLETE");
    // PASS here means the real suite ran; individual wrong answers remain FAIL inside result.
    delete result.hardware.modelDirectory;
    return { meaning: "Execution completed, not all model answers passed", result };
  });
  await step("embedding", async () => {
    const model = (await hub.models("cosmo-local", true)).find(m => m.model === "embeddinggemma:300m");
    assert.equal(model?.capabilities?.text, false);
    const backend = new LocalEmbeddings(configuration[0].endpoint, model.model);
    const started = performance.now();
    const vectors = await backend.embed(["The silver planet is Nereon.", "Какая планета серебряная?", "Которая планета названа Нереон?", "A sour lemon grows on a tree."]);
    const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / Math.sqrt(a.reduce((s, x) => s + x*x, 0) * b.reduce((s, x) => s + x*x, 0));
    const relevant = cosine(vectors[0], vectors[1]), irrelevant = cosine(vectors[3], vectors[1]);
    assert.ok(relevant > irrelevant); return { model: model.model, digest: model.metadata.digest, dimensions: vectors[0].length, elapsedMs: performance.now() - started, relevant, irrelevant };
  });
  await step("memoryPipeline", async () => {
    let profile = hub.profile(); profile.providerId = "cosmo-local"; profile.modelId = "gemma3:4b"; profile.memory.project = true;
    profile.intelligence.auto = false; profile.intelligence.web = "off"; profile.maxTokens = 600; hub.store.saveProfile(profile);
    const project = "ORBIT-studio-synthetic-project";
    const facts = [
      ["project", "ORBIT completed release v0.7.1.", /0\.7\.1/],
      ["decision", "ORBIT next stage is v0.8 Personal Memory 2.0.", /(?:0\.8|Personal Memory 2\.0)/i],
      ["project", "ORBIT blocker: Windows Application Control blocks desktop build.", /Windows|Application Control/i],
      ["task", "ORBIT next task: test Memory 2.0 with local Ollama.", /Ollama/i],
    ];
    const ids = facts.map(([type, content]) => hub.store.personal.save(profile, project, Candidate.parse({ type, content, scope: "project" })));
    await hub.shutdown(); start(); profile = hub.store.profile(profile.id);
    hub.chat({ profileId: profile.id, request: "Продолжим ORBIT." }, project);
    while (hub.busy()) await new Promise(resolve => setTimeout(resolve, 50));
    const answer = hub.chatStatus(); assert.equal(answer.error, undefined);
    const diagnostic = { total: facts.length, retrieved: ids.filter(id => answer.intelligence.memoryUsed.some(m => m.id === id)).length,
      inserted: ids.filter(id => answer.intelligence.memoryDiagnostics.insertedIds.includes(id)).length,
      finalFacts: facts.filter(([, , pattern]) => pattern.test(answer.text)).length,
      response: answer.text, brain: answer.model, analyzer: answer.intelligence.analyzer };
    evidence.memoryDiagnostic = diagnostic; await save();
    assert.equal(diagnostic.retrieved, 4); assert.equal(diagnostic.inserted, 4);
    // A model completeness failure is reported independently from retrieval/insertion.
    return { ...diagnostic, finalCompleteness: diagnostic.finalFacts === 4 ? "PASS" : "FAIL" };
  });
  await step("historyAndResultsRestart", async () => {
    const before = hub.modelStudio.results(); assert.ok(before.length);
    const selected = hub.profile(); await hub.shutdown(); start();
    assert.equal(hub.profile().id, selected.id); assert.equal(hub.profile().modelId, selected.modelId);
    assert.equal(hub.modelStudio.results()[0].id, before[0].id);
    return { benchmarkPersisted: true, selectedBrainPreserved: true };
  });
} finally { await hub.shutdown(); }
evidence.completed = true; await save();
if (Object.values(evidence.steps).some(s => s.status === "FAIL")) process.exitCode = 1;
