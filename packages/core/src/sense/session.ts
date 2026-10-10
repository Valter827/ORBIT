import { z } from "zod";
import { redact, redactDeep } from "../security/redactor.js";
import type { ModelDescriptor } from "../ai/router.js";
export const SenseScope = z.enum(["current-window", "application", "display"]);
export const SenseSnapshot = z
  .object({
    scope: SenseScope,
    window: z
      .object({
        id: z.string().max(30),
        title: z.string().max(1024),
        application: z.string().max(200),
        processId: z.number(),
        started: z.string().max(40),
        foreground: z.boolean(),
      })
      .nullable(),
    capturedAt: z.number(),
    visibleText: z.string().max(16000),
    nodes: z
      .array(z.object({ name: z.string().max(600), role: z.string().max(100), focused: z.boolean() }).strict())
      .max(300),
    ocrText: z.string().max(16000),
    ocrStatus: z.string().max(80),
    image: z
      .string()
      .max(2000000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .nullable(),
    protectedCount: z.number().int().nonnegative(),
    complete: z.boolean(),
    warnings: z.array(z.string().max(300)).max(20),
    url: z.null(),
  })
  .strict();
export type SenseSnapshot = z.infer<typeof SenseSnapshot>;
export function sanitizeSense(value: unknown): SenseSnapshot {
  const snapshot = SenseSnapshot.parse(value);
  const { image, ...structured } = snapshot;
  const cleaned = redactDeep(structured);
  // Include short/quoted credential assignments and partial private-key blocks.
  const source = JSON.stringify(cleaned.value);
  let sensitive = /(?:password|passwd|api[_ -]?key|secret|token|credential)\s*[:=]|-----BEGIN[^]*PRIVATE KEY/i.test(
    source,
  );
  const scrub = (text: string) =>
    redact(text)
      .text.replace(/((?:password|passwd|api[_ -]?key|secret|token|credential)\s*[:=]\s*)[^\r\n]+/gi, "$1[excluded]")
      .replace(/((?:password|passwd|api[_ -]?key|secret|token|credential)[ \t]*\r?\n)[^\r\n]+/gi, "$1[excluded]")
      .replace(/-----BEGIN[\s\S]*PRIVATE KEY[\s\S]*/g, "[private key excluded]");
  const result = cleaned.value;
  result.visibleText = scrub(result.visibleText);
  result.ocrText = scrub(result.ocrText);
  result.nodes = result.nodes.map((n) => ({ ...n, name: scrub(n.name) }));
  if (result.window) result.window.title = scrub(result.window.title);
  sensitive ||= JSON.stringify(result) !== source;
  const blocked =
    sensitive ||
    cleaned.redactions.length > 0 ||
    snapshot.protectedCount > 0 ||
    !snapshot.complete ||
    snapshot.ocrStatus !== "available-confidence-unknown";
  if (sensitive || cleaned.redactions.length)
    result.warnings.push("Sensitive content excluded; image transfer disabled.");
  return { ...result, image: blocked ? null : image };
}
export function senseDestination(config: { id: string; type: string; endpoint: string }, model: string, scope: string) {
  return JSON.stringify([config.id, config.type, config.endpoint, model, scope]);
}
export function assertSenseTransfer(input: {
  enabled: boolean;
  localOnly: boolean;
  local: boolean;
  localInferenceConfirmed: boolean;
  destination: string;
  acknowledgedDestination: string;
}) {
  if (!input.enabled) throw new Error("Enable Sense for this AI first.");
  if (input.localOnly && (!input.local || !input.localInferenceConfirmed))
    throw new Error("LOCAL ONLY: Sense needs an approved local model. No screen context was sent.");
  if (!input.local && input.destination !== input.acknowledgedDestination)
    throw new Error("Acknowledge the selected provider and scope before sending screen context.");
}
export function sensePath(model: ModelDescriptor, snapshot: SenseSnapshot, includeImage: boolean) {
  return includeImage && model.capabilities?.vision === true && !!snapshot.image ? "vision" : "structured-context";
}
export interface OCRProvider {
  read(snapshot: SenseSnapshot, signal: AbortSignal): Promise<{ text: string; confidence: number | null }>;
}
export interface VisionContextProvider {
  analyze(snapshot: SenseSnapshot, question: string, signal: AbortSignal): Promise<string>;
}
/** Ephemeral lease: no capture timers, no persistence, invalidated on stop/restart. */
export class SenseSessionManager {
  private session:
    { profileId: string; scope: z.infer<typeof SenseScope>; started: number; controller: AbortController } | undefined;
  start(profileId: string, scope: unknown, enabled: boolean) {
    this.stop();
    if (!enabled) throw new Error("Sense is disabled.");
    this.session = {
      profileId,
      scope: SenseScope.parse(scope),
      started: Date.now(),
      controller: new AbortController(),
    };
    return this.session;
  }
  get active() {
    return this.session;
  }
  stop() {
    this.session?.controller.abort();
    this.session = undefined;
  }
}
