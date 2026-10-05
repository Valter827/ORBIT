import { prepareDocumentRuntime } from "./prepare-document-runtime.mjs";
import { build } from "esbuild";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
execFileSync(process.execPath, ["scripts/prepare-runtime.mjs"], { stdio: "inherit", windowsHide: true });
await fs.mkdir("src-tauri/resources/core", { recursive: true });
await build({
  entryPoints: ["packages/core/src/desktop/host.ts"],
  bundle: true,
  external: ["pdfjs-dist/*", "mammoth", "htmlparser2"],
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "src-tauri/resources/core/host.mjs",
});
await build({entryPoints:["packages/core/src/desktop/knowledge-document-worker.ts"],bundle:true,platform:"node",target:"node24",format:"esm",external:["pdfjs-dist/*","mammoth","htmlparser2"],outfile:"src-tauri/resources/core/knowledge-document-worker.mjs"});
await prepareDocumentRuntime();
await fs.cp("vendor/node", "src-tauri/resources/node", { recursive: true });
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
let cargo = await fs.readFile("src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(/^version = "[^"]+"/m, 'version = "' + pkg.version + '"');
await fs.writeFile("src-tauri/Cargo.toml", cargo);
console.log("Desktop resources ready; version " + pkg.version);
