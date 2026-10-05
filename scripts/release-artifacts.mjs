import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";

export function digest(file) {
  return { name: path.basename(file), size: fs.statSync(file).size,
    sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase() };
}
export function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : "NOT AVAILABLE";
}
export function sourceIdentity(root) {
  const commit = commandVersion("git", ["-C", root, "rev-parse", "HEAD"]);
  const dirty = commandVersion("git", ["-C", root, "status", "--porcelain", "--untracked-files=normal"]);
  if (process.env.GITHUB_SHA && (commit !== process.env.GITHUB_SHA || dirty !== "")) {
    throw new Error("CI source must be clean and exactly match GITHUB_SHA");
  }
  return { commit, sourceDirty: dirty === "NOT AVAILABLE" ? "NOT AVAILABLE" : dirty !== "",
    locks: ["package-lock.json", "src-tauri/Cargo.lock"].map(file => ({ path: file, ...digest(path.join(root, file)) })) };
}
export function verifyReceipt(root, receipt) {
  for (const entry of receipt.artifacts) {
    const actual = digest(path.join(root, entry.path));
    if (actual.size !== entry.size || actual.sha256 !== entry.sha256) throw new Error("Build artifact changed: " + entry.path);
  }
}
export async function collectRelease(root, receipt) {
  verifyReceipt(root, receipt);
  const { version } = receipt;
  const destination = path.join(root, "release", `ORBIT-${version}-windows-x64`);
  if (fs.existsSync(destination)) throw new Error("Release destination already exists; refuse mixing builds");
  const app = path.join(root, "src-tauri/target/release/ORBIT.exe");
  const installer = path.join(root, `src-tauri/target/release/bundle/nsis/ORBIT_${version}_x64-setup.exe`);
  for (const file of [app, installer]) {
    if (!receipt.artifacts.some(entry => path.resolve(root, entry.path) === file)) throw new Error("Missing build receipt entry");
    if (fs.readFileSync(file).subarray(0, 2).toString() !== "MZ") throw new Error("Not a Windows executable");
  }
  for (const file of ["core/host.mjs", "core/knowledge-document-worker.mjs", "node/node.exe",
    "core/node_modules/pdfjs-dist/package.json", "core/node_modules/mammoth/package.json", "core/node_modules/htmlparser2/package.json"]) {
    if (!fs.statSync(path.join(root, "src-tauri/resources", file)).isFile()) throw new Error("Missing runtime resource: " + file);
  }
  fs.mkdirSync(destination, { recursive: true });
  const portable = new JSZip();
  portable.file("ORBIT/ORBIT.exe", fs.readFileSync(app));
  const resources = [];
  function addTree(folder, relative) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name), name = relative + "/" + entry.name;
      if (entry.isSymbolicLink()) throw new Error("Symlink in runtime resources: " + name);
      if (entry.isDirectory()) addTree(file, name);
      else {
        portable.file("ORBIT/" + name, fs.readFileSync(file));
        resources.push({ path: name, ...digest(file) });
      }
    }
  }
  for (const folder of ["core", "node"]) addTree(path.join(root, "src-tauri/resources", folder), folder);
  portable.file("ORBIT/README.txt", "ORBIT " + version + "\r\nOpen ORBIT.exe. WebView2 is required. Install Ollama separately for local AI.\r\nData is stored in Windows AppData, not this folder. Unsigned test build unless release-status.json says SIGNED.\r\n");
  const portablePath = path.join(destination, `ORBIT_${version}_portable_x64.zip`);
  await new Promise((resolve, reject) => portable.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" })
    .pipe(fs.createWriteStream(portablePath)).on("finish", resolve).on("error", reject));
  fs.copyFileSync(app, path.join(destination, "ORBIT.exe"));
  fs.copyFileSync(installer, path.join(destination, path.basename(installer)));
  const status = { ...receipt, exe: digest(app), installer: digest(installer), portable: digest(portablePath), resources,
    nativeAcceptance: "NOT VERIFIED", installerAcceptance: "NOT VERIFIED", portableAcceptance: "NOT VERIFIED" };
  fs.writeFileSync(path.join(destination, "release-status.json"), JSON.stringify(status, null, 2) + "\n");
  fs.writeFileSync(path.join(destination, "SHA256SUMS.txt"), ["ORBIT.exe", path.basename(installer), path.basename(portablePath), "release-status.json"]
    .map(file => `${digest(path.join(destination, file)).sha256}  ${file}`).join("\n") + "\n");
  return status;
}
