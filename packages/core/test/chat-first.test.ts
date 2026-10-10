import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AIHub } from "../src/desktop/ai-hub.js";
import { COSMO_ID } from "../src/ai/cosmo.js";
import { createProfile } from "../src/ai/profiles.js";
test("chat history edits enforce AI/project scope and preserve other conversations", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "orbit-history-"));
  const hub = new AIHub(directory, () => {});
  t.after(async () => {
    await hub.shutdown();
    await rm(directory, { recursive: true, force: true });
  });
  const other = hub.store.saveProfile(createProfile("Other"));
  const id = hub.store.newConversation(COSMO_ID, "project-a", "Old title");
  const kept = hub.store.newConversation(other.id, "project-a", "Keep");
  hub.store.addMessage(id, { role: "user", content: "Public test" });
  hub.store.addMessage(kept, { role: "user", content: "Keep this" });
  await assert.rejects(hub.operation("chat.rename", { id, profileId: other.id, title: "bad" }, "project-a"), /scope/);
  await assert.rejects(hub.operation("chat.delete", { id, profileId: COSMO_ID }, "project-b"), /scope/);
  await hub.operation("chat.rename", { id, profileId: COSMO_ID, title: "New title" }, "project-a");
  assert.equal(hub.store.conversations(COSMO_ID, "project-a")[0]?.["title"], "New title");
  await assert.rejects(hub.operation("chat.rename", { id, profileId: COSMO_ID, title: " ".repeat(5) }, "project-a"));
  await hub.operation("chat.delete", { id, profileId: COSMO_ID }, "project-a");
  assert.throws(() => hub.store.messages(id, COSMO_ID, "project-a"), /scope/);
  assert.deepEqual(hub.store.messages(kept, other.id, "project-a")[0], { role: "user", content: "Keep this" });
});
