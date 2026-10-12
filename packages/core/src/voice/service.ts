import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { speechText, shortcutValid } from "./speech-text.js";
import { WindowsSpeech, WhisperSpeech } from "./providers.js";
import type { SpeechToTextProvider, TextToSpeechProvider, VoiceSettings, VoiceStatus } from "./types.js";

export const voiceDefaults: VoiceSettings = {
  microphone: "",
  language: "ru",
  stt: "whisper",
  tts: "windows",
  voice: "",
  speed: 1,
  volume: 0.8,
  behavior: "review",
  // Ctrl+Space is already the desktop show/hide shortcut.
  shortcut: "Ctrl+Shift+Space",
  readAloud: true,
  storage: "D:\\Orbit\\AI\\Voice",
  whisperExecutable: "D:\\Orbit\\AI\\Voice\\STT\\whisper-1.9.2\\Release\\whisper-cli.exe",
  whisperModel: "D:\\Orbit\\AI\\Voice\\STT\\ggml-tiny.bin",
};
const SettingsSchema = z
  .object({
    microphone: z.string().max(500),
    language: z.enum(["auto", "ru", "uk", "en"]),
    stt: z.enum(["whisper", "windows"]),
    tts: z.literal("windows"),
    voice: z.string().max(200),
    speed: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(1),
    behavior: z.enum(["review", "auto"]),
    shortcut: z
      .string()
      .max(40)
      .refine((v) => shortcutValid(v), "Choose a non-conflicting Ctrl/Alt shortcut"),
    readAloud: z.boolean(),
    storage: z.string().min(3).max(2000),
    whisperExecutable: z.string().max(2000),
    whisperModel: z.string().max(2000),
  })
  .strict();
