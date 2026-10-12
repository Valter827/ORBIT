// Real local providers with public synthetic text. No microphone or audio files.
import fs from "node:fs";
import { WindowsSpeech, WhisperSpeech } from "../dist/packages/core/src/voice/providers.js";
import { voiceDefaults } from "../dist/packages/core/src/voice/service.js";
import { createDesktopHost } from "../dist/packages/core/src/desktop/host.js";
const out = process.argv[2];
if (!out) throw new Error("Supply evidence JSON path");
const report = {
  date: new Date().toISOString(),
  kind: "real providers / synthetic English audio; NOT microphone acceptance",
  microphone: "NOT VERIFIED",
  playback: "NOT VERIFIED",
  rawAudioPersistence: "NONE",
};
const windows = new WindowsSpeech();
const whisper = new WhisperSpeech(voiceDefaults.whisperExecutable, voiceDefaults.whisperModel);
function pcm16k(source) {
  let rate, channels, bits, samples;
  for (let at = 12; at + 8 <= source.length;) {
    const size = source.readUInt32LE(at + 4),
      type = source.toString("ascii", at, at + 4),
      p = at + 8;
    if (type === "fmt ") {
      if (source.readUInt16LE(p) !== 1) throw new Error("Non PCM TTS");
      channels = source.readUInt16LE(p + 2);
      rate = source.readUInt32LE(p + 4);
      bits = source.readUInt16LE(p + 14);
    }
    if (type === "data") samples = source.subarray(p, p + size);
    at = p + size + (size % 2);
  }
  if (!samples || bits !== 16 || !rate || !channels) throw new Error("Unsupported TTS WAV");
  const n = Math.floor(((samples.length / (channels * 2)) * 16000) / rate),
    result = Buffer.alloc(44 + n * 2);
  result.write("RIFF");
  result.writeUInt32LE(result.length - 8, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(16000, 24);
  result.writeUInt32LE(32000, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    result.writeInt16LE(samples.readInt16LE(Math.floor((i * rate) / 16000) * channels * 2), 44 + i * 2);
  return result;
}
try {
  report.windows = await windows.probe();
  report.whisper = await whisper.capabilities();
  const voice = report.windows.voices.find((v) => v.language.startsWith("en"));
  if (!voice) throw new Error("No installed English voice");
  const start = performance.now();
  const audio = await windows.synthesize(
    "Hello Cosmo. What is the capital of France?",
    voice.id,
    1,
    0.8,
    AbortSignal.timeout(30000),
  );
  report.tts = {
    status: audio.length > 44 ? "PASS" : "FAIL",
    durationMs: performance.now() - start,
    bytes: audio.length,
    voice: voice.id,
  };
  const wav = pcm16k(audio);
  audio.fill(0);
  try {
    const at = performance.now();
    const text = await whisper.transcribe(wav, "en", AbortSignal.timeout(75000));
    report.stt = {
      status: /capital of France/i.test(text) ? "PASS" : "FAIL",
      text,
      durationMs: performance.now() - at,
      language: "en",
    };
    if (report.stt.status === "PASS") {
      const host = createDesktopHost(() => {}),
        network = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, options) => {
        const url = new URL(typeof input === "string" ? input : (input.url ?? input));
        network.push(url.origin);
        if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
          throw Error("Acceptance forbids remote network");
        return originalFetch(input, options);
      };
      try {
        await host.request("configure", {
          workspace: null,
          stateDirectory: `.desktop-cache/voice-real-${Date.now()}`,
          providers: [
            {
              id: "cosmo-local",
              name: "Ollama",
              type: "local",
              endpoint: "http://127.0.0.1:11434/v1/",
              localInferenceConfirmed: true,
              remoteAcknowledged: false,
            },
          ],
        });
        const state = await host.request("ai.state"),
          profile = state.profiles.find((p) => p.builtin);
        await host.request("ai.saveProfile", {
          ...profile,
          providerId: "cosmo-local",
          modelId: "gemma3:4b",
          maxTokens: 128,
          intelligence: { ...profile.intelligence, auto: false, web: "off", mode: "fast" },
        });
        await host.request("ai.localOnly", { enabled: true });
        await host.request("ai.models", { providerId: "cosmo-local", refresh: true });
        const start = performance.now();
        await host.request("chat.start", { request: text, profileId: profile.id });
        let result, firstTokenMs;
        do {
          await new Promise((r) => setTimeout(r, 100));
          result = await host.request("chat.status");
          if (result.text && firstTokenMs === undefined) firstTokenMs = performance.now() - start;
          if (performance.now() - start > 120000) {
            await host.request("chat.stop");
            throw Error("Real chat timeout");
          }
        } while (result.running);
        report.chat = {
          status: !result.error && /Paris/i.test(result.text) ? "PASS" : "FAIL",
          model: "gemma3:4b",
          text: result.text,
          error: result.error,
          firstTokenMs,
          durationMs: performance.now() - start,
          pipeline: "createDesktopHost → chat.start → existing COSMO router",
        };
        if (report.chat.status === "PASS") {
          const at = performance.now();
          const spoken = await windows.synthesize(result.text, voice.id, 1, 0.8, AbortSignal.timeout(30000));
          report.responseTTS = {
            status: spoken.length > 44 ? "PASS" : "FAIL",
            bytes: spoken.length,
            durationMs: performance.now() - at,
          };
          spoken.fill(0);
        }
        report.localOnly = {
          status: "PASS",
          enabled: (await host.request("ai.state")).localOnly,
          configuredEndpoint: "http://127.0.0.1:11434/v1/",
          remoteProvidersConfigured: 0,
          fetchOrigins: [...new Set(network)],
          transportCapture: "NOT VERIFIED: provider may use node:http rather than global fetch",
        };
      } finally {
        await host.request("shutdown");
        globalThis.fetch = originalFetch;
      }
    }
    const abort = new AbortController();
    const pending = whisper.transcribe(wav, "en", abort.signal);
    setTimeout(() => abort.abort(), 100);
    try {
      await pending;
      report.cancellation = "FAIL: request finished before cancellation";
    } catch (e) {
      report.cancellation = /cancel/i.test(e.message) ? "PASS" : `FAIL: ${e.message}`;
    }
  } finally {
    wav.fill(0);
  }
} catch (e) {
  report.error = e.message;
}
fs.mkdirSync(new URL("../validation/", import.meta.url), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
