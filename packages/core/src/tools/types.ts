import type { RiskLevel } from "../security/command-risk.js";
import type { ToolDomain } from "../permissions/manager.js";

/**
 * Minimal structural schema type so core stays dependency-free.
 * The app layer supplies Zod schemas that satisfy this shape.
 */
export interface Schema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: Error };
}

export interface ToolContext {
  taskId: string;
  workspaceRoot: string;
  signal: AbortSignal;
  log(message: string): void;
}

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  domain: ToolDomain;
  action: string;
  description: string;
  input: Schema<TInput>;
  jsonSchema?: Record<string, unknown>;
  output: Schema<TOutput>;
  /** Static risk floor; a tool may raise it per-input via `assess`. */
  baseRisk: RiskLevel;
  /** Human sentence for the permission dialog. */
  describe(input: TInput): string;
  assess?(input: TInput): RiskLevel;
  /** Rejects invalid input before any permission prompt is shown. */
  validate?(input: TInput, ctx: ToolContext): Promise<void> | void;
  execute(input: TInput, ctx: ToolContext): Promise<TOutput>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never, unknown>>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`A tool named ${tool.name} is already registered.`);
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition<never, unknown>);
  }

  get(name: string): ToolDefinition<never, unknown> | undefined {
    return this.tools.get(name);
  }

  list(): readonly ToolDefinition<never, unknown>[] {
    return [...this.tools.values()];
  }

  /** Shape handed to the model. Never includes execute(). */
  manifest(): Array<{ name: string; description: string; risk: RiskLevel; domain: ToolDomain }> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      risk: t.baseRisk,
      domain: t.domain,
    }));
  }
}
