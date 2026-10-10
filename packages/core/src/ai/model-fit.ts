import type { ModelDescriptor } from "./router.js";
export function estimateModelFit(model: ModelDescriptor, hardware: { freeRamBytes: number; vramBytes: number | null }) {
  const size = model.metadata?.["sizeBytes"];
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0)
    return {
      status: "UNKNOWN",
      estimatedBytes: null,
      note: "Model weight size is unavailable. Run a bounded benchmark to measure behavior.",
    };
  // This is a conservative working-set heuristic, not measured RAM or KV-cache sizing.
  const estimatedBytes = Math.ceil(size * 1.4 + 2 * 2 ** 30);
  const status =
    estimatedBytes > hardware.freeRamBytes
      ? "LIKELY_TOO_LARGE"
      : estimatedBytes > hardware.freeRamBytes * 0.7
        ? "TIGHT"
        : "LIKELY_FITS";
  return {
    status,
    estimatedBytes,
    note: "Estimate: disk weights × 1.4 + 2 GB overhead. Context, architecture and offload can change actual use; this is not a speed or quality score.",
  };
}
