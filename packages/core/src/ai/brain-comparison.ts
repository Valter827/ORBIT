import { BRAIN_EVAL_SUITE } from "./brain-eval.js";

type Hardware = {
  cpu: string;
  cores: number;
  ramBytes: number;
  gpu: string | null;
  vramBytes: number | null;
  architecture: string;
};
type Measurement = {
  suite: string;
  status: string;
  provider: string;
  model: string;
  configuration: object;
  hardware?: Hardware;
  metadata: Record<string, unknown>;
  cases: { name: string; category: string }[];
};
/** Comparison validity is independent of scores and model popularity. */
export function comparableBrainResults(
  results: Measurement[],
  inventory: { provider: string; model: string; metadata?: Record<string, unknown> }[],
  hardware?: Hardware,
): boolean {
  const first = results[0];
  if (results.length < 2 || !first || !hardware) return false;
  const canonical = (value: object) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const tasks = (r: Measurement) => JSON.stringify(r.cases.map((c) => [c.category, c.name]).sort());
  return results.every(
    (r) =>
      r.status === "COMPLETE" &&
      r.suite === BRAIN_EVAL_SUITE &&
      r.cases.length > 0 &&
      typeof r.metadata["digest"] === "string" &&
      r.metadata["digest"].length > 0 &&
      inventory.some(
        (m) => m.provider === r.provider && m.model === r.model && m.metadata?.["digest"] === r.metadata["digest"],
      ) &&
      canonical(r.configuration) === canonical(first.configuration) &&
      tasks(r) === tasks(first) &&
      r.hardware !== undefined &&
      (["cpu", "cores", "ramBytes", "gpu", "vramBytes", "architecture"] as const).every(
        (field) => r.hardware?.[field] === hardware[field],
      ),
  );
}
