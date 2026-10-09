import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Fetcher } from "../ai/transport.js";
import { endpointFetch } from "../ai/endpoints.js";
import { redact } from "../security/redactor.js";
import { candidateCatalog } from "../ai/candidate-catalog.js";
export const localCatalog = [
  ...candidateCatalog
    .filter((c) => c.selection === "Approval pending" || c.selection === "Deferred")
    .map((c) => ({
      id: c.model,
      label: c.model.includes("coder")
        ? "COSMO Forge candidate"
        : c.model.startsWith("deepseek-r1")
          ? "COSMO Logic candidate"
          : "COSMO Core candidate",
      publisher: c.family,
      source: c.source,
      license: c.license,
      licenseUrl: c.source,
      downloadBytes: c.downloadBytes,
      minRamBytes: 16 * 2 ** 30,
      reason:
        c.reason +
        ". Catalog checked " +
        c.retrievedAt +
        "; fit and quality require local measurement. Underlying model: " +
        c.model,
      vision: c.model.startsWith("qwen3.5") || c.model.startsWith("ministral-3"),
    })),
  {
    id: "gemma3:1b",
    label: "Light",
    publisher: "Google",
    source: "https://ollama.com/library/gemma3:1b",
    license: "Gemma terms",
    licenseUrl: "https://ai.google.dev/gemma/terms",
    downloadBytes: 815000000,
    minRamBytes: 8 * 2 ** 30,
    reason: "Smaller download for everyday text chat. Memory/performance depend on context and runtime.",
    vision: false,
  },
  {
    id: "gemma3:4b",
    label: "Balanced",
    publisher: "Google",
    source: "https://ollama.com/library/gemma3:4b",
    license: "Gemma terms",
    licenseUrl: "https://ai.google.dev/gemma/terms",
    downloadBytes: 3300000000,
    minRamBytes: 16 * 2 ** 30,
    reason: "Larger model with image support. 16 GB RAM is a conservative setup guideline, not a benchmark.",
    vision: true,
  },
] as const;
export function assertDiskSpace(available: number | null, required: number) {
  if (available === null)
    throw new Error("Cannot verify free disk space. Check the model storage drive before downloading.");
  if (available < required)
    throw new Error("Not enough disk space. Required: " + required + " bytes; available: " + available + " bytes.");
}
export async function localHardware() {
  const modelDirectory = process.env["OLLAMA_MODELS"] || path.join(os.homedir(), ".ollama", "models");
  let ancestor = path.resolve(modelDirectory);
  while (!(await fs.stat(ancestor).catch(() => null)) && path.dirname(ancestor) !== ancestor)
    ancestor = path.dirname(ancestor);
  const disk = await fs.statfs(ancestor).catch(() => null);
  let gpu: string | null = null;
  let vramBytes: number | null = null;
  let freeVramBytes: number | null = null;
  if (process.platform === "win32") {
    try {
      const result = await promisify(execFile)(
        path.join(process.env["SystemRoot"] ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"),
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
        ],
        { timeout: 8000, windowsHide: true, maxBuffer: 8192 },
      );
      const names: unknown = JSON.parse(result.stdout);
      gpu = Array.isArray(names)
        ? names.filter((n) => typeof n === "string").join(", ")
        : typeof names === "string"
          ? names
          : null;
    } catch {
      /* Hardware discovery is best effort. */
    }
    try {
      // Optional driver utility, never installed or downloaded by ORBIT.
      const result = await promisify(execFile)(
        path.join(process.env["SystemRoot"] ?? "C:/Windows", "System32", "nvidia-smi.exe"),
        ["--query-gpu=memory.total,memory.free", "--format=csv,noheader,nounits"],
        { timeout: 3000, windowsHide: true, maxBuffer: 8192 },
      );
      const first = result.stdout.trim().split(/\r?\n/)[0]?.split(",").map(Number);
      if (first?.length === 2 && first.every((n) => Number.isFinite(n) && n >= 0)) {
        vramBytes = first[0]! * 2 ** 20;
        freeVramBytes = first[1]! * 2 ** 20;
      }
    } catch {
      /* VRAM remains unknown when the driver does not expose it. */
    }
  }
  return {
    architecture: os.arch(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model ?? null,
    cores: os.cpus().length,
    ramBytes: os.totalmem(),
    freeRamBytes: os.freemem(),
    gpu,
    vramBytes,
    freeVramBytes,
    modelDirectory,
    diskAvailableBytes: disk ? Number(disk.bavail) * Number(disk.bsize) : null,
    catalog: localCatalog,
  };
}
type DownloadState = {
  status: "idle" | "downloading" | "cancelled" | "complete" | "error";
  model?: string;
  phase?: string;
  completed?: number | undefined;
  total?: number | undefined;
  error?: string | undefined;
};
export class LocalDownload {
  constructor(
    private readonly hardware: () => Promise<{ diskAvailableBytes: number | null }> = localHardware,
    private readonly fetcher: Fetcher = endpointFetch(new URL("http://127.0.0.1:11434/"), true),
  ) {}
  private controller: AbortController | undefined;
  private current: DownloadState = { status: "idle" };
  state() {
    return { ...this.current };
  }
  cancel() {
    this.controller?.abort();
    if (this.current.status === "downloading") this.current = { ...this.current, status: "cancelled" };
    return this.state();
  }
  async start(value: unknown) {
    const input = z
      .object({ model: z.string(), confirmed: z.literal(true), storageConfirmed: z.literal(true) })
      .strict()
      .parse(value);
    if (this.controller) throw new Error("A model download is already active.");
    const model = localCatalog.find((m) => m.id === input.model);
    if (!model) throw new Error("Choose a model from the reviewed catalog.");
    const controller = new AbortController();
    this.controller = controller;
    this.current = { status: "downloading", model: model.id, phase: "Checking model-drive space" };
    try {
      const hardware = await this.hardware();
      if (controller.signal.aborted) throw new Error("Download cancelled.");
      assertDiskSpace(hardware.diskAvailableBytes, Math.ceil(model.downloadBytes * 1.25) + 512 * 2 ** 20);
    } catch (error) {
      this.controller = undefined;
      this.current = {
        status: controller.signal.aborted ? "cancelled" : "error",
        model: model.id,
        error: redactedError(error),
      };
      throw error;
    }
    void this.pull(model.id, controller).finally(() => {
      if (this.controller === controller) this.controller = undefined;
    });
    return this.state();
  }
  private async pull(model: string, controller: AbortController) {
    const base = new URL("http://127.0.0.1:11434/");
    try {
      const response = await this.fetcher(new URL("api/pull", base).href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)]),
      });
      if (!response.ok || !response.body) throw new Error("Ollama download unavailable. Start Ollama and reconnect.");
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let success = false;
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const item = z
          .object({
            status: z.string().optional(),
            error: z.string().optional(),
            completed: z.number().nonnegative().optional(),
            total: z.number().positive().optional(),
          })
          .parse(JSON.parse(line));
        if (item.error) throw new Error("Runtime download failed: " + redact(item.error).text.slice(0, 300));
        if (controller.signal.aborted) throw new Error("Download cancelled.");
        success = item.status === "success";
        this.current = {
          status: "downloading",
          model,
          phase: item.status?.slice(0, 200) ?? "Downloading",
          completed: item.completed,
          total: item.total,
        };
      };
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            processLine(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
          }
          if (buffer.length > 65536) throw new Error("Runtime progress response too large.");
        }
        buffer += decoder.decode();
        processLine(buffer);
        if (controller.signal.aborted) throw new Error("Download cancelled.");
        if (!success) throw new Error("Download ended without success. Reconnect and retry.");
        this.current = { status: "complete", model, phase: "Downloaded. Refresh models and test before chatting." };
      } finally {
        await reader.cancel().catch(() => {});
      }
    } catch (error) {
      this.current = {
        status: controller.signal.aborted ? "cancelled" : "error",
        model,
        error: controller.signal.aborted ? undefined : redactedError(error),
      };
    }
  }
}
function redactedError(error: unknown) {
  return redact(error instanceof Error ? error.message : "Download failed.").text.slice(0, 400);
}
