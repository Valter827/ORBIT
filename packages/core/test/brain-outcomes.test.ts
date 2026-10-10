import test from "node:test";
import assert from "node:assert/strict";
import { brainOutcome } from "../src/ai/brain-outcomes.js";
test("outcomes separate actual runtime failures from wrong and slow answers", () => {
  assert.equal(brainOutcome({ passed: true, elapsedMs: 70000 }), "PASS");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 70000 }), "FAIL");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 60005, error: "Request aborted" }), "TIMEOUT");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 12, error: "Request aborted" }), "FAIL");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 12, error: "CUDA out of memory" }), "OOM");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 12, error: "model does not support images" }), "UNSUPPORTED");
  assert.equal(brainOutcome({ passed: false, elapsedMs: 12, error: "network timeout" }), "TIMEOUT");
});
