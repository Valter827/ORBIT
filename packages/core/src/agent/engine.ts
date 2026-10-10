import { abortable, checkAbort } from "./abort.js";
import { createHash } from "node:crypto";

/**
 * The agent loop. Understand → Plan → Ask → Act → Verify.
 *
 * The engine owns the safety envelope; the model owns the decisions. Every
 * termination condition below is enforced here, not in a prompt, because a
 * prompt is a request and this is a guarantee.
 */

export interface AgentLimits {
  maxSteps: number;
  maxToolCalls: number;
  maxRetriesPerStep: number;
  maxDurationMs: number;
  /** Identical tool calls tolerated before the loop detector fires. */
  repeatThreshold: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxSteps: 40,
  maxToolCalls: 60,
  maxRetriesPerStep: 2,
  maxDurationMs: 10 * 60 * 1000,
  repeatThreshold: 3,
};

export type StopReason =
  | "completed"
  | "cancelled"
  | "denied"
  | "step_limit"
  | "tool_limit"
  | "timeout"
  | "loop_detected"
  | "retry_limit"
  | "failed";

export interface ToolCall {
  tool: string;
  action: string;
  input: unknown;
}

export interface ToolOutcome {
  ok: boolean;
  summary: string;
  output?: unknown;
}

export type AgentEvent =
  | { type: "agent.started"; taskId: string; at: number }
  | { type: "step.started"; index: number; label: string }
  | { type: "tool.called"; call: ToolCall }
  | { type: "tool.result"; outcome: ToolOutcome }
  | { type: "step.completed"; index: number; ok: boolean }
  | { type: "agent.stopped"; reason: StopReason; message: string };

export interface AgentDecision {
  /** Short label shown in the timeline, e.g. "Inspecting authentication". */
  label: string;
  call: ToolCall | null;
  /** Set when the model believes the task is done. */
  done?: boolean;
}

export interface AgentDriver {
  /** Produces the next step from the transcript so far. */
  next(history: readonly StepRecord[], signal: AbortSignal): Promise<AgentDecision>;
  /** Runs a tool after permissions have cleared. Rejects if denied. */
  execute(call: ToolCall, signal: AbortSignal): Promise<ToolOutcome>;
  /** Final gate: confirms the task's stated goal actually holds. */
  verify(history: readonly StepRecord[], signal: AbortSignal): Promise<ToolOutcome>;
}

export interface StepRecord {
  index: number;
  label: string;
  call: ToolCall | null;
  outcome: ToolOutcome | null;
  attempt: number;
}

export interface AgentResult {
  taskId: string;
  reason: StopReason;
  message: string;
  steps: StepRecord[];
  toolCalls: number;
  durationMs: number;
  verified: boolean;
}

export interface RunOptions {
  taskId: string;
  driver: AgentDriver;
  limits?: Partial<AgentLimits>;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
}

function fingerprint(call: ToolCall): string {
  return createHash("sha256")
    .update(`${call.tool}:${call.action}:${JSON.stringify(call.input ?? null)}`)
    .digest("hex")
    .slice(0, 16);
}

export class PermissionDeniedError extends Error {
  override readonly name = "PermissionDeniedError";
}

export async function runAgent(options: RunOptions): Promise<AgentResult> {
  const limits: AgentLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const now = options.now ?? (() => Date.now());
  const emit = options.onEvent ?? (() => {});
  const startedAt = now();

  const controller = new AbortController();
  let timedOut = false;
  const externalAbort = () => controller.abort(new Error("Cancelled"));
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Timeout"));
  }, limits.maxDurationMs);
  const checkpoint = () => {
    if (now() - startedAt >= limits.maxDurationMs) {
      timedOut = true;
      controller.abort(new Error("Timeout"));
    }
    checkAbort(controller.signal);
  };
  const steps: StepRecord[] = [];
  const seen = new Map<string, number>();
  let toolCalls = 0;
  let verified = false;

  emit({ type: "agent.started", taskId: options.taskId, at: startedAt });

  const finish = (reason: StopReason, message: string): AgentResult => {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
    emit({ type: "agent.stopped", reason, message });
    return {
      taskId: options.taskId,
      reason,
      message,
      steps,
      toolCalls,
      durationMs: now() - startedAt,
      verified,
    };
  };

  let index = 0;
  let attempt = 0;

  try {
    while (true) {
      checkpoint();
      if (options.signal?.aborted) {
        return finish("cancelled", "You stopped this task.");
      }
      if (now() - startedAt >= limits.maxDurationMs) {
        return finish("timeout", "This task ran longer than its time budget and was stopped.");
      }
      if (index >= limits.maxSteps) {
        return finish("step_limit", `This task reached its limit of ${limits.maxSteps} steps.`);
      }

      let decision: AgentDecision;
      try {
        decision = await abortable(() => options.driver.next(steps, controller.signal), controller.signal);
        checkpoint();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return finish("failed", errorMessage(error));
      }

      if (decision.done === true) {
        let outcome: ToolOutcome;
        try {
          outcome = await abortable(() => options.driver.verify(steps, controller.signal), controller.signal);
          checkpoint();
        } catch (error) {
          if (controller.signal.aborted) throw error;
          return finish("failed", errorMessage(error));
        }
        verified = outcome.ok;
        return outcome.ok
          ? finish("completed", outcome.summary)
          : finish("failed", `Verification did not pass: ${outcome.summary}`);
      }

      if (decision.call === null) {
        // A thinking-only step still counts against the step budget.
        steps.push({ index, label: decision.label, call: null, outcome: null, attempt });
        emit({ type: "step.started", index, label: decision.label });
        emit({ type: "step.completed", index, ok: true });
        index += 1;
        attempt = 0;
        continue;
      }

      if (toolCalls >= limits.maxToolCalls) {
        return finish("tool_limit", `This task reached its limit of ${limits.maxToolCalls} tool calls.`);
      }

      const key = fingerprint(decision.call);
      const repeats = (seen.get(key) ?? 0) + 1;
      seen.set(key, repeats);
      if (repeats >= limits.repeatThreshold) {
        return finish(
          "loop_detected",
          `ORBIT repeated the same ${decision.call.tool} call ${repeats} times without progress, so the task was stopped.`,
        );
      }

      emit({ type: "step.started", index, label: decision.label });
      emit({ type: "tool.called", call: decision.call });

      let outcome: ToolOutcome;
      try {
        outcome = await abortable(() => options.driver.execute(decision.call!, controller.signal), controller.signal);
        checkpoint();
        toolCalls += 1;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (error instanceof PermissionDeniedError) {
          steps.push({ index, label: decision.label, call: decision.call, outcome: null, attempt });
          return finish("denied", error.message);
        }
        toolCalls += 1;
        outcome = { ok: false, summary: errorMessage(error) };
      }

      emit({ type: "tool.result", outcome });
      steps.push({ index, label: decision.label, call: decision.call, outcome, attempt });
      emit({ type: "step.completed", index, ok: outcome.ok });

      if (outcome.ok) {
        index += 1;
        attempt = 0;
      } else {
        attempt += 1;
        if (attempt > limits.maxRetriesPerStep) {
          return finish(
            "retry_limit",
            `The step "${decision.label}" failed ${attempt} times and was not retried again.`,
          );
        }
        index += 1;
      }
    }
  } catch (error) {
    if (controller.signal.aborted)
      return finish(timedOut ? "timeout" : "cancelled", timedOut ? "Time budget exceeded." : "Task cancelled.");
    return finish("failed", errorMessage(error));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "An unexpected error interrupted the task.";
}
