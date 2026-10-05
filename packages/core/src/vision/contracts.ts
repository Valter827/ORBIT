/**
 * Future ORBIT Vision contracts only. No implementation, registration, IPC,
 * capture, launcher or action authority is enabled by importing this module.
 */
export type CaptureScope =
  | { kind: "current-window"; windowId: string }
  | { kind: "application"; applicationId: string; windowId: string }
  | { kind: "display"; displayId: string };

export interface WindowIdentity {
  readonly id: string;
  readonly applicationId: string;
  readonly title: string;
  readonly observedAt: number;
}
export interface InstalledApplication {
  readonly id: string;
  readonly displayName: string;
  /** Resolved by trusted OS discovery, never an AI/user command string. */
  readonly executablePath: string;
}
export interface AccessibilityTarget {
  readonly windowId: string;
  readonly snapshotId: string;
  readonly elementId: string;
}
export interface AccessibilityNode {
  readonly target: AccessibilityTarget;
  readonly role: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly protected: boolean;
  readonly children: readonly AccessibilityNode[];
}
export interface ScreenSnapshot {
  readonly id: string;
  readonly scope: CaptureScope;
  readonly capturedAt: number;
  /** Broker-owned opaque handle; raw screen bytes must not enter audit logs. */
  readonly imageHandle?: string;
  readonly visibleText: string;
  readonly redacted: boolean;
}
export type ComputerActionRequest =
  | { kind: "launch"; applicationId: string }
  | { kind: "focus"; windowId: string }
  | { kind: "click"; target: AccessibilityTarget }
  | { kind: "type"; target: AccessibilityTarget; text: string }
  | { kind: "scroll"; target: AccessibilityTarget; direction: "up" | "down"; amount: number };

/** Compile-time boundary only; a future broker must verify runtime receipts too. */
declare const brokerAuthorization: unique symbol;
export interface BrokerReceipt {
  readonly [brokerAuthorization]: true;
  readonly id: string;
  readonly taskId: string;
  readonly subjectId: string;
  readonly operation: "capture" | "inspect" | "vision" | "launch" | "act" | "voice";
  readonly requestDigest: string;
  readonly expiresAt: number;
}
export interface ScreenContextProvider {
  capture(scope: CaptureScope, receipt: BrokerReceipt, signal: AbortSignal): Promise<ScreenSnapshot>;
}
export interface WindowProvider {
  activeWindow(receipt: BrokerReceipt, signal: AbortSignal): Promise<WindowIdentity | null>;
  list(receipt: BrokerReceipt, signal: AbortSignal): Promise<readonly WindowIdentity[]>;
}
export interface AccessibilityProvider {
  inspect(windowId: string, receipt: BrokerReceipt, signal: AbortSignal): Promise<AccessibilityNode>;
}
export interface VisionProvider {
  /** Cloud processing requires separate destination-specific consent. */
  interpret(snapshot: ScreenSnapshot, question: string, receipt: BrokerReceipt, signal: AbortSignal): Promise<string>;
}
export interface ApplicationLauncher {
  resolveInstalled(
    applicationId: string,
    receipt: BrokerReceipt,
    signal: AbortSignal,
  ): Promise<InstalledApplication | null>;
  launch(
    application: InstalledApplication,
    receipt: BrokerReceipt,
    signal: AbortSignal,
  ): Promise<WindowIdentity | null>;
}
export interface VoiceProvider {
  transcribe(receipt: BrokerReceipt, signal: AbortSignal): Promise<string>;
  speak(text: string, receipt: BrokerReceipt, signal: AbortSignal): Promise<void>;
}
export interface ComputerActionProvider {
  execute(
    request: ComputerActionRequest,
    receipt: BrokerReceipt,
    signal: AbortSignal,
  ): Promise<{
    outcome: "performed" | "rejected" | "cancelled";
    verification: string;
  }>;
}
