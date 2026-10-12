// Uses existing Git credential helper in memory; never prints or saves credentials.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const git = process.platform === "win32" ? "D:/Git/cmd/git.exe" : "git";
const response = execFileSync(git, ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
});
const token = response
  .split(/\r?\n/)
  .find((l) => l.startsWith("password="))
  ?.slice(9);
if (!token) throw Error("No GitHub credential available");
const api = async (path) => {
  const r = await fetch("https://api.github.com/repos/Valter827/ORBIT/" + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) throw Error(`GitHub HTTP ${r.status}`);
  return r;
};
const mode = process.argv[2] ?? "status";
if (mode === "status") {
  const runs = await (await api("actions/runs?branch=delivery%2Fv0.11&per_page=3")).json();
  console.log(
    JSON.stringify(
      runs.workflow_runs.map((r) => ({
        id: r.id,
        sha: r.head_sha,
        status: r.status,
        conclusion: r.conclusion,
        url: r.html_url,
      })),
      null,
      2,
    ),
  );
} else if (mode === "artifacts") {
  const id = process.argv[3];
  if (!/^\d+$/.test(id)) throw Error("Run ID required");
  const data = await (await api(`actions/runs/${id}/artifacts`)).json();
  console.log(
    JSON.stringify(
      data.artifacts.map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes })),
      null,
      2,
    ),
  );
} else if (mode === "download") {
  const id = process.argv[3],
    out = process.argv[4];
  if (!/^\d+$/.test(id) || !out) throw Error("Artifact ID and output required");
  const r = await api(`actions/artifacts/${id}/zip`);
  fs.writeFileSync(out, new Uint8Array(await r.arrayBuffer()), { flag: "wx" });
  console.log("Artifact saved: " + out);
} else if (mode === "jobs") {
  const id = process.argv[3];
  if (!/^\d+$/.test(id)) throw Error("Run ID required");
  const d = await (await api(`actions/runs/${id}/jobs`)).json();
  console.log(
    JSON.stringify(
      d.jobs.map((j) => ({
        id: j.id,
        status: j.status,
        conclusion: j.conclusion,
        steps: j.steps.map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion })),
      })),
      null,
      2,
    ),
  );
} else throw Error("Unsupported operation");
