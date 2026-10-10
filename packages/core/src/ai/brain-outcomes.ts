export type BrainOutcome = "PASS" | "FAIL" | "TIMEOUT" | "OOM" | "UNSUPPORTED";
/** Preserve the original score; add an auditable failure class without treating slow answers as timeouts. */
export function brainOutcome(
  c: { passed: boolean; error?: string; elapsedMs: number },
  deadlineMs = 60000,
): BrainOutcome {
  if (c.passed) return "PASS";
  const error = c.error ?? "";
  if (/out of memory|\boom\b|failed to allocate|unable to allocate/i.test(error)) return "OOM";
  if (
    /timeout|timed out|deadline exceeded/i.test(error) ||
    (/abort|cancel/i.test(error) && c.elapsedMs >= deadlineMs - 1000)
  )
    return "TIMEOUT";
  if (/not supported|does not support|unsupported/i.test(error)) return "UNSUPPORTED";
  return "FAIL";
}
