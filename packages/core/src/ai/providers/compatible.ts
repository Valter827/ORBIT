import { z } from "zod";
import type { AIProvider, ModelDescriptor, CompletionRequest, CompletionResult, StreamEvent } from "../router.js";
import { request, jsonBody, sse, checkSignal, AIProviderError, type Fetcher } from "../transport.js";
import { validateEndpoint, endpointFetch } from "../endpoints.js";
import { fitContext } from "../context.js";
export class CompatibleProvider implements AIProvider {
  private cache: ModelDescriptor[] = [];
  private readonly base: URL;
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
    const response = await request(
      new URL("models", this.base).href,
      { headers: await this.headers(), signal },
      this.fetcher,
    );
    const data = z
      .object({
        data: z.array(
          z.object({
            id: z.string(),
            context_length: z.number().optional(),
            capabilities: z.array(z.string()).optional(),
          }),
        ),
      })
      .parse(await jsonBody(response));
    this.cache = data.data.slice(0, 500).map((m) => ({
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
    let runtimeVersion: string | undefined;
    const digests = new Map<string, string>();
    if (this.local && this.base.port === "11434") {
      try {
        const version = (await jsonBody(
          await request(new URL("/api/version", this.base).href, { signal }, this.fetcher, 1),
        )) as { version?: string };
        runtimeVersion = version.version;
        const tags = (await jsonBody(
          await request(new URL("/api/tags", this.base).href, { signal }, this.fetcher, 1),
        )) as { models?: Array<{ name: string; digest: string }> };
        for (const item of tags.models ?? []) digests.set(item.name, item.digest);
      } catch {
        checkSignal(signal);
      }
    }
    // Ollama exposes factual model capabilities and metadata; other compatible servers remain unknown.
    if (this.local && this.base.port === "11434") {
      for (const m of this.cache) {
        try {
          const response = await request(
            new URL("/api/show", this.base).href,
            { method: "POST", headers: await this.headers(), body: JSON.stringify({ model: m.model }), signal },
            this.fetcher,
            1,
          );
          const info = z
            .object({
              capabilities: z.array(z.string()).optional(),
              details: z.record(z.unknown()).optional(),
              model_info: z.record(z.unknown()).optional(),
              remote_host: z.string().optional(),
            })
            .parse(await jsonBody(response));
          m.metadata = {
            ...info.details,
            runtimeVersion,
            digest: digests.get(m.model),
            ...(info.remote_host ? { remote: true } : {}),
          };
          m.supportsTools = !!info.capabilities?.includes("tools");
          const size = Object.entries(info.model_info ?? {}).find(([k]) => k.endsWith(".context_length"))?.[1];
          if (typeof size === "number") m.contextWindow = size;
          m.capabilities = {
            text: info.capabilities ? info.capabilities.includes("completion") : true,
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
    }
    return this.cache;
  }
  private body(model: string, input: CompletionRequest, stream: boolean) {
    const req = fitContext(input, this.cache.find((m) => m.model === model)?.contextWindow ?? 0);
    return {
      model,
      stream,
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
      ...(req.responseFormat &&
      ((this.local && this.base.port === "11434") ||
        this.cache.find((m) => m.model === model)?.capabilities?.structuredOutput === true)
        ? {
            response_format: req.responseSchema
              ? {
                  type: "json_schema",
                  json_schema: { name: "orbit_analysis", strict: true, schema: req.responseSchema },
                }
              : { type: req.responseFormat },
          }
        : {}),
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
