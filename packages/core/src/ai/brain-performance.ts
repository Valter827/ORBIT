import { freemem } from "node:os";
import { z } from "zod";
import { validateEndpoint, endpointFetch } from "./endpoints.js";
import { request, checkSignal } from "./transport.js";
import { ollamaLoaded, unloadOllama } from "./ollama-controls.js";

/** Caller serializes against application inference. No prompts, answers or thinking traces are retained. */
export async function measureBrainPerformance(endpoint: string, model: string, signal: AbortSignal) {
  const base = validateEndpoint(endpoint, true);
  const fetcher = endpointFetch(base, true);
  const before = await ollamaLoaded(endpoint, undefined, signal);
  if (before.some((m) => m.name === model)) await unloadOllama(endpoint, model, signal);
  const samples = [];
  for (let run = 0; run < 4; run++) {
    checkSignal(signal);
    const started = performance.now();
    let ttftMs: number | null = null;
    let final: { loadMs: number | null; decodeTokensPerSecond: number | null; outputTokens: number | null } | null =
      null;
    const response = await request(
      new URL("/api/generate", base).href,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: "Give a short factual definition of a triangle. Return the answer only.",
          stream: true,
          keep_alive: "5m",
          options: { temperature: 0, num_ctx: 4096, num_predict: 256 },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      },
      fetcher,
      1,
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Performance probe has no response stream");
    let buffer = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    const line = (raw: string) => {
      if (!raw.trim()) return;
      const event = z
        .object({
          response: z.string().optional(),
          done: z.boolean().optional(),
          load_duration: z.number().nonnegative().optional(),
          eval_count: z.number().nonnegative().optional(),
          eval_duration: z.number().nonnegative().optional(),
          error: z.string().optional(),
        })
        .parse(JSON.parse(raw));
      if (event.error) throw new Error("Runtime rejected performance probe");
      if (event.response && ttftMs === null) ttftMs = performance.now() - started;
      if (event.done)
        final = {
          loadMs: event.load_duration === undefined ? null : event.load_duration / 1e6,
          decodeTokensPerSecond:
            event.eval_count !== undefined && event.eval_duration
              ? event.eval_count / (event.eval_duration / 1e9)
              : null,
          outputTokens: event.eval_count ?? null,
        };
    };
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        const chunk = z.instanceof(Uint8Array).parse(part.value);
        bytes += chunk.length;
        if (bytes > 2_000_000) throw new Error("Performance probe response too large");
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          line(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
      }
      buffer += decoder.decode();
      line(buffer);
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!final) throw new Error("Incomplete performance stream");
    const resident = (await ollamaLoaded(endpoint, undefined, signal)).find((m) => m.name === model);
    samples.push({
      kind: run === 0 ? "cold" : "warm",
      ttftMs,
      totalMs: performance.now() - started,
      ...(final as { loadMs: number | null; decodeTokensPerSecond: number | null; outputTokens: number | null }),
      residentBytes: resident?.size ?? null,
      vramBytes: resident?.size_vram ?? null,
      activeContext: resident?.context_length ?? null,
      hostFreeRamBytes: freemem(),
    });
  }
  return {
    samples,
    context: 4096,
    maxOutputTokens: 256,
    thinking: "runtime default; thinking text discarded",
    note: "One unloaded start and three warm calls. Resident bytes are runtime-reported, not private-process RSS; host free RAM is not model RAM. Other applications may affect measurements.",
  };
}
