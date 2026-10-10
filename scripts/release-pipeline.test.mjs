import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest, verifyReceipt, collectRelease } from "./release-artifacts.mjs";

test("packaging rejects changed artifacts and missing runtime, never emits a release", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-packaging-unit-"));
  try {
    const exe = "src-tauri/target/release/ORBIT.exe.nsis";
    const setup = "src-tauri/target/release/bundle/nsis/ORBIT_0.9.5_x64-setup.exe";
    for (const file of [exe, setup]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "MZsynthetic-unit-test-not-a-release");
    }
    const receipt = { version: "0.9.5", artifacts: [exe, setup].map(file => ({ path: file, ...digest(path.join(root, file)) })) };
    fs.appendFileSync(path.join(root, exe), "changed");
    assert.throws(() => verifyReceipt(root, receipt), /changed/);
    await assert.rejects(collectRelease(root, receipt), /changed/);
    receipt.artifacts[0] = { path: exe, ...digest(path.join(root, exe)) };
    await assert.rejects(collectRelease(root, receipt), /ENOENT|Missing runtime/);
    assert.equal(fs.existsSync(path.join(root, "release")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("unknown release flags fail before preparation", () => {
  const result = spawnSync(process.execPath, ["scripts/build-desktop.mjs", "--productoin"], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown build argument/);
  assert.doesNotMatch(result.stdout, /Desktop resources ready/);
});
for (const thumbprint of [undefined, "not-a-certificate"]) {
  test(`production refuses ${thumbprint ? "malformed" : "missing"} signing identity without an unsigned fallback`, { skip: process.platform !== "win32" }, () => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toUpperCase() === "WINDOWS_CERTIFICATE_THUMBPRINT") delete env[key];
    if (thumbprint) env.WINDOWS_CERTIFICATE_THUMBPRINT = thumbprint;
    const result = spawnSync(process.execPath, ["scripts/build-desktop.mjs", "--production"], { env, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SIGNING NOT AVAILABLE/);
    assert.doesNotMatch(result.stdout, /Desktop resources ready|UNSIGNED-TEST|Build complete/);
  });
}
