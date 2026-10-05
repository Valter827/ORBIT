export type ProviderId = string;

export interface ModelDescriptor {
  provider: ProviderId;
  model: string;
  contextWindow: number;
  /** USD per million tokens. */
  inputCostPerMTok: number | null;
  outputCostPerMTok: number | null;
  tier: "fast" | "balanced" | "reasoning" | "long-context";
  supportsTools: boolean;
  local: boolean;
  displayName?: string;
  capabilities?: {
    text: boolean;
    streaming: boolean;
    toolCalling: boolean | null;
    vision: boolean | null;
    structuredOutput: boolean | null;
    contextWindow: number | null;
  };
  metadata?: Record<string, unknown>;
}

export interface NativeToolCall {
  toolCallId: string;
  toolName: string;
  arguments: unknown;
}
export type AIMessage =
  | {
      role: "system" | "user";
      id?: string;
      content: string;
      images?: Array<{ mediaType: "image/jpeg" | "image/png"; data: string }>;
    }
  | {
      role: "assistant";
      content: string;
      intelligence?: {
        kind: string;
        mode: string;
        planningMs: number;
        generationMs?: number;
        verificationMs?: number;
        summary?: string;
        sources?: Array<{ sourceId: string; name: string; text: string }>;
        memoryCount?: number;
        memoryUsed?: Array<{ id: string; content: string; type: string; scope: string }>;
        brain?: string;
        verification?: import("./intelligence.js").Verification;
      };
      toolCalls?: NativeToolCall[];
    }
  | { role: "tool"; toolCallId: string; toolName: string; status: "ok" | "error"; output: unknown; error?: string };
export interface CompletionRequest {
  system: string;
  messages: AIMessage[];
  tools?: Array<{ name: string; description: string; schema: unknown }>;
  maxTokens: number;
  signal?: AbortSignal;
  temperature?: number;
  responseFormat?: "json_object";
  responseSchema?: Record<string, unknown>;
}
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}
export interface CompletionResult {
  text: string;
  toolCalls: NativeToolCall[];
  usage?: Usage;
  model: string;
}
export type StreamEvent = { type: "text"; text: string } | { type: "result"; result: CompletionResult };
export class AIProviderNotConfiguredError extends Error {
  readonly code = "AI_PROVIDER_NOT_CONFIGURED";
  constructor() {
    super("AI provider not configured.");
    this.name = "AIProviderNotConfiguredError";
  }
}
export interface AIProvider {
  readonly id: ProviderId;
  /** Resolved from the OS keychain, never from a bundled constant. */
  isConfigured(): Promise<boolean>;
  models(): ModelDescriptor[];
  listModels?(signal?: AbortSignal): Promise<ModelDescriptor[]>;
  stream?(model: string, request: CompletionRequest): AsyncGenerator<StreamEvent>;
  complete(model: string, request: CompletionRequest): Promise<CompletionResult>;
}

export type TaskKind = "chat" | "classify" | "code" | "plan" | "analyse-repository" | "summarise";

export interface RoutingRule {
  kind: TaskKind;
  /** Chosen in order; the first available model wins. */
  prefer: Array<{ provider: ProviderId; model: string }>;
  minContextWindow?: number;
}

export interface RouteInput {
  kind: TaskKind;
  approxInputTokens: number;
  offline: boolean;
  requireTools: boolean;
}

export class NoModelAvailableError extends Error {
  override readonly name = "NoModelAvailableError";
}

export class AIRouter {
  constructor(
    private readonly providers: Map<ProviderId, AIProvider>,
    private readonly rules: RoutingRule[],
  ) {}

  /**
   * Picks a model for the task. In offline mode only `local: true` models are
   * eligible; if none exist the caller surfaces Offline Mode limitations rather
   * than silently degrading.
   */
  async route(input: RouteInput): Promise<ModelDescriptor> {
    const configured = new Set<ProviderId>();
    for (const [id, provider] of this.providers) if (await provider.isConfigured()) configured.add(id);
    if (!configured.size) throw new AIProviderNotConfiguredError();
    const rule = this.rules.find((r) => r.kind === input.kind);
    const candidates: ModelDescriptor[] = [];

    if (rule) {
      for (const pref of rule.prefer) {
        const provider = this.providers.get(pref.provider);
        const model = provider?.models().find((m) => m.model === pref.model);
        if (model) candidates.push(model);
      }
    }
    for (const provider of this.providers.values()) {
      candidates.push(...provider.models());
    }

    const headroom = Math.ceil(input.approxInputTokens * 1.3);
    const viable = candidates.filter((m) => {
      if (!configured.has(m.provider)) return false;
      if (input.offline && !m.local) return false;
      if (input.requireTools && !m.supportsTools) return false;
      if (m.contextWindow < headroom) return false;
      if (rule?.minContextWindow && m.contextWindow < rule.minContextWindow) return false;
      return true;
    });

    const chosen = viable[0];
    if (!chosen) {
      throw new NoModelAvailableError(
        input.offline
          ? "No local model is configured, so this task needs a connection."
          : "No configured model can handle this request's size.",
      );
    }
    return chosen;
  }

  static estimateCost(model: ModelDescriptor, usage: Usage): number | null {
    if (model.inputCostPerMTok === null || model.outputCostPerMTok === null) return null;
    return (
      (usage.inputTokens / 1_000_000) * model.inputCostPerMTok +
      (usage.outputTokens / 1_000_000) * model.outputCostPerMTok
    );
  }
}

export interface Budget {
  dailyUsd: number;
  monthlyUsd: number;
}

export class BudgetGuard {
  private dayKey = "";
  private monthKey = "";
  private dayTotal = 0;
  private monthTotal = 0;

  constructor(
    private readonly budget: Budget,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(amountUsd: number): void {
    this.roll();
    this.dayTotal += amountUsd;
    this.monthTotal += amountUsd;
  }

  check(estimateUsd: number): { allowed: boolean; reason?: string } {
    this.roll();
    if (this.dayTotal + estimateUsd > this.budget.dailyUsd) {
      return { allowed: false, reason: "This would pass your daily spending limit." };
    }
    if (this.monthTotal + estimateUsd > this.budget.monthlyUsd) {
      return { allowed: false, reason: "This would pass your monthly spending limit." };
    }
    return { allowed: true };
  }

  totals(): { day: number; month: number } {
    this.roll();
    return { day: this.dayTotal, month: this.monthTotal };
  }

  private roll(): void {
    const d = this.now();
    const day = d.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    if (day !== this.dayKey) {
      this.dayKey = day;
      this.dayTotal = 0;
    }
    if (month !== this.monthKey) {
      this.monthKey = month;
      this.monthTotal = 0;
    }
  }
}
