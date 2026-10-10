export type EventType =
  | "provider.usage"
  | "agent.created"
  | "agent.started"
  | "agent.cancelled"
  | "agent.timed_out"
  | "agent.completed"
  | "agent.failed"
  | "plan.created"
  | "plan.approved"
  | "plan.rejected"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "permission.required"
  | "permission.granted"
  | "permission.denied"
  | "diff.created"
  | "diff.approved"
  | "diff.rejected"
  | "verification.started"
  | "verification.passed"
  | "verification.failed";
export interface OrbitEvent {
  type: EventType;
  taskId: string;
  at: number;
  data: Record<string, unknown>;
}
export type EmitEvent = (type: EventType, data?: Record<string, unknown>) => Promise<void>;
