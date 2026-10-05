import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PathGuard } from "../security/path-guard.js";

/**
 * STEP 7/8 of the plan: turn "+ Add Project" into something that actually
 * reads the project, instead of just recording a path. Every read here goes
 * through the same PathGuard as FileTool — the scanner has no special
 * filesystem privileges.
 */

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  ".orbit",
]);

const MAX_FILES = 20_000;

export interface ProjectOverview {
  name: string;
  rootPath: string;
  stack: string[];
  fileCount: number;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  git: { branch: string; headShortSha: string } | null;
  scannedAt: number;
  /** Cheap signature; a scan with the same fingerprint can be skipped. */
  fingerprint: string;
}

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_MARKERS: Array<{ dep: string; label: string }> = [
  { dep: "next", label: "Next.js" },
  { dep: "react", label: "React" },
  { dep: "vue", label: "Vue" },
  { dep: "svelte", label: "Svelte" },
  { dep: "express", label: "Express" },
  { dep: "fastify", label: "Fastify" },
  { dep: "@nestjs/core", label: "NestJS" },
  { dep: "prisma", label: "Prisma" },
  { dep: "@prisma/client", label: "Prisma" },
  { dep: "tailwindcss", label: "Tailwind CSS" },
  { dep: "vite", label: "Vite" },
  { dep: "@tauri-apps/api", label: "Tauri" },
];

export class ProjectScanner {
  constructor(private readonly guard: PathGuard) {}

  /**
   * Reads just enough to decide whether a full scan is worth doing:
   * package.json's mtime + git HEAD content. Call this on every message;
   * call `scan` only when the fingerprint changes.
   */
  async fingerprint(rootPath: string): Promise<string> {
    const parts: string[] = [];
    const pkg = this.guard.check("package.json", "read");
    if (pkg.allowed) {
      const stat = await fs.stat(pkg.resolved).catch(() => null);
      if (stat) parts.push(`pkg:${stat.mtimeMs}`);
    }
    const head = await this.readGitHead(rootPath);
    if (head) parts.push(`git:${head.headShortSha}`);
    return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
  }

  async scan(rootPath: string): Promise<ProjectOverview> {
    rootPath = await this.guard.validate(rootPath, "read");
    const packageJson = await this.readPackageJson();
    const stack = this.detectStack(packageJson);
    const packageManager = await this.detectPackageManager();
    const git = await this.readGitHead(rootPath);
    const fileCount = await this.countFiles(rootPath);
    const name = packageJson?.name ?? path.basename(rootPath);

    const overview: Omit<ProjectOverview, "fingerprint"> = {
      name,
      rootPath,
      stack,
      fileCount,
      packageManager,
      git,
      scannedAt: Date.now(),
    };

    return { ...overview, fingerprint: await this.fingerprint(rootPath) };
  }

  private async readPackageJson(): Promise<PackageJsonShape | null> {
    const decision = this.guard.check("package.json", "read");
    if (!decision.allowed) return null;
    try {
      const raw = await fs.readFile(await this.guard.validate(decision.resolved, "read"), "utf8");
      return JSON.parse(raw) as PackageJsonShape;
    } catch {
      return null;
    }
  }

  private detectStack(pkg: PackageJsonShape | null): string[] {
    const stack: string[] = [];
    if (!pkg) return stack;

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["typescript"]) stack.push("TypeScript");
    else if (pkg.name !== undefined) stack.push("JavaScript");

    for (const marker of FRAMEWORK_MARKERS) {
      if (deps[marker.dep] && !stack.includes(marker.label)) stack.push(marker.label);
    }
    return stack;
  }

  private async detectPackageManager(): Promise<ProjectOverview["packageManager"]> {
    const checks: Array<[string, ProjectOverview["packageManager"]]> = [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
      ["package-lock.json", "npm"],
    ];
    for (const [file, manager] of checks) {
      const decision = this.guard.check(file, "read");
      if (!decision.allowed) continue;
      const exists = await fs
        .access(decision.resolved)
        .then(() => true)
        .catch(() => false);
      if (exists) return manager;
    }
    return null;
  }

  private async readGitHead(rootPath: string): Promise<{ branch: string; headShortSha: string } | null> {
    const headDecision = this.guard.check(".git/HEAD", "read");
    if (!headDecision.allowed) return null;
    let headContent: string;
    try {
      headContent = (await fs.readFile(await this.guard.validate(headDecision.resolved, "read"), "utf8")).trim();
    } catch {
      return null;
    }

    // "ref: refs/heads/main" for a normal checkout, or a raw SHA in detached HEAD.
    const refMatch = /^ref:\s*refs\/heads\/(.+)$/.exec(headContent);
    if (!refMatch) {
      return { branch: "(detached)", headShortSha: headContent.slice(0, 7) };
    }
    const branch = refMatch[1]!;
    const refPath = `.git/refs/heads/${branch}`;
    const refDecision = this.guard.check(refPath, "read");
    let sha = "";
    if (refDecision.allowed) {
      sha = await fs
        .readFile(await this.guard.validate(refDecision.resolved, "read"), "utf8")
        .then((s) => s.trim())
        .catch(async () => this.readPackedRef(rootPath, branch));
    }
    return { branch, headShortSha: sha.slice(0, 7) };
  }

  private async readPackedRef(rootPath: string, branch: string): Promise<string> {
    const decision = this.guard.check(".git/packed-refs", "read");
    if (!decision.allowed) return "";
    try {
      const content = await fs.readFile(decision.resolved, "utf8");
      const line = content.split("\n").find((l) => l.endsWith(`refs/heads/${branch}`));
      return line ? line.split(" ")[0]! : "";
    } catch {
      return "";
    }
  }

  private async countFiles(rootPath: string): Promise<number> {
    let count = 0;
    const walk = async (dir: string): Promise<void> => {
      if (count > MAX_FILES) return;
      let entries;
      try {
        entries = await fs.readdir(await this.guard.validate(dir, "read"), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (count > MAX_FILES) return;
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          await walk(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
    };
    await walk(rootPath);
    return count;
  }
}
