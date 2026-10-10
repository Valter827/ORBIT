import type { RiskLevel } from "../security/command-risk.js";

export type ToolDomain = "files" | "terminal" | "browser" | "git" | "github" | "screen" | "system" | "search";

export type GrantMode = "once" | "task" | "always" | "deny";

export type DomainPolicy = "allow" | "ask" | "deny";

export interface PermissionRequest {
  domain: ToolDomain;
  action: string;
  /** Human-readable target, e.g. a path or a command. */
  target: string;
  /** Why the agent needs it — shown verbatim in the dialog. */
  reason: string;
  risk: RiskLevel;
  taskId: string;
}

export interface Grant {
  risk: RiskLevel;
  id: string;
  domain: ToolDomain;
  action: string;
  /** `*` means any target within the domain+action. */
  targetScope: string;
  mode: GrantMode;
  taskId: string | null;
  grantedAt: number;
  expiresAt: number | null;
  usesRemaining: number | null;
}

export type Decision =
  | { outcome: "allow"; via: "policy" | "grant"; grantId?: string }
  | { outcome: "ask"; request: PermissionRequest }
  | { outcome: "deny"; reason: string };

export interface PermissionManagerOptions {
  policies: Record<ToolDomain, DomainPolicy>;
  /** Injected for testability. */
  now?: () => number;
  /** Grants of this duration when the user picks "always". */
  alwaysTtlMs?: number;
}

const HIGH_RISK: RiskLevel[] = ["HIGH", "CRITICAL"];

export class PermissionManager {
  private readonly policies: Record<ToolDomain, DomainPolicy>;
  private readonly now: () => number;
  private readonly alwaysTtlMs: number;
  private grants: Grant[] = [];
  private seq = 0;

  constructor(options: PermissionManagerOptions) {
    this.policies = { ...options.policies };
    this.now = options.now ?? (() => Date.now());
    this.alwaysTtlMs = options.alwaysTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  }

  setPolicy(domain: ToolDomain, policy: DomainPolicy): void {
    this.policies[domain] = policy;
  }

  listGrants(): readonly Grant[] {
    this.prune();
    return this.grants;
  }

  /**
   * CRITICAL actions can never be satisfied by a standing grant. They always
   * return `ask`, so a user cannot accidentally pre-authorise `rm -rf`.
   */
  evaluate(request: PermissionRequest): Decision {
    this.prune();

    const policy = this.policies[request.domain];
    if (policy === "deny") {
      return {
        outcome: "deny",
        reason: `${request.domain} access is turned off in Permissions.`,
      };
    }

    if (request.risk === "CRITICAL") {
      return { outcome: "ask", request };
    }

    const grant = this.grants.find((g) => this.matches(g, request));
    if (grant) {
      if (grant.usesRemaining !== null) {
        grant.usesRemaining -= 1;
        if (grant.usesRemaining <= 0) {
          this.grants = this.grants.filter((g) => g.id !== grant.id);
        }
      }
      return { outcome: "allow", via: "grant", grantId: grant.id };
    }

    if (policy === "allow" && !HIGH_RISK.includes(request.risk)) {
      return { outcome: "allow", via: "policy" };
    }

    return { outcome: "ask", request };
  }

  /** Records the user's answer to an `ask`. */
  resolve(request: PermissionRequest, mode: GrantMode): Decision {
    if (mode === "deny") {
      return { outcome: "deny", reason: "You declined this action." };
    }

    if (mode === "once" || request.risk === "CRITICAL") return { outcome: "allow", via: "grant" };
    const id = `grant_${++this.seq}`;
    const now = this.now();

    const grant: Grant = {
      id,
      risk: request.risk,
      domain: request.domain,
      action: request.action,
      targetScope: mode === "always" ? "*" : request.target,
      mode,
      taskId: mode === "task" ? request.taskId : null,
      grantedAt: now,
      expiresAt: mode === "always" ? now + this.alwaysTtlMs : null,
      usesRemaining: null,
    };

    // "always" is refused for high-risk actions: they stay per-task at most.
    if (mode === "always" && HIGH_RISK.includes(request.risk)) {
      grant.mode = "task";
      grant.targetScope = request.target;
      grant.taskId = request.taskId;
      grant.expiresAt = null;
    }

    this.grants.push(grant);
    return { outcome: "allow", via: "grant", grantId: id };
  }

  /** Called when an agent task finishes; drops every task-scoped grant. */
  endTask(taskId: string): void {
    this.grants = this.grants.filter((g) => g.taskId !== taskId);
  }

  revoke(grantId: string): boolean {
    const before = this.grants.length;
    this.grants = this.grants.filter((g) => g.id !== grantId);
    return this.grants.length < before;
  }

  private matches(grant: Grant, request: PermissionRequest): boolean {
    if (grant.risk !== request.risk) return false;
    if (grant.domain !== request.domain) return false;
    if (grant.action !== request.action) return false;
    if (grant.taskId !== null && grant.taskId !== request.taskId) return false;
    if (grant.targetScope !== "*" && grant.targetScope !== request.target) return false;
    return true;
  }

  private prune(): void {
    const now = this.now();
    this.grants = this.grants.filter((g) => g.expiresAt === null || g.expiresAt > now);
  }
}
