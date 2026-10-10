import test from "node:test";
import assert from "node:assert/strict";
import { evaluateToolQuality } from "../src/ai/brain-tools.js";
import type { AIProvider } from "../src/ai/router.js";
import { LocalDownload } from "../src/desktop/local-setup.js";
test("tool quality refuses arbitrary tools; no execution occurs", async () => {
  let calls = 0;
  const provider: AIProvider = {
    id: "local",
    isConfigured: async () => true,
    models: () => [],
    complete: async () => {
      calls++;
      return {
        model: "fixture",
        text: "",
        toolCalls: [{ toolCallId: "1", toolName: "delete_all_files", arguments: {} }],
      };
    },
  };
  const result = await evaluateToolQuality(provider, "fixture", new AbortController().signal);
  assert.equal(calls, 4);
  assert.equal(result.state, "UNRELIABLE");
  assert.ok(result.cases.every((c) => !c.passed));
});
test("each larger candidate still requires explicit consent before any runtime request", async () => {
  let calls = 0;
  const download = new LocalDownload(
    async () => ({ diskAvailableBytes: 100e9 }),
    async () => {
      calls++;
      throw new Error("unexpected transport");
    },
  );
  for (const model of ["qwen3.5:9b-q4_K_M", "ministral-3:8b", "deepseek-r1:8b"]) {
    await assert.rejects(download.start({ model }));
    await assert.rejects(download.start({ model, confirmed: true, storageConfirmed: false }));
  }
  assert.equal(calls, 0);
});
