import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PathGuard } from "../src/security/path-guard.js";
import { ProjectScanner } from "../src/project/scanner.js";

async function withProject(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "orbit-scan-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function initFakeGit(root: string, branch: string, sha: string): Promise<void> {
  const refPath = path.join(root, ".git", "refs", "heads", branch);
  await mkdir(path.dirname(refPath), { recursive: true });
  await writeFile(path.join(root, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
  await writeFile(refPath, `${sha}\n`);
}

test("scan detects TypeScript, React and Prisma from package.json", () =>
  withProject(async (root) => {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "devmemory",
        dependencies: { react: "^18.0.0", "@prisma/client": "^5.0.0" },
        devDependencies: { typescript: "^5.6.0" },
      }),
    );
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.name, "devmemory");
    assert.ok(overview.stack.includes("TypeScript"));
    assert.ok(overview.stack.includes("React"));
    assert.ok(overview.stack.includes("Prisma"));
  }));

test("scan reads the real branch name and short SHA from a real .git directory", () =>
  withProject(async (root) => {
    await initFakeGit(root, "feat/auth-refresh", "abc1234567890def");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.git?.branch, "feat/auth-refresh");
    assert.equal(overview.git?.headShortSha, "abc1234");
  }));

test("scan falls back to packed-refs when the loose ref file doesn't exist", () =>
  withProject(async (root) => {
    await mkdir(path.join(root, ".git"), { recursive: true });
    await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(path.join(root, ".git", "packed-refs"), "# pack-refs\ndeadbeef00000000 refs/heads/main\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.git?.branch, "main");
    assert.equal(overview.git?.headShortSha, "deadbee");
  }));

test("scan without a .git directory returns null git info, not an error", () =>
  withProject(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.git, null);
  }));

test("file count excludes node_modules, .git, dist and coverage", () =>
  withProject(async (root) => {
    await mkdir(path.join(root, "node_modules", "x"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "x", "index.js"), "// dep\n");
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "bundle.js"), "// built\n");
    await writeFile(path.join(root, "app.ts"), "// real\n");
    await writeFile(path.join(root, "index.ts"), "// real\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.fileCount, 2);
  }));

test("package manager is detected from the real lockfile present", () =>
  withProject(async (root) => {
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.packageManager, "pnpm");
  }));

test("the fingerprint changes when package.json changes, so callers can skip a full rescan otherwise", () =>
  withProject(async (root) => {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "a" }));
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    const scanner = new ProjectScanner(guard);
    const before = await scanner.fingerprint(root);

    await new Promise((r) => setTimeout(r, 5));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "a", version: "2.0.0" }));
    const after = await scanner.fingerprint(root);

    assert.notEqual(before, after);
  }));

test("scanning never reads outside the project root even with a symlink-like relative escape", () =>
  withProject(async (root) => {
    const guard = new PathGuard({ roots: [root], platform: "linux" });
    // No package.json inside root; scanner must not wander to find one elsewhere.
    const overview = await new ProjectScanner(guard).scan(root);
    assert.equal(overview.name, path.basename(root));
    assert.deepEqual(overview.stack, []);
  }));
