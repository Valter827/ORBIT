import path from "node:path";
import { promises as fs, realpathSync } from "node:fs";
export type PathDecision =
  | { allowed: true; resolved: string; root: string }
  | { allowed: false; reason: "outside_workspace" | "no_workspace" | "blocked_name"; detail: string };
export interface PathGuardOptions {
  roots: readonly string[];
  platform?: NodeJS.Platform;
  allowSecretRead?: boolean;
}
const secrets = new Set(["id_rsa", "id_ed25519", ".npmrc", ".pypirc", "credentials"]);
const protectedDirs = new Set([".git", "node_modules", ".ssh", ".aws", ".orbit"]);
export class PathGuard {
  private readonly roots: string[];
  private readonly insensitive: boolean;
  constructor(private readonly options: PathGuardOptions) {
    this.roots = options.roots.map((r) => path.resolve(r));
    this.insensitive = (options.platform ?? process.platform) === "win32";
  }
  private key(p: string): string {
    return this.insensitive ? p.toLowerCase() : p;
  }
  private within(p: string, root: string): boolean {
    const rel = path.relative(this.key(root), this.key(p));
    return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep));
  }
  /** Lexical preflight only; filesystem operations MUST also await validate(). */
  check(input: string, mode: "read" | "write"): PathDecision {
    if (!this.roots.length) return { allowed: false, reason: "no_workspace", detail: "No workspace" };
    const resolved = path.resolve(this.roots[0]!, input);
    // Re-resolve aliases for every check: do not retain a stale permission if
    // an authorized root junction is retargeted after this guard is created.
    const roots = this.roots.flatMap((r) => {
      try {
        // fs.promises.realpath uses the native resolver. The JS sync resolver
        // may retain 8.3 spellings on Windows and is not interchangeable here.
        return [r, realpathSync.native(r)];
      } catch {
        return [r];
      }
    });
    const root = roots.find((r) => this.within(resolved, r));
    if (!root) return { allowed: false, reason: "outside_workspace", detail: "Path outside workspace" };
    const base = this.key(path.basename(resolved));
    const segments = this.key(path.relative(root, resolved)).split(path.sep);
    if (
      ((secrets.has(base) || /^\.env(?:\.|$)/i.test(base)) && !(mode === "read" && this.options.allowSecretRead)) ||
      (mode === "write" && segments.some((s) => protectedDirs.has(s)))
    ) {
      return { allowed: false, reason: "blocked_name", detail: "Protected workspace path" };
    }
    return { allowed: true, resolved, root };
  }
  async validate(input: string, mode: "read" | "write"): Promise<string> {
    const lexical = this.check(input, mode);
    if (!lexical.allowed) throw new Error(lexical.detail);
    if (process.platform === "win32") {
      const withoutDrive = input.replace(/^[a-z]:/i, "");
      if (
        withoutDrive.includes(":") ||
        input.startsWith("\\\\?") ||
        input.startsWith("\\\\.") ||
        input
          .split(/[\\/]/)
          .some(
            (s) =>
              /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s) || (s !== "." && s !== ".." && /[. ]$/.test(s)),
          )
      )
        throw new Error("Unsupported Windows path alias");
    }
    const root = await fs.realpath(lexical.root);
    const target = await this.canonical(lexical.resolved);
    if (!this.within(target, root)) throw new Error("Canonical target outside workspace");
    const canonicalGuard = new PathGuard({
      roots: [root],
      ...(this.options.allowSecretRead ? { allowSecretRead: true } : {}),
    });
    const decision = canonicalGuard.check(target, mode);
    if (!decision.allowed) throw new Error(decision.detail);
    return target;
  }
  private async canonical(target: string): Promise<string> {
    try {
      return await fs.realpath(target);
    } catch (e) {
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
      const stat = await fs.lstat(target).catch(() => null);
      if (stat?.isSymbolicLink()) throw new Error("Dangling symbolic link");
      const parent = path.dirname(target);
      if (parent === target) throw e;
      return path.join(await this.canonical(parent), path.basename(target));
    }
  }
}
