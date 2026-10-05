import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const version = "24.18.0",
  name = "node-v" + version + "-win-x64";
const root = path.resolve("vendor/node"),
  cache = path.resolve(".desktop-cache"),
  zip = path.join(cache, name + ".zip");
await fs.mkdir(cache, { recursive: true });
try {
  const m = JSON.parse(await fs.readFile(path.join(root, "runtime.json"), "utf8"));
  if (m.version === version) {
    console.log("Node runtime already prepared:", version);
    process.exit(0);
  }
} catch {}
async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const base = "https://nodejs.org/dist/v" + version + "/";
const sums = (await download(base + "SHASUMS256.txt")).toString("utf8");
const line = sums.split("\n").find((l) => l.trim().endsWith(" " + name + ".zip"));
if (!line) throw new Error("Official runtime checksum missing");
const expected = line.trim().split(/\s+/)[0];
let bytes;
try {
  bytes = await fs.readFile(zip);
} catch {
  bytes = await download(base + name + ".zip");
}
if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Node runtime SHA256 mismatch");
await fs.writeFile(zip, bytes);
const extraction = path.join(cache, "runtime");
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Expand-Archive -LiteralPath " + quote(zip) + " -DestinationPath " + quote(extraction) + " -Force",
  ],
  { stdio: "inherit", windowsHide: true },
);
if (result.status !== 0) throw new Error("Runtime extraction failed");
await fs.cp(path.join(extraction, name), root, { recursive: true });
await fs.writeFile(
  path.join(root, "runtime.json"),
  JSON.stringify({ version, sha256: expected, source: base + name + ".zip" }, null, 2),
);
console.log("Prepared verified Node.js " + version + " with npm.");
