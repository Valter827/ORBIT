import type { AIProvider, CompletionRequest, CompletionResult, ModelDescriptor } from "../../src/ai/router.js";
const model: ModelDescriptor = {
  provider: "anthropic",
  model: "fixture-model",
  contextWindow: 200000,
  inputCostPerMTok: 0,
  outputCostPerMTok: 0,
  tier: "balanced",
  supportsTools: true,
  local: false,
};
function result(text: string, toolName?: string, args: unknown = {}, id = ""): CompletionResult {
  return {
    text,
    toolCalls: toolName ? [{ toolCallId: id, toolName, arguments: args }] : [],
    usage: { inputTokens: 1, outputTokens: 1 },
    model: model.model,
  };
}
export class FixtureProvider implements AIProvider {
  readonly id = "anthropic";
  readonly requests: CompletionRequest[] = [];
  constructor(private readonly mode: "fix" | "fail" | "hang" | "unconfigured" = "fix") {}
  isConfigured(): Promise<boolean> {
    return Promise.resolve(this.mode !== "unconfigured");
  }
  models(): ModelDescriptor[] {
    return [model];
  }
  complete(_model: string, request: CompletionRequest): Promise<CompletionResult> {
    const serializable = { ...request };
    delete serializable.signal;
    this.requests.push(structuredClone(serializable));
    const n = this.requests.length;
    if (this.mode === "hang") return new Promise(() => {});
    if (n === 1) return Promise.resolve(result("Run the tests, inspect math.js, propose a minimal fix, then verify."));
    if (this.mode === "fail") return Promise.resolve(result("I cannot repair this project."));
    if (n === 2) return Promise.resolve(result("", "TerminalTool.run", { command: "npm test" }, "call-test-before"));
    if (n === 3) return Promise.resolve(result("", "FileTool.read", { path: "src/math.js" }, "call-read"));
    if (n === 4)
      return Promise.resolve(
        result(
          "",
          "FileTool.write",
          { path: "src/math.js", content: "export function add(a, b) {\n  return a + b;\n}\n" },
          "call-write",
        ),
      );
    if (n === 5) return Promise.resolve(result("", "TerminalTool.run", { command: "npm test" }, "call-test-after"));
    return Promise.resolve(result("Fixed the arithmetic operation."));
  }
}
