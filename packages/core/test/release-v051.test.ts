import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AIStore } from "../src/desktop/ai-store.js";
import { createProfile } from "../src/ai/profiles.js";
import { createDesktopHost } from "../src/desktop/host.js";

test("v051 private and project memory remain isolated across restart", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-v051-memory-"));
  let store = new AIStore(base);
  t.after(async () => {
    store.close();
    await fs.rm(base, { recursive: true, force: true });
  });
  const nova = createProfile("NOVA"),
    other = createProfile("OTHER");
  nova.memory.user = true;
  nova.memory.project = true;
  other.memory.user = true;
  other.memory.project = true;
  store.saveProfile(nova);
  store.saveProfile(other);
  const privateId = store.addMemory(nova, "project-a", "user", "Private unique fact maple-572", false);
  store.addMemory(nova, "project-a", "project", "Project unique fact amber-861", false);
  store.close();
  store = new AIStore(base);
  assert.equal(store.memory(store.profile(nova.id), "project-a").length, 2);
  assert.equal(store.memory(store.profile(nova.id), "project-b").length, 1);
  assert.equal(store.memory(store.profile(other.id), "project-a").length, 0);
  assert.throws(() => store.updateMemory(other, privateId, "Escalated", true, "Facts"), /scope/);
  store.deleteMemory(other, privateId);
  assert.equal(store.memory(nova, "project-b")[0]?.["content"], "Private unique fact maple-572");
});

test("v051 future vision interfaces do not register executable host methods", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-v051-vision-"));
  const host = createDesktopHost(() => {});
  t.after(async () => {
    await host.request("shutdown");
    await fs.rm(base, { recursive: true, force: true });
  });
  const workspace = path.join(base, "project");
  await fs.mkdir(workspace);
  await host.request("configure", { workspace, stateDirectory: path.join(base, "state") });
  for (const method of ["screen.capture", "computer.execute", "application.launch", "voice.transcribe"])
    await assert.rejects(
      host.request(method, { kind: "launch", applicationId: "calculator" }),
      /Unknown desktop operation/,
    );
});
