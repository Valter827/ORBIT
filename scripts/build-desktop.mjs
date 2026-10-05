import fs from "node:fs";
import { collectRelease, sourceIdentity, commandVersion } from "./release-artifacts.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (process.argv.slice(2).some(arg => arg !== "--production")) {
  console.error("Unknown build argument. Use --production or no flags for unsigned-test.");
  process.exit(1);
}
const production = process.argv.includes("--production");
const releaseType = production ? "production" : "unsigned-test";
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true, env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited ${result.status}`);
}
const signScript = path.join(root, "scripts/windows-sign.ps1");
const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
const sign = (mode, file) => run(powershell, ["-NoProfile", "-NonInteractive", "-File", signScript, "-Mode", mode, ...(file ? ["-File", file] : [])]);
const startedAt = new Date().toISOString();
const movedOutputs = [];
let identity;
try {
  identity = sourceIdentity(root);
  console.log(`ORBIT ${version}: ${releaseType.toUpperCase()}`);
  // Production never falls back to an unsigned build.
  if (production) sign("Preflight");
  const stale = path.join(root, ".desktop-cache", "pre-build-" + version + "-" + Date.now());
  for (const file of ["src-tauri/target/release/ORBIT.exe", "src-tauri/target/release/ORBIT.exe.nsis", "src-tauri/target/release/bundle/nsis/ORBIT_" + version + "_x64-setup.exe", "validation/release-v" + version + ".json", "release/ORBIT-" + version + "-windows-x64"]) {
    if (fs.existsSync(file)) { fs.mkdirSync(stale,{recursive:true}); fs.renameSync(file,path.join(stale,path.basename(file))); movedOutputs.push(file); }
  }
  fs.mkdirSync("validation", { recursive: true });
  fs.writeFileSync("validation/build-cleanup.json", JSON.stringify({ startedAt, movedOutputs, cleanOutputConfirmed: true }, null, 2));
  run(process.execPath, ["scripts/prepare-desktop.mjs"]);
  fs.mkdirSync("validation", { recursive: true });
  const args = ["scripts/tauri.mjs", "build", "--bundles", "nsis"];
  if (production) {
    process.env.ORBIT_SIGNING_RECEIPTS = path.join(root, "validation", `signing-v${version}.jsonl`);
    fs.writeFileSync(process.env.ORBIT_SIGNING_RECEIPTS, "");
    // Preserve the vendor's valid signature. Never silently re-sign third-party binaries.
    run(powershell, ["-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference='Stop'; Get-ChildItem -LiteralPath 'src-tauri/resources' -Recurse -File | Where-Object { $_.Extension -in @('.exe','.dll','.node') } | ForEach-Object { if ((Get-AuthenticodeSignature -LiteralPath $_.FullName).Status -ne 'Valid') { throw 'Bundled executable has an invalid or missing signature.' } }"]);
    fs.mkdirSync(".desktop-cache", { recursive: true });
    const config = path.join(root, ".desktop-cache", "signing-config.json");
    fs.writeFileSync(config, JSON.stringify({ bundle: { windows: { signCommand: {
      cmd: powershell, args: ["-NoProfile", "-NonInteractive", "-File", signScript, "-Mode", "Sign", "-File", "%1"],
    } } } }, null, 2));
    args.push("--config", config);
  }
  run(process.execPath, args);
  const app = path.join(root, "src-tauri/target/release/ORBIT.exe.nsis");
  const installer = path.join(root, `src-tauri/target/release/bundle/nsis/ORBIT_${version}_x64-setup.exe`);
  if (production) { sign("Verify", app); sign("Verify", installer); }
  const artifacts = [app, installer].map(file => ({
    path: path.relative(root, file), size: fs.statSync(file).size,
    sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase(),
  }));
  const receipt = {
    version, releaseType, startedAt, buildTime: new Date().toISOString(), ...identity,
    localBuildStatus: process.env.GITHUB_ACTIONS ? "NOT RUN" : "PASS",
    ciBuildStatus: process.env.GITHUB_ACTIONS ? "PASS" : "NOT RUN",
    signingStatus: production ? "SIGNED" : "UNSIGNED",
    nativeAcceptance: "NOT VERIFIED", artifacts, movedOutputs,
    toolchain: { node: process.version, npm: process.env.npm_config_user_agent || "NOT AVAILABLE",
      rust: commandVersion("rustc"), cargo: commandVersion("cargo"),
      tauri: JSON.parse(fs.readFileSync("node_modules/@tauri-apps/cli/package.json")).version,
      runner: process.env.RUNNER_OS || process.platform, runnerImage: process.env.ImageOS || "local Windows",
      runnerImageVersion: process.env.ImageVersion || "NOT AVAILABLE", webview2: "EVERGREEN / NATIVE VERSION NOT VERIFIED" },
    tests: fs.existsSync("validation/checks.json") ? JSON.parse(fs.readFileSync("validation/checks.json")) : "NOT RECORDED",
  };
  const status = await collectRelease(root, receipt);
  fs.writeFileSync(`validation/release-v${version}.json`, JSON.stringify(status, null, 2) + "\n");
  console.log(`Build complete: ${releaseType}. Native acceptance remains a separate gate.`);
} catch (error) {
  fs.mkdirSync("validation", { recursive: true });
  fs.writeFileSync(`validation/build-failure-v${version}-${releaseType}.json`, JSON.stringify({
    version, startedAt, endedAt: new Date().toISOString(), ...identity, movedOutputs,
    status: "FAIL", error: error.message, exe: "NOT PRODUCED", installer: "NOT PRODUCED",
    portable: "NOT PRODUCED", nativeAcceptance: "NOT VERIFIED",
  }, null, 2) + "\n");
  console.error(`ORBIT ${releaseType} build FAILED: ${error.message}`);
  process.exitCode = 1;
}
