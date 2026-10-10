import { z } from "zod";
import { endpointFetch, validateEndpoint } from "./endpoints.js";
import { jsonBody, request, type Fetcher } from "./transport.js";
export async function ollamaLoaded(endpoint: string, fetcher?: Fetcher, signal?: AbortSignal) {
  const base = validateEndpoint(endpoint, true);
  const value = await jsonBody(
    await request(
      new URL("/api/ps", base).href,
      { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500) },
      fetcher ?? endpointFetch(base, true),
      1,
    ),
  );
  return z
    .object({
      models: z
        .array(
          z.object({
            name: z.string(),
            digest: z.string(),
            size: z.number().nonnegative(),
            size_vram: z.number().nonnegative().optional(),
            context_length: z.number().positive().optional(),
          }),
        )
        .max(500),
    })
    .parse(value).models;
}
/** Caller must validate actual Ollama inventory and serialize this operation against inference. */
export async function unloadOllama(endpoint: string, model: string, signal: AbortSignal) {
  const base = validateEndpoint(endpoint, true);
  const value = await jsonBody(
    await request(
      new URL("/api/generate", base).href,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: 0 }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      },
      endpointFetch(base, true),
      1,
    ),
  );
  z.object({ done: z.literal(true) }).parse(value);
  const remaining = await ollamaLoaded(endpoint);
  if (remaining.some((m) => m.name === model))
    throw new Error("Runtime still reports the model as loaded. Another application may be using it.");
  return { unloaded: true, model };
}
