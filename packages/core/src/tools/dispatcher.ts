import { abortable, checkAbort } from "../agent/abort.js";
import { maxRisk } from "../security/command-risk.js";
import { PermissionManager, type PermissionRequest, type GrantMode } from "../permissions/manager.js";
import type { ToolRegistry, ToolContext } from "./types.js";
import type { AuditSink } from "../audit/sink.js";
import { PermissionDeniedError } from "../agent/engine.js";
import type { RiskLevel } from "../security/command-risk.js";

/**
 * The only route from "the model wants to call a tool" to "the tool actually
 * ran". Nothing else in ORBIT is allowed to call ToolDefinition.execute
 * directly — that would let a tool run without a permission check or an
 * audit entry, which defeats the point of having either.
 *
 * Flow: validate input → assess risk → PermissionManager.evaluate → if "ask",
 * call the supplied askUser callback (the UI's permission dialog) → on allow,
 * execute and audit; on deny, throw PermissionDeniedError so the agent loop
 * stops the task instead of guessing what to do next.
 */

export interface AskUser {
  (request: PermissionRequest, describe: string): Promise<GrantMode>;
}

export interface DispatchInput {
  taskId: string;
  userId: string;
  toolName: string;
  input: unknown;
  workspaceRoot: string;
  signal: AbortSignal;
  askUser: AskUser;
  log?: (message: string) => void;
  onStart?: (toolName: string) => Promise<void>;
}

export class ToolNotFoundError extends Error {
  override readonly name = "ToolNotFoundError";
}

export class ToolInputError extends Error {
  override readonly name = "ToolInputError";
}

export class ToolDispatcher {
  private readonly active = new Set<Promise<unknown>>();
  /** Wait for actual tool I/O to settle after the agent cancellation envelope returns. */
  async settled(): Promise<void> {
    while (this.active.size) await Promise.allSettled([...this.active]);
  }
  dispatch(req: DispatchInput): Promise<unknown> {
    const operation = this.dispatchInternal(req);
    this.active.add(operation);
    const clean = () => {
      this.active.delete(operation);
    };
    void operation.then(clean, clean);
    return operation;
  }
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionManager,
    private readonly audit: AuditSink,
    private readonly authorize?: (tool: string, input: unknown) => void,
    private readonly grantPolicy?: (tool: string, input: unknown) => "ask" | "task" | "always" | "disabled",
  ) {}

  private async dispatchInternal(req: DispatchInput): Promise<unknown> {
    checkAbort(req.signal);
    const tool = this.registry.get(req.toolName);
    if (!tool) {
      await this.audit.record({
        userId: req.userId,
        event: "tool.rejected",
        actor: "orbit",
        target: req.toolName,
        detail: { reason: "unknown_tool" },
        at: Date.now(),
      });
      throw new ToolNotFoundError(`No tool named ${req.toolName} is registered.`);
    }

    const parsed = tool.input.safeParse(req.input);
    if (!parsed.success) {
      await this.audit.record({
        userId: req.userId,
        event: "tool.rejected",
        actor: "orbit",
        target: req.toolName,
        detail: { reason: "invalid_input", message: parsed.error.message },
        at: Date.now(),
      });
      throw new ToolInputError(`Invalid input for ${req.toolName}: ${parsed.error.message}`);
    }

    try {
      this.authorize?.(req.toolName, parsed.data);
    } catch {
      await this.audit.record({
        userId: req.userId,
        event: "tool.rejected",
        actor: "orbit",
        target: req.toolName,
        detail: { reason: "profile_capability" },
        at: Date.now(),
      });
      throw new PermissionDeniedError("This AI profile does not allow the requested tool.");
    }
    const ctx: ToolContext = {
      taskId: req.taskId,
      workspaceRoot: req.workspaceRoot,
      signal: req.signal,
      log: req.log ?? (() => {}),
    };

    try {
      if (tool.validate) await tool.validate(parsed.data, ctx);
    } catch (error) {
      await this.audit.record({
        userId: req.userId,
        event: "tool.rejected",
        actor: "orbit",
        target: req.toolName,
        detail: { reason: "security_validation", message: errorMessage(error) },
        at: Date.now(),
      });
      throw error;
    }
    checkAbort(req.signal);
    const risk: RiskLevel = tool.assess ? maxRisk(tool.baseRisk, tool.assess(parsed.data)) : tool.baseRisk;
    const description = tool.describe(parsed.data);

    const permissionRequest: PermissionRequest = {
      domain: tool.domain,
      action: tool.action,
      target: req.workspaceRoot + ":" + describeTarget(parsed.data, req.toolName) + ":" + JSON.stringify(parsed.data),
      reason: description,
      risk,
      taskId: req.taskId,
    };

    const policy = this.grantPolicy?.(req.toolName, parsed.data);
    let decision = this.permissions.evaluate(permissionRequest);
    if (policy === "ask" && decision.outcome === "allow") decision = { outcome: "ask", request: permissionRequest };

    if (decision.outcome === "ask") {
      const requestedMode = await abortable(() => req.askUser(permissionRequest, description), req.signal);
      const mode =
        requestedMode === "deny"
          ? "deny"
          : policy === "ask"
            ? "once"
            : policy === "task" && requestedMode === "always"
              ? "task"
              : requestedMode;
      checkAbort(req.signal);
      decision = this.permissions.resolve(permissionRequest, mode);
      await this.audit.record({
        userId: req.userId,
        event: "permission.resolved",
        actor: "user",
        target: req.toolName,
        detail: { mode, risk, target: permissionRequest.target },
        at: Date.now(),
      });
    }

    if (decision.outcome === "deny") {
      await this.audit.record({
        userId: req.userId,
        event: "permission.denied",
        actor: "user",
        target: req.toolName,
        detail: { risk, reason: decision.reason },
        at: Date.now(),
      });
      throw new PermissionDeniedError(decision.reason);
    }

    const startedAt = Date.now();
    try {
      checkAbort(req.signal);
      if (tool.validate) await tool.validate(parsed.data, ctx);
      checkAbort(req.signal);
      await req.onStart?.(req.toolName);
      checkAbort(req.signal);
      const output = await tool.execute(parsed.data, ctx);
      const outputCheck = tool.output.safeParse(output);
      await this.audit.record({
        userId: req.userId,
        event: `tool.${tool.action}`,
        actor: "orbit",
        target: permissionRequest.target,
        detail: {
          tool: req.toolName,
          risk,
          durationMs: Date.now() - startedAt,
          via: decision.outcome === "allow" ? decision.via : "resolved",
          outputValid: outputCheck.success,
        },
        at: Date.now(),
      });
      checkAbort(req.signal);
      if (!outputCheck.success) throw new ToolInputError("Invalid tool output");
      return output;
    } catch (error) {
      await this.audit.record({
        userId: req.userId,
        event: "tool.failed",
        actor: "orbit",
        target: permissionRequest.target,
        detail: { tool: req.toolName, risk, message: errorMessage(error) },
        at: Date.now(),
      });
      throw error;
    }
  }
}

function describeTarget(data: unknown, toolName: string): string {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record["path"] === "string") return record["path"];
    if (typeof record["command"] === "string") return record["command"];
    if (typeof record["from"] === "string" && typeof record["to"] === "string") {
      return `${record["from"]} -> ${record["to"]}`;
    }
    if (typeof record["query"] === "string") return record["query"];
  }
  return toolName;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
