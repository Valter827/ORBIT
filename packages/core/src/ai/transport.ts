import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export class AIProviderError extends Error {
  constructor(
    public readonly kind:
      | "not_configured"
      | "auth"
      | "rate_limited"
      | "api_error"
      | "network"
      | "timeout"
      | "cancelled"
      | "model_unavailable"
      | "context_limit"
      | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
export function abortError(signal?: AbortSignal): never {
  throw new AIProviderError(
    signal?.reason instanceof Error && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled",
    signal?.reason instanceof Error && signal.reason.name === "TimeoutError"
      ? "AI provider timed out."
      : "Generation stopped.",
  );
}
export function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) abortError(signal);
}
export async function request(
  url: string,
  init: RequestInit,
  fetcher: Fetcher = (u, i) => fetch(u, i),
  attempts = 3,
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(60000);
  for (let n = 0; n < attempts; n++) {
    checkSignal(signal);
    let response: Response;
    try {
      response = await fetcher(url, { ...init, signal, redirect: "error" });
    } catch {
      checkSignal(signal);
      if (n + 1 < attempts) {
        await delay(250 * 2 ** n, undefined, { signal }).catch(() => abortError(signal));
        continue;
      }
      throw new AIProviderError("network", "AI provider is unreachable. Check the endpoint and connection.");
    }
    if (response.ok) return response;
    await response.body?.cancel().catch(() => {});
    if ((response.status === 429 || response.status >= 500) && n + 1 < attempts) {
      await delay(250 * 2 ** n, undefined, { signal }).catch(() => abortError(signal));
      continue;
    }
    if ([401, 403].includes(response.status)) throw new AIProviderError("auth", "Invalid API key or access denied.");
    if (response.status === 429)
      throw new AIProviderError("rate_limited", "Provider rate limit reached. Try again shortly.");
    if (response.status === 404)
      throw new AIProviderError(
        "model_unavailable",
        "Model or endpoint is unavailable. Refresh models and check your selection.",
      );
    if (response.status === 413)
      throw new AIProviderError("context_limit", "Context is too large. Start a new chat or select less context.");
    throw new AIProviderError(
      "api_error",
      `Provider request failed (HTTP ${response.status}). Check the model and request settings.`,
    );
  }
  throw new AIProviderError("api_error", "Provider request failed.");
}
export async function jsonBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIProviderError("invalid_response", "Empty provider response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      const bytes = z.instanceof(Uint8Array).parse(r.value);
      size += bytes.length;
      if (size > 4_000_000) throw new Error();
      chunks.push(bytes);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AIProviderError("invalid_response", "Provider returned an invalid or oversized response.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function* sse(response: Response, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIProviderError("invalid_response", "Provider returned no stream.");
  let buffer = "",
    total = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      checkSignal(signal);
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes = z.instanceof(Uint8Array).parse(chunk.value);
      total += bytes.length;
      if (total > 8_000_000) throw new AIProviderError("invalid_response", "Provider response exceeded the limit.");
      buffer += decoder.decode(bytes, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          yield z.record(z.unknown()).parse(JSON.parse(data));
        } catch (e) {
          if (e instanceof AIProviderError) throw e;
          throw new AIProviderError("invalid_response", "Malformed provider stream.");
        }
      }
      if (buffer.length > 1_000_000)
        throw new AIProviderError("invalid_response", "Provider stream frame is too large.");
    }
    checkSignal(signal);
  } catch (e) {
    checkSignal(signal);
    if (e instanceof AIProviderError) throw e;
    throw new AIProviderError("network", "Provider stream was interrupted. Regenerate to retry.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