export function validateVoiceSettings(value: unknown): VoiceSettings {
  const s = SettingsSchema.parse(value);
  for (const p of [s.storage, s.whisperExecutable, s.whisperModel])
    if (!path.isAbsolute(p) || /^(\\\\|\/\/)/.test(p) || p.includes("\0"))
      throw new Error("Voice storage and runtime must be local absolute paths");
  for (const p of [s.whisperExecutable, s.whisperModel]) {
    const rel = path.relative(s.storage, p);
    if (rel.startsWith("..") || path.isAbsolute(rel))
      throw new Error("Keep Voice models/runtime inside configured Voice storage");
  }
  if (path.basename(s.whisperExecutable).toLowerCase() !== "whisper-cli.exe" || !s.whisperModel.endsWith(".bin"))
    throw new Error("Select whisper-cli.exe and a GGML .bin model");
  return s;
}
export function validateWav(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    b.length < 44 ||
    b.length > 1_920_044 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE" ||
    b.toString("ascii", 12, 16) !== "fmt " ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 16000 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString("ascii", 36, 40) !== "data" ||
    b.readUInt32LE(40) !== b.length - 44
  )
    throw new Error("Use a PCM WAV recording, mono 16 kHz / 16 bit, at most 60 seconds");
}
export class VoiceService {
  private settings: VoiceSettings;
  private active: { id: string; controller: AbortController } | undefined;
  private readonly file: string;
  readonly diagnostics: { provider: string; operation: string; durationMs: number; status: string }[] = [];
  constructor(
    directory: string,
    private readonly windows = new WindowsSpeech(),
    private readonly injectedSTT?: SpeechToTextProvider,
    private readonly injectedTTS?: TextToSpeechProvider,
  ) {
    this.file = path.join(directory, "voice-settings.json");
    this.settings = { ...voiceDefaults };
    try {
      this.settings = validateVoiceSettings(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch {
      /* keep safe defaults */
    }
  }
  private stt() {
    return (
      this.injectedSTT ??
      (this.settings.stt === "windows"
        ? this.windows
        : new WhisperSpeech(this.settings.whisperExecutable, this.settings.whisperModel))
    );
  }
  async status(localOnly: boolean): Promise<VoiceStatus> {
    const stt = await Promise.all([
      new WhisperSpeech(this.settings.whisperExecutable, this.settings.whisperModel).capabilities(),
      this.windows.sttCapabilities(),
    ]);
    const tts = await this.windows.ttsCapabilities();
    return {
      settings: this.settings,
      stt,
      tts: [tts],
      voices: await this.windows.voices().catch(() => []),
      localOnly,
      active: this.active?.id ?? null,
      rawAudioPersistence: "NONE",
    };
  }
  save(value: unknown) {
    if (this.active) throw new Error("Stop Voice before changing its settings");
    const settings = validateVoiceSettings(value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(settings, null, 2));
    fs.renameSync(this.file + ".tmp", this.file);
    this.settings = settings;
    return settings;
  }
  cancel() {
    this.active?.controller.abort();
    this.active = undefined;
    return { ok: true };
  }
  private async operation<T>(
    id: string,
    provider: string,
    kind: string,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.active) throw new Error("Another Voice operation is active");
    const controller = new AbortController();
    this.active = { id, controller };
    const start = performance.now();
    let status = "FAIL";
    try {
      const result = await run(controller.signal);
      if (controller.signal.aborted) throw new Error("Voice cancelled");
      status = "PASS";
      return result;
    } finally {
      if (this.active?.controller === controller) this.active = undefined;
      this.diagnostics.push({
        provider,
        operation: kind,
        durationMs: performance.now() - start,
        status: controller.signal.aborted ? "CANCELLED" : status,
      });
      this.diagnostics.splice(0, Math.max(0, this.diagnostics.length - 30));
    }
  }
  async transcribe(value: unknown, localOnly: boolean) {
    const input = z
      .object({ id: z.string().uuid(), audio: z.string().min(60).max(2_560_100), permission: z.literal(true) })
      .strict()
      .parse(value);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.audio)) throw new Error("Invalid recording encoding");
    const audio = Buffer.from(input.audio, "base64");
    try {
      validateWav(audio);
      return await this.operation(input.id, this.settings.stt, "stt", async (signal) => {
        const provider = this.stt(),
          cap = await provider.capabilities();
        if (!cap.available) throw new Error(cap.reason ?? "STT unavailable");
        if (!cap.local && localOnly) throw new Error("Local Only blocks cloud speech");
        if (!cap.local) throw new Error("Cloud speech is not enabled in this release");
        if (this.settings.language === "auto" ? !cap.autoLanguage : !cap.languages.includes(this.settings.language))
          throw new Error("STT does not support the selected language");
        const start = performance.now();
        const text = (await provider.transcribe(audio, this.settings.language, signal)).trim().slice(0, 20000);
        if (!text) throw new Error("No speech recognized. Try again.");
        return { text, durationMs: performance.now() - start, provider: cap.id };
      });
    } finally {
      audio.fill(0);
    }
  }
  async speak(value: unknown, localOnly: boolean) {
    const input = z
      .object({ id: z.string().uuid(), text: z.string().min(1).max(100000) })
      .strict()
      .parse(value);
    return this.operation(input.id, this.settings.tts, "tts", async (signal) => {
      const provider = this.injectedTTS ?? this.windows;
      const cap = this.injectedTTS ? await provider.capabilities() : await this.windows.ttsCapabilities();
      if (!cap.available) throw new Error("TTS unavailable: install an available Windows voice");
      if (!cap.local && localOnly) throw new Error("Local Only blocks cloud speech");
      if (!cap.local) throw new Error("Cloud speech is not enabled in this release");
      const voices = await provider.voices();
      const language = /[іїєґ]/i.test(input.text) ? "uk" : /[а-я]/i.test(input.text) ? "ru" : "en";
      const voice = voices.find((v) =>
        this.settings.voice ? v.id === this.settings.voice : v.language.startsWith(language),
      );
      if (!voice) throw new Error("TTS unavailable for this language. Select an installed voice in Settings → Voice.");
      const text = speechText(input.text);
      if (!text) throw new Error("No speakable text");
      const audio = await provider.synthesize(text, voice.id, this.settings.speed, this.settings.volume, signal);
      try {
        return { audio: Buffer.from(audio).toString("base64"), mime: "audio/wav", voice: voice.id };
      } finally {
        audio.fill(0);
      }
    });
  }
}
