import fs from "node:fs";
import { spawnSync } from "node:child_process";

fs.mkdirSync("validation", { recursive: true });
const checks = {};
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm run check:release");
for (const name of ["typecheck", "lint", "format:check", "test", "test:release", "test:visual-security", "frontend:build"]) {
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, [npm, "run", name], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const log = (result.stdout || "") + (result.stderr || "");
  fs.writeFileSync(`validation/check-${name.replaceAll(":", "-")}.log`, log);
  checks[name] = { status: result.status === 0 ? "PASS" : "FAIL", started, ended: new Date().toISOString(), exitCode: result.status };
  fs.writeFileSync("validation/checks.json", JSON.stringify(checks, null, 2) + "\n");
  console.log(name, checks[name].status);
  if (result.status !== 0) { console.error(log.slice(-12000)); process.exit(1); }
}
