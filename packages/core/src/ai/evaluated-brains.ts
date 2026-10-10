import { evaluatedBrains } from "./evaluated-brains-data.js";
import type { BrainBinding, BrainRole } from "./brain-aliases.js";
import type { ModelDescriptor } from "./router.js";
export { evaluatedBrains };
export function evaluatedRoleBindings(
  models: ModelDescriptor[],
  hardware: Record<string, unknown>,
): Partial<Record<BrainRole, BrainBinding>> {
  if (!Object.entries(evaluatedBrains.hardware).every(([k, v]) => hardware[k] === v)) return {};
  const roles: Partial<Record<BrainRole, BrainBinding>> = {};
  for (const [role, assignment] of Object.entries(evaluatedBrains.assignments)) {
    const found = models.find(
      (m) =>
        m.local &&
        m.metadata?.["remote"] !== true &&
        m.model === assignment.model &&
        m.metadata?.["digest"] === assignment.digest &&
        m.metadata?.["runtime"] === evaluatedBrains.runtime &&
        m.metadata?.["runtimeVersion"] === evaluatedBrains.runtimeVersion,
    );
    if (
      !found ||
      (role === "Vision" && found.capabilities?.vision !== true) ||
      (role === "Embedding" ? found.capabilities?.text !== false : found.capabilities?.text === false)
    )
      continue;
    roles[role as BrainRole] = {
      provider: found.provider,
      model: found.model,
      digest: assignment.digest,
      benchmarkId: assignment.benchmarkId,
    };
  }
  return roles;
}
