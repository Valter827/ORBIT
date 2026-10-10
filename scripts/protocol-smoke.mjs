import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-protocol-")),
  workspace = path.join(base, "workspace");
await fs.mkdir(workspace);
await fs.writeFile(path.join(workspace, "hello.txt"), "Hello ORBIT");
const runtime = path.resolve("src-tauri/resources/node");
const child = spawn(
  path.join(runtime, "node.exe"),
  ["--disable-warning=ExperimentalWarning", path.resolve("src-tauri/resources/core/host.mjs")],
  {
    cwd: base,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: base,
      TMP: base,
      PATH: runtime + path.delimiter + path.join(process.env.SystemRoot, "System32"),
    },
  },
);
let seq = 0;
const pending = new Map();
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));
const exit = new Promise((resolve, reject) => {
  child.on("exit", resolve);
  child.on("error", reject);
});
createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line),
    callback = pending.get(message.id);
  if (callback) {
    pending.delete(message.id);
    clearTimeout(callback.timer);
    message.error ? callback.reject(new Error(message.error)) : callback.resolve(message.result);
  }
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("RPC timed out: " + method));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
try {
  await call("configure", { workspace, stateDirectory: path.join(base, "state") });
  assert.equal((await call("status")).configured, false);
  assert.deepEqual(await call("history"), []);
  assert.equal((await call("read", { file: "hello.txt" })).content, "Hello ORBIT");
  await assert.rejects(call("read", { file: "../state/database/orbit.sqlite" }));
  await assert.rejects(
    call("start", { request: "Cannot run without a key" }),
    /not configured|Connect this profile.s provider|Selected or allowed brain does not support this request \(confirmed Tools required\)/i,
  );
  assert.deepEqual(await call("history"), [], "Rejected agent startup must not create a task");
  await assert.rejects(call("execute_any_shell_command", { command: "whoami" }), /Unknown desktop/);
  await call("shutdown");
  child.stdin.end();
  assert.equal(await exit, 0);
  assert.equal(stderr, "");
  console.log("PASS: packaged core JSONL IPC using bundled Node, isolated cwd and no global Node/npm PATH.");
} finally {
  child.stdin.end();
  for (const p of pending.values()) clearTimeout(p.timer);
  if (path.dirname(base) !== os.tmpdir()) throw new Error("Unsafe cleanup");
  await exit;
  await fs.rm(base, { recursive: true, force: true });
}
