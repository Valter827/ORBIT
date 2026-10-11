import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cosmoDataset } from "../src/training/dataset-v1.js";
import { validateDataset, scoreAnswer } from "../src/training/dataset.js";
import { baselineCases } from "../src/ai/model-studio.js";
import { TrainingConfigSchema } from "../src/training/types.js";
import { compareEvaluations, type EvalRun } from "../src/training/evaluation.js";
import { checkedPath, validateStorage, prepareOwned } from "../src/training/storage.js";
import { TrainingLab } from "../src/training/lab.js";
test("Dataset admission: authored provenance, exact/near leak checks and fixed separate splits", () => {
  const r = validateDataset(
    cosmoDataset,
    baselineCases.map((x) => x.prompt),
  );
  assert.equal(r.valid, true, JSON.stringify(r.issues));
  assert.deepEqual(r.counts, { train: 28, validation: 14, test: 14 });
  assert.ok(cosmoDataset.every((x) => scoreAnswer(x, x.answer) && x.provenance.privateData === false));
  const leaked = structuredClone(cosmoDataset);
  leaked[28]!.messages = leaked[0]!.messages;
  assert.equal(validateDataset(leaked).valid, false);
  const grouped = structuredClone(cosmoDataset);
  grouped[28]!.group = grouped[0]!.group;
  assert.equal(validateDataset(grouped).valid, false);
  assert.equal(validateDataset(cosmoDataset, [cosmoDataset[0]!.messages[0]!.content]).valid, false);
});
test("Admission rejects malformed JSON references and unreviewed/private rows", () => {
  const x = structuredClone(cosmoDataset);
  const j = x.find((e) => e.category === "json")!;
  j.answer = "not JSON";
  assert.equal(validateDataset(x).valid, false);
  assert.throws(() => validateDataset([{ ...cosmoDataset[0], provenance: { privateData: true } }]));
});
test("Bounded training config rejects remote bases and unsafe options", () => {
  assert.throws(() => TrainingConfigSchema.parse({ base: "https://evil/model", revision: "x" }));
  assert.throws(() =>
    TrainingConfigSchema.parse({
      base: "google/gemma-3-4b-it",
      revision: "093f9f388b31de276ce2de164bdc2081324b9767",
      rank: 512,
    }),
  );
});
test("Promotion rejects incomplete, mismatched and small sample evaluations", () => {
  const b: EvalRun = {
    suite: "s",
    datasetHash: "d",
    baseHash: "b",
    configHash: "c",
    complete: true,
    observations: [{ id: "a", category: "memory", repeat: 0, passed: false, elapsedMs: 50, visibleTokens: 5 }],
  };
  assert.equal(compareEvaluations(b, { ...b, complete: false }).eligible, false);
  assert.equal(compareEvaluations(b, { ...b, baseHash: "other" }).eligible, false);
  assert.equal(
    compareEvaluations(b, { ...b, observations: [{ ...b.observations[0]!, passed: true }] }).eligible,
    false,
  );
});
test("Storage rejects drive root, relative paths, private overlap and unowned folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-training-test-"));
  try {
    assert.throws(() => checkedPath("relative"));
    assert.throws(() => checkedPath(path.parse(root).root));
    const py = path.join(root, "python.exe");
    fs.writeFileSync(py, "test interpreter path only");
    const s = {
      models: path.join(root, "models"),
      training: path.join(root, "runs"),
      datasets: path.join(root, "datasets"),
      adapters: path.join(root, "adapters"),
      python: py,
    };
    assert.deepEqual(validateStorage(s, path.join(root, "private")), s);
    assert.throws(() => validateStorage({ ...s, models: root }, path.join(root, "private")));
    fs.mkdirSync(s.training);
    fs.writeFileSync(path.join(s.training, "user-file"), "keep");
    assert.throws(() => prepareOwned(s.training));
    assert.equal(fs.readFileSync(path.join(s.training, "user-file"), "utf8"), "keep");
    prepareOwned(s.datasets);
    prepareOwned(s.datasets);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("Training state migration preserves roles externally and marks interrupted jobs failed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-training-state-"));
  try {
    const lab = new TrainingLab(root);
    assert.equal(lab.state().alpha, "NOT CREATED");
    assert.equal(lab.state().jobs.length, 0);
    const p = path.join(root, "training-lab", "state.json");
    fs.writeFileSync(p, JSON.stringify({ schema: 1, jobs: [{ id: "synthetic-test", state: "Training", events: [] }] }));
    const loaded = new TrainingLab(root);
    assert.equal(loaded.state().jobs[0]!.state, "Failed");
    assert.equal(loaded.state().jobs[0]!.interrupted, true);
    assert.ok(loaded.state().dataset.examples.every((x) => x.split !== "test"));
    fs.writeFileSync(p, JSON.stringify({ schema: 99 }));
    assert.throws(() => new TrainingLab(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("Authored code answers match deterministic JS/TS semantics", () => {
  assert.equal(
    [3, 8, 5].find((x) => x > 6),
    8,
  );
  const flags: boolean[] = [true, false, true];
  assert.equal(flags.filter(Boolean).length, 2);
  assert.equal(Object.keys({ red: 1, green: 2, blue: 3 }).length, 3);
});
