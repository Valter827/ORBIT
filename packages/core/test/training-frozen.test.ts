import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

test("frozen v1.1 dataset retains exact archive bytes across Git checkouts", () => {
  const root = path.resolve("training/datasets/cosmo-dataset-v1.1");
  const checks = JSON.parse(fs.readFileSync(path.join(root, "checksums.json"), "utf8")) as Record<string, string>;
  assert.equal(Object.keys(checks).length, 6);
  for (const [name, expected] of Object.entries(checks)) {
    assert.equal(path.basename(name), name);
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(path.join(root, name)))
        .digest("hex"),
      expected,
      name,
    );
  }
});
