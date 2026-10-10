import { z } from "zod";
import type { AIProvider, CompletionRequest, CompletionResult, ModelDescriptor, StreamEvent } from "../router.js";
import type { SecretStore } from "../../security/secret-store.js";
import { AIProviderError, request, jsonBody, sse, checkSignal, type Fetcher } from "../transport.js";
import { fitContext } from "../context.js";
export { AIProviderError } from "../transport.js";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const SECRET_KEY_NAME = "ANTHROPIC_API_KEY";
const MODELS: ModelDescriptor[] = [
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    contextWindow: 200_000,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "fast",
    supportsTools: true,
    local: false,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    contextWindow: 200_000,
    inputCostPerMTok: null,
    outputCostPerMTok: null,
    tier: "balanced",
    supportsTools: true,
    local: false,
  },
];

const ResponseSchema = z.object({
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("tool_use"), id: z.string().min(1), name: z.string().min(1), input: z.unknown() }),
    ]),
  ),
  model: z.string(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});
export function encodeMessages(
  messages: CompletionRequest["messages"],
): Array<{ role: "user" | "assistant"; content: unknown[] }> {
  const out: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const content: unknown[] =
      m.role === "tool"
        ? [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: JSON.stringify(m.output),
              is_error: m.status === "error",
            },
          ]
        : [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...(m.role === "user"
              ? (m.images ?? []).map((image) => ({
                  type: "image",
                  source: { type: "base64", media_type: image.mediaType, data: image.data },
                }))
              : []),
            ...(m.role === "assistant"
              ? (m.toolCalls ?? []).map((t) => ({
                  type: "tool_use",
                  id: t.toolCallId,
                  name: t.toolName.replaceAll(".", "__"),
                  input: t.arguments,
                }))
              : []),
          ];
    const previous = out.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else out.push({ role, content });
  }
  return out;
}
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  private cache = MODELS;
  constructor(
    private readonly secrets: SecretStore,
    private readonly fetcher: Fetcher = (u, i) => fetch(u, i),
  ) {}
  async isConfigured() {
    return !!(await this.secrets.get(SECRET_KEY_NAME));
  }
  models() {
    return this.cache;
  }
  private async headers() {
    const key = await this.secrets.get(SECRET_KEY_NAME);
    if (!key)
      throw new AIProviderError("not_configured", "No Anthropic API key is configured. Connect AI in Settings.");
    return { "content-type": "application/json", "x-api-key": key, "anthropic-version": API_VERSION };
  }
  async listModels(signal = AbortSignal.timeout(15000)): Promise<ModelDescriptor[]> {
    const headers = await this.headers(),
      models: ModelDescriptor[] = [];
    let after = "";
    for (let page = 0; page < 10; page++) {
      const response = await request(
        "https://api.anthropic.com/v1/models?limit=100" + (after ? "&after_id=" + encodeURIComponent(after) : ""),
        { headers, signal },
        this.fetcher,
      );
      const data = z
        .object({
          data: z.array(
            z.object({
              id: z.string(),
              display_name: z.string().optional(),
              max_input_tokens: z.number().nullable().optional(),
              capabilities: z.record(z.unknown()).nullable().optional(),
            }),
          ),
          has_more: z.boolean().optional(),
          last_id: z.string().nullable().optional(),
        })
        .parse(await jsonBody(response));
      for (const m of data.data) {
        const caps = m.capabilities ?? {};
        const supported = (key: string) => {
          const value = caps[key];
          return typeof value === "object" && value !== null && "supported" in value ? value.supported === true : null;
        };
        models.push({
          provider: this.id,
          model: m.id,
          displayName: m.display_name ?? m.id,
          contextWindow: m.max_input_tokens ?? 0,
          inputCostPerMTok: null,
          outputCostPerMTok: null,
          tier: "balanced",
          supportsTools: true,
          local: false,
          capabilities: {
            text: true,
            streaming: true,
            toolCalling: true,
            vision: supported("image_input"),
            structuredOutput: supported("structured_outputs"),
            contextWindow: m.max_input_tokens ?? null,
          },
        });
      }
      if (!data.has_more) break;
      if (!data.last_id || data.last_id === after)
        throw new AIProviderError("invalid_response", "Invalid model discovery pagination.");
      after = data.last_id;
    }
    if (!models.length) throw new AIProviderError("model_unavailable", "No accessible models were returned.");
    this.cache = models;
    return models;
  }
  private body(model: string, input: CompletionRequest, stream = false) {
    const req = fitContext(input, this.cache.find((m) => m.model === model)?.contextWindow ?? 0);
    return {
      model,
      system: [
        req.system,
        ...req.messages.filter((m) => m.role === "system").map((m) => ("content" in m ? m.content : "")),
      ].join("\n"),
      messages: encodeMessages(req.messages),
      max_tokens: req.maxTokens,
      stream,
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              name: t.name.replaceAll(".", "__"),
              description: t.description,
              input_schema: t.schema,
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
      API_URL,
      { method: "POST", headers: await this.headers(), body: JSON.stringify(this.body(model, input)), signal },
      this.fetcher,
    );
    let data: z.infer<typeof ResponseSchema>;
    try {
      data = ResponseSchema.parse(await jsonBody(response));
    } catch {
      checkSignal(signal);
      throw new AIProviderError("invalid_response", "Anthropic returned an invalid message.");
    }
    checkSignal(signal);
    return {
      text: data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
      toolCalls: data.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ toolCallId: b.id, toolName: b.name.replaceAll("__", "."), arguments: b.input })),
      usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
      model: data.model,
    };
  }
  async *stream(model: string, input: CompletionRequest): AsyncGenerator<StreamEvent> {
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    const response = await request(
      API_URL,
      { method: "POST", headers: await this.headers(), body: JSON.stringify(this.body(model, input, true)), signal },
      this.fetcher,
    );
    let text = "",
      actualModel = model,
      inputTokens: number | undefined,
      outputTokens: number | undefined,
      ended = false;
    const calls = new Map<number, { id: string; name: string; json: string }>();
    for await (const event of sse(response, signal)) {
      if (event.type === "error")
        throw new AIProviderError("api_error", "Anthropic stream failed. Regenerate to retry.");
      if (event.type === "message_start") {
        const m = z
          .object({ model: z.string(), usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }) })
          .parse(event.message);
        actualModel = m.model;
        inputTokens = m.usage.input_tokens;
        outputTokens = m.usage.output_tokens;
      }
      if (event.type === "content_block_start") {
        const b = z
          .object({ type: z.string(), id: z.string().optional(), name: z.string().optional() })
          .parse(event.content_block);
        if (b.type === "tool_use" && b.id && b.name)
          calls.set(Number(event.index), { id: b.id, name: b.name, json: "" });
      }
      if (event.type === "content_block_delta") {
        const d = z
          .object({ type: z.string(), text: z.string().optional(), partial_json: z.string().optional() })
          .parse(event.delta);
        if (d.type === "text_delta" && d.text) {
          text += d.text;
          yield { type: "text", text: d.text };
        }
        if (d.type === "input_json_delta") {
          const call = calls.get(Number(event.index));
          if (!call) throw new AIProviderError("invalid_response", "Tool delta has no matching call.");
          call.json += d.partial_json ?? "";
        }
      }
      if (event.type === "message_delta") {
        const u = z.object({ output_tokens: z.number() }).safeParse(event.usage);
        if (u.success) outputTokens = u.data.output_tokens;
      }
      if (event.type === "message_stop") ended = true;
    }
    if (!ended) throw new AIProviderError("network", "Anthropic stream ended before completion.");
    const toolCalls = [...calls.values()].map((c) => {
      let args: unknown;
      try {
        args = JSON.parse(c.json || "{}");
      } catch {
        throw new AIProviderError("invalid_response", "Malformed tool-call arguments.");
      }
      return { toolCallId: c.id, toolName: c.name.replaceAll("__", "."), arguments: args };
    });
    yield {
      type: "result",
      result: {
        text,
        toolCalls,
        model: actualModel,
        ...(inputTokens !== undefined && outputTokens !== undefined ? { usage: { inputTokens, outputTokens } } : {}),
      },
    };
  }
}
