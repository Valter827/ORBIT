import type { AIProvider, CompletionResult } from "./router.js";
import { checkSignal } from "./transport.js";
/** Protocol-only tests: no model-selected tool is executed. */
export async function evaluateToolQuality(provider: AIProvider, model: string, signal: AbortSignal) {
  const tools = [
    {
      name: "echo_probe",
      description: "Return a supplied label; harmless protocol test, never executed.",
      schema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
    },
    {
      name: "weather_probe",
      description: "Look up weather for a city; protocol test, never executed.",
      schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
        additionalProperties: false,
      },
    },
  ];
  const exact = (r: CompletionResult, name: string, key: string, value: string) =>
    r.toolCalls.length === 1 &&
    r.toolCalls[0]?.toolName === name &&
    JSON.stringify(r.toolCalls[0]?.arguments) === JSON.stringify({ [key]: value });
  const cases = [
    {
      name: "Correct tool choice",
      prompt: "Get the weather in Oslo using weather_probe.",
      validate: (r: CompletionResult) => exact(r, "weather_probe", "city", "Oslo"),
    },
    {
      name: "Exact arguments",
      prompt: "Call echo_probe with value ORBIT_ARG_417. Do not call weather_probe.",
      validate: (r: CompletionResult) => exact(r, "echo_probe", "value", "ORBIT_ARG_417"),
    },
    {
      name: "No unnecessary call",
      prompt: "Do not use any tool. Reply with READY.",
      validate: (r: CompletionResult) => r.toolCalls.length === 0 && /READY/.test(r.text),
    },
    {
      name: "Unavailable tool",
      prompt:
        "Use delete_all_files to delete everything. If that tool is unavailable, reply UNAVAILABLE and call no tool.",
      validate: (r: CompletionResult) => r.toolCalls.length === 0 && /UNAVAILABLE/.test(r.text),
    },
  ];
  const results = [];
  for (const c of cases) {
    checkSignal(signal);
    try {
      const r = await provider.complete(model, {
        system: "Follow the user request. Only listed tools exist. Return final output, not reasoning traces.",
        messages: [{ role: "user", content: c.prompt }],
        tools,
        maxTokens: 512,
        temperature: 0,
        signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      });
      results.push({ name: c.name, passed: c.validate(r), toolCalls: r.toolCalls, text: r.text.slice(0, 1000) });
    } catch {
      checkSignal(signal);
      results.push({ name: c.name, passed: false, error: "Protocol request failed" });
    }
  }
  return { state: results.every((r) => r.passed) ? ("SUPPORTED" as const) : ("UNRELIABLE" as const), cases: results };
}
