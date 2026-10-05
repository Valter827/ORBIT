import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
const cargoBin = path.join(process.env.CARGO_HOME ?? path.join(os.homedir(), ".cargo"), "bin");
const env = { ...process.env, PATH: cargoBin + path.delimiter + (process.env.PATH ?? "") };
const result = spawnSync(
  process.execPath,
  [path.resolve("node_modules/@tauri-apps/cli/tauri.js"), ...process.argv.slice(2)],
  { stdio: "inherit", env, windowsHide: true },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
