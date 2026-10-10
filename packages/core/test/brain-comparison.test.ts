import test from "node:test";
import assert from "node:assert/strict";
import { comparableBrainResults } from "../src/ai/brain-comparison.js";
import { BRAIN_EVAL_SUITE } from "../src/ai/brain-eval.js";

test("comparison rejects stale, incomplete and differently measured results", () => {
  const hardware = { cpu: "test CPU", cores: 6, ramBytes: 32e9, gpu: "test GPU", vramBytes: 8e9, architecture: "x64" };
  const result = {
    suite: BRAIN_EVAL_SUITE,
    status: "COMPLETE",
    provider: "local",
    model: "a",
    configuration: { temperature: 0, repetitions: 2 },
    hardware,
    metadata: { digest: "exact-a" },
    cases: [{ name: "task1", category: "reasoning" }],
  };
  const second = { ...result, model: "b", metadata: { digest: "exact-b" } };
  const inventory = [result, second];
  const valid = (other = second) => comparableBrainResults([result, other], inventory, hardware);
  assert.equal(valid(), true);
  assert.equal(valid({ ...second, configuration: { repetitions: 2, temperature: 0 } }), true);
  assert.equal(valid({ ...second, status: "FAILED" }), false);
  assert.equal(valid({ ...second, suite: "old-suite" }), false);
  assert.equal(valid({ ...second, cases: [] }), false);
  assert.equal(valid({ ...second, cases: [{ name: "different", category: "reasoning" }] }), false);
  assert.equal(valid({ ...second, metadata: { digest: "old-digest" } }), false);
  assert.equal(valid({ ...second, hardware: { ...hardware, vramBytes: 4e9 } }), false);
  assert.equal(valid({ ...second, configuration: { temperature: 0, repetitions: 1 } }), false);
  assert.equal(comparableBrainResults([result], inventory, hardware), false);
  assert.equal(comparableBrainResults([result, second], inventory), false);
});
