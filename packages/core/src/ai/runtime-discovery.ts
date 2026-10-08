import { z } from "zod";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { endpointFetch, validateEndpoint } from "./endpoints.js";
import { AIProviderError, jsonBody, request, type Fetcher } from "./transport.js";

export const OllamaTags = z.object({
  models: z
    .array(
      z.object({
        name: z.string().min(1).max(256),
        digest: z.string().min(1).max(256),
        size: z.number().nonnegative().finite(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .max(500),
});
export type RuntimeState =
  | "NOT_INSTALLED"
  | "INSTALLED_NOT_RUNNING"
  | "UNREACHABLE"
  | "INVALID_SERVICE"
  | "NO_MODELS"
  | "SELECTED_MISSING"
  | "READY";
export interface RuntimeDetection {
  runtime: string;
  endpoint: string;
  state: RuntimeState;
  running: boolean;
  checkedAt: string;
  models: Array<{ id: string; digest?: string; sizeBytes?: number }>;
  version?: string;
  evidence: "HTTP_API" | "CLI" | "NONE";
  detail: string;
}

/** Only a known installed executable is run, without a shell or user-supplied arguments. */
export async function ollamaCLI(
  endpoint: string,
): Promise<{ installed: boolean; version?: string; models?: string[] }> {
  const candidates =
    process.platform === "win32"
      ? [join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Programs", "Ollama", "ollama.exe")]
      : ["/usr/local/bin/ollama", "/usr/bin/ollama"];
  for (const executable of candidates) {
    try {
      await access(executable);
    } catch {
      continue;
    }
    const options = {
      timeout: 2000,
      maxBuffer: 128000,
      windowsHide: true,
      env: { ...process.env, OLLAMA_HOST: validateEndpoint(endpoint, true).origin },
    };
    try {
      const version = (await promisify(execFile)(executable, ["--version"], options)).stdout;
      const match = version.match(/ollama version is (\d+\.\d+\.\d+[^\s]*)/i);
      if (!match) return { installed: true };
      try {
        const list = (await promisify(execFile)(executable, ["list"], options)).stdout;
        const lines = list.trim().split(/\r?\n/);
        const models = /^NAME\s+ID\s+SIZE\s+MODIFIED/.test(lines[0] ?? "")
          ? lines
              .slice(1, 501)
              .map((line) => line.trim().split(/\s+/)[0]!)
              .filter(Boolean)
          : [];
        return { installed: true, version: match[1]!, models };
      } catch {
        return { installed: true, version: match[1]! };
      }
    } catch {
      return { installed: true };
    }
  }
  return { installed: false };
}

/** Fresh, bounded discovery. An open port, HTML page or OpenAI-shaped decoy is not Ollama. */
export async function detectRuntime(
  runtime: "Ollama" | "LM Studio compatible" | "llama.cpp compatible" | "OpenAI compatible",
  endpoint: string,
  options: { selected?: string; fetcher?: Fetcher; cli?: typeof ollamaCLI; timeoutMs?: number } = {},
): Promise<RuntimeDetection> {
  const base = validateEndpoint(endpoint, true);
  const fetcher = options.fetcher ?? endpointFetch(base, true);
  const result: RuntimeDetection = {
    runtime,
    endpoint: base.href,
    state: "UNREACHABLE",
    running: false,
    checkedAt: new Date().toISOString(),
    models: [],
    evidence: "NONE",
    detail: "The local API is unreachable.",
  };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 2500);
  let receivedResponse = false;
  const observed: Fetcher = async (url, init) => {
    const response = await fetcher(url, init);
    receivedResponse = true;
    return response;
  };
  try {
    const data = await jsonBody(
      await request(new URL(runtime === "Ollama" ? "/api/tags" : "models", base).href, { signal }, observed, 1),
    );
    if (runtime === "Ollama") {
      result.models = OllamaTags.parse(data).models.map((m) => ({ id: m.name, digest: m.digest, sizeBytes: m.size }));
    } else {
      const inventory = z.object({ data: z.array(z.object({ id: z.string().min(1).max(256) })).max(500) }).parse(data);
      result.models = inventory.data.map((m) => ({ id: m.id }));
    }
    result.running = true;
    result.evidence = "HTTP_API";
    result.state = !result.models.length
      ? "NO_MODELS"
      : options.selected && !result.models.some((m) => m.id === options.selected)
        ? "SELECTED_MISSING"
        : "READY";
    result.detail =
      result.state === "READY"
        ? "Local model inventory verified; inference capabilities require separate probes."
        : result.state === "NO_MODELS"
          ? "Runtime is running, but no models are installed."
          : "The selected model is missing from the current inventory.";
    return result;
  } catch (error) {
    if (receivedResponse && !(error instanceof AIProviderError && error.kind === "network")) {
      result.state = "INVALID_SERVICE";
      result.detail = "The endpoint did not return a valid runtime model inventory.";
      return result;
    }
  }
  if (runtime === "Ollama") {
    const cli = await (options.cli ?? ollamaCLI)(base.href);
    result.state = cli.installed ? "INSTALLED_NOT_RUNNING" : "NOT_INSTALLED";
    result.evidence = cli.installed ? "CLI" : "NONE";
    if (cli.version) result.version = cli.version;
    // CLI inventory is diagnostic evidence, never proof that HTTP inference is ready.
    result.models = (cli.models ?? []).map((id) => ({ id }));
    result.detail = cli.installed
      ? "Ollama is installed, but its HTTP API is not reachable. Start Ollama and reconnect."
      : "No Ollama API or installation in the standard locations was found. Custom installations may need a configured endpoint.";
  }
  return result;
}

export async function discoverLocalRuntimes(configured: Array<{ endpoint: string; selected?: string }> = []) {
  const defaults = [
    ["Ollama", "http://127.0.0.1:11434/v1/"],
    ["LM Studio compatible", "http://127.0.0.1:1234/v1/"],
    ["llama.cpp compatible", "http://127.0.0.1:8080/v1/"],
  ] as const;
  const results = await Promise.all(
    defaults.map(([runtime, endpoint]) => {
      const selected = configured.find((c) => validateEndpoint(c.endpoint, true).href === endpoint)?.selected;
      return detectRuntime(runtime, endpoint, selected ? { selected } : {});
    }),
  );
  for (const config of configured) {
    const endpoint = validateEndpoint(config.endpoint, true).href;
    if (results.some((r) => r.endpoint === endpoint)) continue;
    const options = config.selected ? { selected: config.selected } : {};
    const ollama = await detectRuntime("Ollama", endpoint, options);
    results.push(ollama.running ? ollama : await detectRuntime("OpenAI compatible", endpoint, options));
  }
  return results;
}
