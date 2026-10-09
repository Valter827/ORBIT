import { z } from "zod";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { AIProvider, ModelDescriptor, CompletionRequest } from "./router.js";
import { checkSignal } from "./transport.js";
import { parseStructured } from "./semantic.js";
export type ProbeState = "SUPPORTED" | "UNSUPPORTED" | "NOT TESTED";
export type ProbeResults = {
  identity: string;
  at: string;
  chat: ProbeState;
  streaming: ProbeState;
  vision: ProbeState;
  structured: ProbeState;
  tools: ProbeState;
  russian: ProbeState;
  context: ProbeState;
  latencyMs?: number;
  note: string;
};
function crc(bytes: Buffer) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let n = 0; n < 8; n++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Buffer) {
  const tag = Buffer.from(name),
    size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([tag, data])));
  return Buffer.concat([size, tag, data, checksum]);
}
export function redSquare() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(32, 0);
  header.writeUInt32BE(32, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(32 * (1 + 32 * 3));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) rows[y * 97 + 1 + x * 3] = 255;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
export function probeIdentity(endpoint: string, model: ModelDescriptor) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        endpoint,
        model.provider,
        model.model,
        model.metadata?.["digest"] ?? null,
        model.metadata?.["runtimeVersion"] ?? null,
      ]),
    )
    .digest("hex");
}
export async function probeModel(
  provider: AIProvider,
  model: ModelDescriptor,
  endpoint: string,
  signal: AbortSignal,
): Promise<ProbeResults> {
  const result: ProbeResults = {
    identity: probeIdentity(endpoint, model),
    at: new Date().toISOString(),
    chat: "NOT TESTED",
    streaming: "NOT TESTED",
    vision: "NOT TESTED",
    structured: "NOT TESTED",
    tools: "NOT TESTED",
    russian: "NOT TESTED",
    context: "NOT TESTED",
    note: "Technical compatibility only. Context maximum is not inferred from these short requests.",
  };
  const run = async (
    key: "chat" | "vision" | "structured" | "tools" | "russian",
    request: Omit<CompletionRequest, "signal">,
    validate: (r: Awaited<ReturnType<AIProvider["complete"]>>) => boolean,
  ) => {
    checkSignal(signal);
    try {
      const start = performance.now();
      const response = await provider.complete(model.model, {
        ...request,
        temperature: 0,
        localReasoningEffort: "none",
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      });
      result[key] =
        !response.text.trim() && !response.toolCalls.length
          ? "NOT TESTED"
          : validate(response)
            ? "SUPPORTED"
            : "UNSUPPORTED";
      if (key === "chat" && result.chat === "SUPPORTED") result.latencyMs = performance.now() - start;
    } catch {
      checkSignal(signal);
      result[key] = "NOT TESTED";
    }
  };
  await run(
    "chat",
    {
      system: "Return only OK. /no_think",
      messages: [{ role: "user", content: "Connection test. Reply OK." }],
      maxTokens: 64,
    },
    (r) => r.text.trim() === "OK" && !r.toolCalls.length,
  );
  await run(
    "structured",
    {
      system: 'Return JSON only: {"color":"red","count":2}. /no_think',
      messages: [{ role: "user", content: "Return the requested object." }],
      maxTokens: 150,
    },
    (r) => {
      try {
        parseStructured(z.object({ color: z.literal("red"), count: z.literal(2) }).strict(), r.text);
        return true;
      } catch {
        return false;
      }
    },
  );
  await run(
    "russian",
    {
      system: "Следуй указанию пользователя. /no_think",
      messages: [{ role: "user", content: "Ответь ровно одним словом: готово" }],
      maxTokens: 100,
    },
    (r) => r.text.trim().toLowerCase().replace(/[.!]/g, "") === "готово",
  );
  if (model.capabilities?.vision === false) result.vision = "UNSUPPORTED";
  else
    await run(
      "vision",
      {
        system: "Answer only the color of the square in the image. /no_think",
        messages: [
          {
            role: "user",
            content: "What color is the square?",
            images: [{ mediaType: "image/png", data: redSquare() }],
          },
        ],
        maxTokens: 100,
      },
      (r) => /\bred\b|красн/iu.test(r.text),
    );
  if (model.capabilities?.toolCalling === false) result.tools = "UNSUPPORTED";
  else
    await run(
      "tools",
      {
        system: "Call the echo_probe tool with value probe-ok. Do not answer in text. /no_think",
        messages: [{ role: "user", content: "Call echo_probe now." }],
        tools: [
          {
            name: "echo_probe",
            description: "Harmless protocol probe. This tool is never executed.",
            schema: {
              type: "object",
              properties: { value: { type: "string", enum: ["probe-ok"] } },
              required: ["value"],
              additionalProperties: false,
            },
          },
        ],
        maxTokens: 200,
      },
      (r) =>
        r.toolCalls.length === 1 &&
        r.toolCalls[0]?.toolName === "echo_probe" &&
        JSON.stringify(r.toolCalls[0].arguments) === JSON.stringify({ value: "probe-ok" }),
    );
  if (provider.stream) {
    try {
      let chunks = 0,
        final = false;
      for await (const event of provider.stream(model.model, {
        system: "Say OK. /no_think",
        localReasoningEffort: "none",
        messages: [{ role: "user", content: "Reply OK." }],
        maxTokens: 64,
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      })) {
        checkSignal(signal);
        if (event.type === "text" && event.text) chunks++;
        if (event.type === "result") final = true;
      }
      result.streaming = chunks > 0 && final ? "SUPPORTED" : "NOT TESTED";
    } catch {
      checkSignal(signal);
    }
  }
  return result;
}
