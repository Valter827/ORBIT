import { ollamaLoaded } from "../ollama-controls.js";
import { z } from "zod";
import type { AIProvider, ModelDescriptor, CompletionRequest, CompletionResult, StreamEvent } from "../router.js";
import { request, jsonBody, sse, checkSignal, AIProviderError, type Fetcher } from "../transport.js";
import { validateEndpoint, endpointFetch } from "../endpoints.js";
import { OllamaTags } from "../runtime-discovery.js";
import { fitContext } from "../context.js";
export class CompatibleProvider implements AIProvider {
  private cache: ModelDescriptor[] = [];
  private readonly base: URL;
  private ollama = false;
  private readonly fetcher: Fetcher;
  constructor(
    readonly id: string,
    endpoint: string,
    private readonly local: boolean,
    private readonly key: () => Promise<string | null>,
    fetcher?: Fetcher,
  ) {
    this.base = validateEndpoint(endpoint, local);
    this.fetcher = fetcher ?? endpointFetch(this.base, local);
  }
  models() {
    return this.cache;
  }
  isConfigured() {
    return Promise.resolve(true);
  }
  private async headers() {
    const key = await this.key();
    return { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}) };
  }
  async listModels(signal = AbortSignal.timeout(15000)) {
    // Ollama's native inventory is authoritative, independent of its OpenAI shim.
    let tags: z.infer<typeof OllamaTags> | undefined;
    if (this.local) {
      try {
        tags = OllamaTags.parse(
          await jsonBody(
            await request(
              new URL("/api/tags", this.base).href,
              { signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) },
              this.fetcher,
              1,
            ),
          ),
        );
      } catch {
        checkSignal(signal);
      }
    }
    this.ollama = !!tags;
    if (tags) {
      this.cache = tags.models.map((m) => ({
        provider: this.id,
        model: m.name,
        contextWindow: 0,
        inputCostPerMTok: null,
        outputCostPerMTok: null,
        tier: "balanced",
        supportsTools: false,
        local: true,
        metadata: { ...m.details, digest: m.digest, sizeBytes: m.size, runtime: "Ollama", metadataStatus: "UNKNOWN" },
        capabilities: {
          text: false,
          streaming: true,
          toolCalling: null,
          vision: null,
          structuredOutput: null,
          contextWindow: null,
        },
      }));
      // Optional metadata must not make a successful inventory disappear on a short timeout.
      const metadataSignal = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
      let runtimeVersion: string | undefined;
      try {
        const version = z
          .object({ version: z.string().max(100) })
          .parse(
            await jsonBody(
              await request(new URL("/api/version", this.base).href, { signal: metadataSignal }, this.fetcher, 1),
            ),
          );
        runtimeVersion = version.version;
      } catch {
        checkSignal(signal);
      }
      for (const m of this.cache) {
        if (metadataSignal.aborted) break;
        try {
          const info = z
            .object({
              capabilities: z.array(z.string()).optional(),
              details: z.record(z.unknown()).optional(),
              model_info: z.record(z.unknown()).optional(),
              remote_host: z.string().optional(),
              license: z.string().max(200000).optional(),
            })
            .parse(
              await jsonBody(
                await request(
                  new URL("/api/show", this.base).href,
                  {
                    method: "POST",
                    headers: await this.headers(),
                    body: JSON.stringify({ model: m.model }),
                    signal: metadataSignal,
                  },
                  this.fetcher,
                  1,
                ),
              ),
            );
          m.metadata = {
            ...m.metadata,
            ...info.details,
            runtimeVersion,
            metadataStatus: "AVAILABLE",
            declaredCapabilities: info.capabilities ?? [],
            license: info.license?.trim() || "UNKNOWN",
            source: "UNKNOWN",
            ...(info.remote_host ? { remote: true } : {}),
          };
          m.supportsTools = !!info.capabilities?.includes("tools");
          const size = Object.entries(info.model_info ?? {}).find(([k]) => k.endsWith(".context_length"))?.[1];
          if (typeof size === "number" && Number.isSafeInteger(size) && size > 0) m.contextWindow = size;
          m.capabilities = {
            text: info.capabilities?.includes("completion") ?? false,
            streaming: true,
            toolCalling: info.capabilities ? m.supportsTools : null,
            vision: info.capabilities ? info.capabilities.includes("vision") : null,
            structuredOutput: null,
            contextWindow: m.contextWindow || null,
          };
        } catch {
          checkSignal(signal);
        }
      }
    } else {
      const response = await request(
        new URL("models", this.base).href,
        { headers: await this.headers(), signal },
        this.fetcher,
      );
      const data = z
        .object({
          data: z
            .array(
              z.object({
                id: z.string().min(1),
                context_length: z.number().positive().optional(),
                capabilities: z.array(z.string()).optional(),
              }),
            )
            .max(500),
        })
        .parse(await jsonBody(response));
      this.cache = data.data.map((m) => ({
        provider: this.id,
        model: m.id,
        contextWindow: m.context_length ?? 0,
        inputCostPerMTok: null,
        outputCostPerMTok: null,
        tier: "balanced",
        supportsTools: m.capabilities?.includes("tools") ?? false,
        local: this.local,
        capabilities: {
          text: true,
          streaming: true,
          toolCalling: m.capabilities ? m.capabilities.includes("tools") : null,
          vision: m.capabilities ? m.capabilities.includes("vision") : null,
          structuredOutput: null,
          contextWindow: m.context_length ?? null,
        },
      }));
    }
    if (this.ollama && !signal.aborted) {
      const loaded = await ollamaLoaded(this.base.href, this.fetcher, signal).catch(() => null);
      if (loaded)
        for (const model of this.cache) {
          const resident = loaded.find((item) => item.name === model.model);
          model.metadata = {
            ...model.metadata,
            loaded: !!resident,
            loadObservedAt: Date.now(),
            runtimeResidentBytes: resident?.size ?? null,
            gpuMemoryBytes: resident?.size_vram ?? null,
          };
        }
    }
    checkSignal(signal);
    return this.cache;
  }
  private body(model: string, input: CompletionRequest, stream: boolean) {
    const req = fitContext(input, this.cache.find((m) => m.model === model)?.contextWindow ?? 0);
    return {
      model,
      stream,
      ...(stream && this.ollama ? { stream_options: { include_usage: true } } : {}),
      messages: [
        { role: "system", content: req.system },
        ...req.messages.map((m) => {
          if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: JSON.stringify(m.output) };
          return {
            role: m.role,
            content:
              m.role === "user" && m.images?.length
                ? [
                    { type: "text", text: m.content },
                    ...m.images.map((image) => ({
                      type: "image_url",
                      image_url: { url: "data:" + image.mediaType + ";base64," + image.data },
                    })),
                  ]
                : m.content,
            ...(m.role === "assistant" && m.toolCalls?.length
              ? {
                  tool_calls: m.toolCalls.map((t) => ({
                    id: t.toolCallId,
                    type: "function",
                    function: { name: t.toolName.replaceAll(".", "__"), arguments: JSON.stringify(t.arguments) },
                  })),
                }
              : {}),
          };
        }),
      ],
      max_tokens: req.maxTokens,
      ...(this.ollama && req.localReasoningEffort ? { reasoning_effort: req.localReasoningEffort } : {}),
      ...(req.responseFormat
        ? {
            response_format: req.responseSchema
              ? {
                  type: "json_schema",
                  json_schema: { name: "orbit_analysis", strict: true, schema: req.responseSchema },
                }
              : { type: req.responseFormat },
          }
        : {}),
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name.replaceAll(".", "__"), description: t.description, parameters: t.schema },
            })),
          }
        : {}),
    };
  }
  async complete(model: string, input: CompletionRequest): Promise<CompletionResult> {
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    const response = await request(
      new URL("chat/completions", this.base).href,
      { method: "POST", headers: await this.headers(), body: JSON.stringify(this.body(model, input, false)), signal },
      this.fetcher,
    );
    const data = z
      .object({
        model: z.string().optional(),
        choices: z.array(
          z.object({
            message: z.object({
              content: z.string().nullable().optional(),
              tool_calls: z
                .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
                .optional(),
            }),
          }),
        ),
        usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
      })
      .parse(await jsonBody(response));
    checkSignal(signal);
    const m = data.choices[0]?.message;
    if (!m) throw new AIProviderError("invalid_response", "Provider returned no choice.");
    return {
      text: m.content ?? "",
      model: data.model ?? model,
      toolCalls: (m.tool_calls ?? []).map((t) => {
        let args: unknown;
        try {
          args = JSON.parse(t.function.arguments);
        } catch {
          throw new AIProviderError("invalid_response", "Malformed tool-call arguments.");
        }
        return { toolCallId: t.id, toolName: t.function.name.replaceAll("__", "."), arguments: args };
      }),
      ...(data.usage
        ? { usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens } }
        : {}),
    };
  }
  async *stream(model: string, input: CompletionRequest): AsyncGenerator<StreamEvent> {
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    const response = await request(
      new URL("chat/completions", this.base).href,
      { method: "POST", headers: await this.headers(), body: JSON.stringify(this.body(model, input, true)), signal },
      this.fetcher,
    );
    let text = "",
      ended = false,
      actual = model;
    let usage: CompletionResult["usage"];
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const raw of sse(response, signal)) {
      if (raw.error) throw new AIProviderError("api_error", "Compatible provider stream failed.");
      const data = z
        .object({
          model: z.string().optional(),
          choices: z
            .array(
              z.object({
                finish_reason: z.string().nullable().optional(),
                delta: z.object({
                  content: z.string().nullable().optional(),
                  tool_calls: z
                    .array(
                      z.object({
                        index: z.number(),
                        id: z.string().optional(),
                        function: z
                          .object({ name: z.string().optional(), arguments: z.string().optional() })
                          .optional(),
                      }),
                    )
                    .optional(),
                }),
              }),
            )
            .default([]),
          usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullable().optional(),
        })
        .parse(raw);
      actual = data.model ?? actual;
      if (data.usage) usage = { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens };
      const choice = data.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) ended = true;
      if (choice.delta.content) {
        text += choice.delta.content;
        yield { type: "text", text: choice.delta.content };
      }
      for (const t of choice.delta.tool_calls ?? []) {
        const call = calls.get(t.index) ?? { id: "", name: "", args: "" };
        call.id = t.id ?? call.id;
        call.name += t.function?.name ?? "";
        call.args += t.function?.arguments ?? "";
        calls.set(t.index, call);
      }
    }
    if (!ended) throw new AIProviderError("network", "Provider stream ended before completion.");
    const toolCalls = [...calls.values()].map((c) => {
      if (!c.id || !c.name) throw new AIProviderError("invalid_response", "Missing tool identity.");
      let args: unknown;
      try {
        args = JSON.parse(c.args);
      } catch {
        throw new AIProviderError("invalid_response", "Malformed tool call.");
      }
      return { toolCallId: c.id, toolName: c.name.replaceAll("__", "."), arguments: args };
    });
    yield { type: "result", result: { text, model: actual, toolCalls, ...(usage ? { usage } : {}) } };
  }
}
