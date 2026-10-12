import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type {
  InstalledVoice,
  SpeechCapabilities,
  SpeechLanguage,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from "./types.js";
import { windowsSpeechScript } from "./windows-script.js";

export async function speechProcess(
  executable: string,
  args: string[],
  input: Uint8Array,
  signal: AbortSignal,
  maxOutput = 12_000_000,
): Promise<Buffer> {
  if (signal.aborted) throw new Error("Voice cancelled");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false });
    const chunks: Buffer[] = [];
    let count = 0,
      failed = false;
    const fail = (message: string) => {
      if (failed) return;
      failed = true;
      child.kill();
      reject(new Error(message));
    };
    const abort = () => fail("Voice cancelled");
    const timer = setTimeout(() => fail("Speech provider timed out"), 75_000);
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () => fail("Speech runtime could not start. Check its path and Windows policy."));
    child.stdout.on("data", (b: Buffer) => {
      count += b.length;
      if (count > maxOutput) fail("Speech output too large");
      else chunks.push(b);
    });
    // Providers may write recognized content to stderr. Discard it; never export.
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (failed) {
        chunks.forEach((b) => b.fill(0));
        return;
      }
      if (code !== 0) {
        chunks.forEach((b) => b.fill(0));
        reject(new Error("Speech provider failed. Check availability, language and Windows policy."));
      } else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(input);
  });
}
const windowsCommand = () =>
  path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
async function windowsCall(value: unknown, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (process.platform !== "win32") throw new Error("Windows speech is unavailable on this platform");
  const bytes = Buffer.from(JSON.stringify(value));
  try {
    const result = await speechProcess(
      windowsCommand(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(windowsSpeechScript, "utf16le").toString("base64"),
      ],
      bytes,
      signal,
    );
    try {
      return JSON.parse(result.toString("utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
    } finally {
      result.fill(0);
    }
  } finally {
    bytes.fill(0);
  }
}
export class WindowsSpeech implements SpeechToTextProvider, TextToSpeechProvider {
  private cached: { voices: InstalledVoice[]; recognizers: { id: string; language: string }[] } | undefined;
  async probe() {
    const result = await windowsCall({ mode: "probe" }, AbortSignal.timeout(12000));
    this.cached = {
      voices: Array.isArray(result["voices"]) ? (result["voices"] as InstalledVoice[]) : [],
      recognizers: Array.isArray(result["recognizers"])
        ? (result["recognizers"] as { id: string; language: string }[])
        : [],
    };
    return this.cached;
  }
  async voices() {
    return (this.cached ?? (await this.probe())).voices;
  }
  async capabilities(): Promise<SpeechCapabilities> {
    return this.sttCapabilities();
  }
  async sttCapabilities(): Promise<SpeechCapabilities> {
    try {
      const p = this.cached ?? (await this.probe());
      return {
        id: "windows",
        name: "Windows installed speech recognition",
        local: true,
        available: !!p.recognizers.length,
        languages: [...new Set(p.recognizers.map((r) => r.language.split("-")[0]!))],
        autoLanguage: false,
        streaming: false,
        partialTranscript: false,
        ...(!p.recognizers.length
          ? { reason: "Install a Windows speech recognizer for the desired language, or configure local whisper.cpp." }
          : {}),
      };
    } catch {
      return {
        id: "windows",
        name: "Windows speech recognition",
        local: true,
        available: false,
        languages: [],
        autoLanguage: false,
        streaming: false,
        partialTranscript: false,
        reason: "Windows speech recognition unavailable or blocked.",
      };
    }
  }
  async ttsCapabilities(): Promise<SpeechCapabilities> {
    try {
      const voices = await this.voices();
      return {
        id: "windows",
        name: "Windows installed voices",
        local: true,
        available: !!voices.length,
        languages: [...new Set(voices.map((v) => v.language))],
        autoLanguage: false,
        streaming: false,
        partialTranscript: false,
      };
    } catch {
      return {
        id: "windows",
        name: "Windows installed voices",
        local: true,
        available: false,
        languages: [],
        autoLanguage: false,
        streaming: false,
        partialTranscript: false,
        reason: "Install an available Windows TTS voice. Cloud fallback is disabled.",
      };
    }
  }
  async transcribe(wav: Uint8Array, language: SpeechLanguage, signal: AbortSignal) {
    if (language === "auto") throw new Error("Windows recognition requires a selected language");
    const r = await windowsCall({ mode: "stt", language, audio: Buffer.from(wav).toString("base64") }, signal);
    return typeof r["text"] === "string" ? r["text"] : "";
  }
  async synthesize(text: string, voice: string, speed: number, volume: number, signal: AbortSignal) {
    const r = await windowsCall(
      {
        mode: "tts",
        text,
        voice,
        rate: Math.max(-8, Math.min(8, Math.round((speed - 1) * 5))),
        volume: Math.round(volume * 100),
      },
      signal,
    );
    if (typeof r["audio"] !== "string") throw new Error("TTS did not return audio");
    return Buffer.from(r["audio"], "base64");
  }
}
export class WhisperSpeech implements SpeechToTextProvider {
  constructor(
    private executable: string,
    private model: string,
  ) {}
  async capabilities(): Promise<SpeechCapabilities> {
    const installed = fs.existsSync(this.executable) && fs.existsSync(this.model);
    let available = false;
    if (installed)
      try {
        await speechProcess(this.executable, ["--help"], new Uint8Array(), AbortSignal.timeout(15000), 150000);
        available = true;
      } catch {
        /* honestly unavailable */
      }
    const english = /\.en(?:\.|-)/i.test(path.basename(this.model));
    return {
      id: "whisper",
      name: "Local whisper.cpp",
      local: true,
      available,
      languages: english ? ["en"] : ["ru", "uk", "en"],
      autoLanguage: !english,
      streaming: false,
      partialTranscript: false,
      ...(!available
        ? {
            reason:
              "Configure an allowed whisper-cli.exe and a multilingual GGML Whisper model in Voice storage. No model is downloaded automatically.",
          }
        : {}),
    };
  }
  async transcribe(wav: Uint8Array, language: SpeechLanguage, signal: AbortSignal) {
    // A non-'-' output prefix enables the stdout segment callback with stdin input.
    // No --output-* flags: no files are written. '-of - -otxt' uses CON on Windows
    // rather than the redirected pipe in upstream v1.9.2 and must not be used.
    const result = await speechProcess(
      this.executable,
      ["-m", this.model, "-f", "-", "-of", "orbit-memory-only", "-l", language, "-nt", "-np", "-ng", "-t", "4"],
      wav,
      signal,
      100000,
    );
    try {
      return result.toString("utf8").trim();
    } finally {
      result.fill(0);
    }
  }
}
