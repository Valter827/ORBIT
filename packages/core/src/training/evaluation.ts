export interface EvalObservation {
  id: string;
  category: string;
  repeat: number;
  passed: boolean;
  elapsedMs: number;
  visibleTokens: number;
}
export interface EvalRun {
  suite: string;
  datasetHash: string;
  baseHash: string;
  configHash: string;
  observations: EvalObservation[];
  complete: boolean;
}
export function compareEvaluations(base: EvalRun, adapter: EvalRun) {
  const reasons: string[] = [];
  if (!base.complete || !adapter.complete) reasons.push("Both evaluations must complete.");
  for (const k of ["suite", "datasetHash", "baseHash", "configHash"] as const)
    if (base[k] !== adapter[k]) reasons.push("Evaluation identity differs: " + k);
  const key = (r: EvalObservation) => r.id + ":" + r.repeat;
  const b = new Map(base.observations.map((r) => [key(r), r]));
  if (
    b.size !== base.observations.length ||
    new Set(adapter.observations.map(key)).size !== adapter.observations.length
  )
    reasons.push("Duplicate evaluation cases.");
  if (b.size !== adapter.observations.length || adapter.observations.some((r) => !b.has(key(r))))
    reasons.push("Case sets differ.");
  const categories = [...new Set(base.observations.map((r) => r.category))];
  const scores = categories.map((category) => {
    const x = base.observations.filter((r) => r.category === category),
      y = adapter.observations.filter((r) => r.category === category);
    return {
      category,
      base: x.filter((r) => r.passed).length / Math.max(1, x.length),
      adapter: y.filter((r) => r.passed).length / Math.max(1, y.length),
      count: x.length,
    };
  });
  // Collapse repeats by item before estimating paired uncertainty; repeated answers are not independent samples.
  const ids = [...new Set(base.observations.map((r) => r.id))];
  const differences = ids.map((id) => {
    const x = base.observations.filter((r) => r.id === id),
      y = adapter.observations.filter((r) => r.id === id);
    return (
      y.filter((r) => r.passed).length / Math.max(1, y.length) -
      x.filter((r) => r.passed).length / Math.max(1, x.length)
    );
  });
  const mean = differences.reduce((a, b) => a + b, 0) / Math.max(1, ids.length);
  const variance = differences.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ids.length - 1);
  const uncertainty = 1.96 * Math.sqrt(variance / Math.max(1, ids.length));
  if (ids.length < 30) reasons.push("At least 30 independent held-out items required for general promotion.");
  if (!(mean > uncertainty && mean > 0)) reasons.push("Improvement does not exceed paired uncertainty.");
  for (const s of scores)
    if (["memory", "knowledge", "security"].includes(s.category) && s.adapter < s.base)
      reasons.push("Critical regression: " + s.category);
  for (const c of ["memory", "knowledge", "security", "russian", "ukrainian", "english", "code", "reasoning"])
    if (!categories.includes(c)) reasons.push("Missing category: " + c);
  if (ids.some((id) => base.observations.filter((r) => r.id === id).length < 2))
    reasons.push("Repeated evaluation required.");
  const baseTime = base.observations.reduce((a, r) => a + r.elapsedMs, 0),
    adapterTime = adapter.observations.reduce((a, r) => a + r.elapsedMs, 0);
  if (baseTime <= 0 || adapterTime <= 0 || adapterTime > baseTime * 1.5)
    reasons.push("Unmeasured or excessive latency cost (limit 1.5x baseline).");
  return {
    eligible: reasons.length === 0,
    reasons,
    scores,
    improvement: mean,
    uncertainty95: uncertainty,
    independentItems: ids.length,
    note: "Statistical screen only; runtime deployment, license, real Memory/Knowledge, vision and tool regressions are additional mandatory gates.",
  };
}
