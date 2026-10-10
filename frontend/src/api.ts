import { invoke } from "@tauri-apps/api/core";
export type Settings = {
  projects: string[];
  workspace: string | null;
  model: string;
  verificationCommand: string;
  filesEnabled: boolean;
  terminalEnabled: boolean;
  closeBehavior: "exit" | "tray";
  notifications: boolean;
  shortcut: string;
  paletteShortcut: string;
  settingsShortcut: string;
  newTaskShortcut: string;
  onboarding: boolean;
  trayExplained: boolean;
};
export type Desktop = {
  settings: Settings;
  projects: { path: string; available: boolean }[];
  hasKey: boolean;
  version: string;
  warning: string;
  autostart: boolean;
};
export type Event = { type: string; taskId: string; at: number; data: Record<string, unknown> };
export type Pending = { id: string; kind: "plan" | "diff" | "permission"; data: Record<string, unknown> };
export type Status = {
  paused?: boolean;
  configured: boolean;
  workspace: string | null;
  busy: boolean;
  current: null | { id: string; running: boolean; result?: { reason: string; verified: boolean } };
  pending: Pending[];
  events: Event[];
};
export type Task = { id: string; workspace: string; request: string; status: string; updated: number };
export const native = invoke;
export const core = async <T = unknown>(method: string, params: unknown = {}): Promise<T> => {
  const result = await invoke<T>("core_command", { method, params });
  const message: Record<string, string> = {
    "ai.saveProfile": "Saved",
    "ai.memoryAdd": "Memory saved",
    "ai.knowledgeNote": "Added to Knowledge",
    "ai.localOnly": "Privacy preference updated",
    "ai.knowledgeSpaceAccess": "Access updated",
  };
  if (message[method]) dispatchEvent(new CustomEvent("orbit-notice", { detail: message[method] }));
  return result;
};
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const displayValue = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");
