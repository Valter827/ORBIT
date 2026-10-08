import type { AIProvider, CompletionRequest, ModelDescriptor, StreamEvent } from "./router.js";
import { AIProviderError, checkSignal } from "./transport.js";
import { fitContext } from "./context.js";
export type Brain = { provider: AIProvider; model: ModelDescriptor };
/** At most one switch, before any output. Cancellation and manual selection never trigger fallback. */
export async function* brainResponse(
  initial: Brain,
  request: CompletionRequest,
  fallback?: (failed: Brain, error: AIProviderError) => Promise<Brain>,
): AsyncGenerator<StreamEvent> {
  let current = initial;
  for (let attempt = 0; attempt < 2; attempt++) {
    let emitted = false;
    try {
      checkSignal(request.signal);
      const fitted = fitContext(request, current.model.contextWindow);
      if (current.provider.stream && current.model.capabilities?.streaming !== false) {
        for await (const event of current.provider.stream(current.model.model, fitted)) {
          checkSignal(request.signal);
          if (event.type === "text" && event.text) emitted = true;
          if (event.type === "result") emitted = true;
          yield event;
        }
      } else {
        const result = await current.provider.complete(current.model.model, fitted);
        checkSignal(request.signal);
        yield { type: "result", result };
      }
      return;
    } catch (error) {
      checkSignal(request.signal);
      if (
        attempt ||
        emitted ||
        !fallback ||
        !(error instanceof AIProviderError) ||
        !["network", "timeout", "model_unavailable", "context_limit", "api_error"].includes(error.kind)
      )
        throw error;
      const next = await fallback(current, error);
      if (next.model.provider === current.model.provider && next.model.model === current.model.model) throw error;
      current = next;
    }
  }
}
