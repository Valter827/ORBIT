export type Capability = "read" | "search" | "tests" | "gitRead" | "write" | "terminal" | "network" | "gitWrite";
export type Personality =
  "Balanced" | "Professional" | "Friendly" | "Concise" | "Teacher" | "Programmer" | "Custom" | "Creative" | "Technical";
export type Workflow = { id: string; name: string; steps: string[] };
export type Intelligence = {
  generation?: { temperature?: number; topP?: number };
  roles?: Partial<Record<"Fast" | "Main" | "Code" | "Vision" | "Embedding", { provider: string; model: string }>>;
  web?: "off" | "ask" | "allow";
  searchFallback?: "none" | "bing" | "duckduckgo";
  searchProvider?: "none" | "wikipedia" | "bing" | "duckduckgo";
  mode: "fast" | "balanced" | "deep";
  auto: boolean;
  local: boolean;
  anthropic: boolean;
  compatible: boolean;
  cloud: "never" | "ask" | "allow";
  preference: "balanced" | "speed" | "quality";
  contextBudget: number;
};
export const intelligenceDefaults: Intelligence = {
  web: "ask",
  searchProvider: "bing",
  mode: "balanced",
  auto: false,
  local: true,
  anthropic: false,
  compatible: false,
  cloud: "never",
  preference: "balanced",
  contextBudget: 4096,
};
export type Profile = {
  intelligence?: Intelligence;
  schemaVersion: 1;
  builtin?: { id: "cosmo"; version: "1.0" };
  isDraft?: boolean;
  senseEnabled?: boolean;
  id: string;
  name: string;
  description: string;
  icon: "orbit" | "star" | "code" | "book";
  providerId: string;
  modelId: string;
  personality: Personality;
  instructions: string;
  systemPrompt: string;
  capabilities: Capability[];
  permissionPolicy: Record<Capability, "ask" | "task" | "always" | "disabled">;
  memory: {
    conversation: boolean;
    project: boolean;
    user: boolean;
    shared: boolean;
    suggestions?: boolean;
    automatic?: Array<"preference" | "decision" | "goal" | "task">;
  };
  maxTokens: number;
  purposes: string[];
  goal: string;
  traits: { length: number; creativity: number; initiative: number; explanation: number };
  skills: string[];
  workflows: Workflow[];
};
export type Model = {
  model: string;
  displayName?: string;
  contextWindow: number;
  supportsTools: boolean;
  local?: boolean;
  capabilities?: {
    text: boolean | null;
    streaming: boolean | null;
    toolCalling: boolean | null;
    structuredOutput: boolean | null;
    vision: boolean | null;
    contextWindow: number | null;
  };
  metadata?: Record<string, unknown>;
};
export type ProviderConfig = {
  id: string;
  name: string;
  type: "anthropic" | "local" | "compatible";
  endpoint: string;
  remoteAcknowledged: boolean;
  localInferenceConfirmed: boolean;
};
export type Provider = ProviderConfig & { configured: boolean; models: Model[]; discoveredAt: number | null };
export type AIState = {
  profiles: Profile[];
  selected: string;
  readyProfiles?: string[];
  localOnly: boolean;
  providers: Provider[];
  knowledgeCounts?: Record<string, number>;
};
export const capabilityLabels: Record<Capability, string> = {
  read: "Read project files",
  search: "Search project",
  tests: "Run configured tests",
  gitRead: "Read Git changes",
  write: "Create and modify files",
  terminal: "Terminal",
  network: "Network tools (later)",
  gitWrite: "Git write (later)",
};
export const defaultProfile = (): Profile => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  name: "NOVA",
  description: "My personal AI assistant",
  icon: "star",
  providerId: "anthropic",
  modelId: "",
  personality: "Balanced",
  instructions: "",
  systemPrompt: "Help the user with clear and accurate answers.",
  capabilities: ["read", "search"],
  permissionPolicy: {
    read: "ask",
    search: "ask",
    tests: "ask",
    gitRead: "ask",
    write: "ask",
    terminal: "ask",
    network: "disabled",
    gitWrite: "disabled",
  },
  memory: { conversation: true, project: false, user: true, shared: false },
  maxTokens: 2048,
  purposes: [],
  goal: "",
  traits: { length: 50, creativity: 30, initiative: 20, explanation: 50 },
  skills: [],
  workflows: [],
});
export const skillNames: Record<string, string> = {
  "code-reviewer": "Code Reviewer",
  "bug-finder": "Bug Finder",
  summarizer: "Document Summarizer",
  "study-tutor": "Study Tutor",
  "project-explainer": "Project Explainer",
};

export function profileStatus(state: AIState, id: string): string {
  const profile = state.profiles.find((p) => p.id === id);
  const provider = state.providers.find((p) => p.id === profile?.providerId);
  if (!profile?.modelId || !provider?.configured || profile.isDraft) return "! Needs setup";
  if (provider.discoveredAt && !provider.models.some((m) => m.model === profile.modelId)) return "○ Offline";
  return state.readyProfiles?.includes(id) ? "● Ready" : "○ Not tested";
}
