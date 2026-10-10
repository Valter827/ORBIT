/** Product roles, never weight identities or ownership claims. */
import { candidateCatalog } from "./candidate-catalog.js";
export const brainAliases = {
  Fast: "COSMO Swift",
  Main: "COSMO Core",
  Logic: "COSMO Logic",
  Code: "COSMO Forge",
  Vision: "COSMO Sight",
  Embedding: "COSMO Recall",
} as const;
export type BrainRole = keyof typeof brainAliases;
export type BrainBinding = {
  provider: string;
  model: string;
  benchmarkId?: string;
  digest?: string;
};
export type BrainAlias = {
  alias: (typeof brainAliases)[BrainRole];
  role: BrainRole;
  underlyingModelId: string;
  provider: string;
  benchmarkId: string | null;
  digest: string | null;
};
export function resolveBrainAliases(bindings: Partial<Record<BrainRole, BrainBinding>> = {}): BrainAlias[] {
  return (Object.keys(brainAliases) as BrainRole[]).flatMap((role) => {
    const binding = bindings[role];
    return binding
      ? [
          {
            alias: brainAliases[role],
            role,
            underlyingModelId: binding.model,
            provider: binding.provider,
            benchmarkId: binding.benchmarkId ?? null,
            digest: binding.digest ?? null,
          },
        ]
      : [];
  });
}
export function brainLabel(settings?: { auto?: boolean; manualRole?: BrainRole; mode?: string }) {
  if (settings?.manualRole) return brainAliases[settings.manualRole];
  return settings?.auto ? "COSMO · Auto" : "COSMO · Manual";
}
export function modelProvenance(model: { model: string; provider: string; metadata?: Record<string, unknown> }) {
  const m = model.metadata ?? {};
  const catalog = candidateCatalog.find((c) => c.model === model.model && c.digest === m["digest"]);
  const text = (key: string) => (typeof m[key] === "string" && m[key] ? String(m[key]) : "UNKNOWN");
  return {
    underlyingModel: model.model,
    family: text("family"),
    runtime: text("runtime"),
    quantization: text("quantization_level"),
    source: catalog?.source ?? text("source"),
    license: catalog?.license ?? text("license"),
    digest: text("digest"),
    ownership: "Third-party model; COSMO names identify ORBIT roles, not ORBIT-created weights.",
  };
}
