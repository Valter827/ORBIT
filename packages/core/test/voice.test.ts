import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { VoiceService, voiceDefaults, validateWav, validateVoiceSettings } from "../src/voice/service.js";
import { speechText, shortcutValid } from "../src/voice/speech-text.js";
import type { SpeechCapabilities, SpeechToTextProvider, TextToSpeechProvider } from "../src/voice/types.js";

function wav() {
  const b = Buffer.alloc(364);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
const cap: SpeechCapabilities = {
  id: "test",
  name: "Test double — not real acceptance",
  local: true,
  available: true,
  languages: ["ru", "uk", "en"],
  autoLanguage: true,
  streaming: false,
  partialTranscript: false,
};
function setup(
  t: TestContext,
  options: {
    cap?: Partial<SpeechCapabilities>;
    stt?: SpeechToTextProvider["transcribe"];
    tts?: TextToSpeechProvider["synthesize"];
  } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-voice-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const capabilities = async () => ({ ...cap, ...options.cap });
  const stt: SpeechToTextProvider = { capabilities, transcribe: options.stt ?? (async () => "Привіт, COSMO.") };
  const tts: TextToSpeechProvider = {
    capabilities,
    voices: async () => [{ id: "test-en", name: "Test", language: "en-US" }],
    synthesize: options.tts ?? (async () => wav()),
  };
  const service = new VoiceService(dir, undefined, stt, tts);
  const settings = {
    ...voiceDefaults,
    storage: dir,
    whisperExecutable: path.join(dir, "whisper-cli.exe"),
    whisperModel: path.join(dir, "tiny.bin"),
  };
  return { dir, service, settings, request: { id: randomUUID(), permission: true, audio: wav().toString("base64") } };
}
test("voice permission, language, privacy and settings persistence", async (t) => {
  let captured: Uint8Array | undefined;
  const s = setup(t, {
    stt: async (bytes, language) => {
      captured = bytes;
      assert.equal(language, "uk");
      return "Код АБ-928";
    },
  });
  s.service.save({ ...s.settings, language: "uk", microphone: "device-1" });
  await assert.rejects(s.service.transcribe({ ...s.request, permission: false }, true));
  assert.equal((await s.service.transcribe(s.request, true)).text, "Код АБ-928");
  assert.ok(captured?.every((n) => n === 0));
  assert.deepEqual(fs.readdirSync(s.dir), ["voice-settings.json"]);
  assert.ok(!JSON.stringify(s.service.diagnostics).includes("АБ-928"));
  assert.equal(
    (JSON.parse(fs.readFileSync(path.join(s.dir, "voice-settings.json"), "utf8")) as { microphone: string }).microphone,
    "device-1",
  );
  const restored = new VoiceService(s.dir);
  // save validates and round-trips the already persisted settings without probing Windows.
  assert.equal(
    restored.save(JSON.parse(fs.readFileSync(path.join(s.dir, "voice-settings.json"), "utf8"))).language,
    "uk",
  );
});
test("Local Only rejects remote STT and TTS before invocation", async (t) => {
  let calls = 0;
  const s = setup(t, {
    cap: { local: false },
    stt: async () => {
      calls++;
      return "no";
    },
    tts: async () => {
      calls++;
      return wav();
    },
  });
  await assert.rejects(s.service.transcribe(s.request, true), /Local Only/);
  await assert.rejects(s.service.speak({ id: randomUUID(), text: "Hello" }, true), /Local Only/);
  assert.equal(calls, 0);
});
test("unavailable and unsupported language have explicit failures", async (t) => {
  const s = setup(t, { cap: { available: false, reason: "Missing local runtime" } });
  await assert.rejects(s.service.transcribe(s.request, true), /Missing local runtime/);
  const en = setup(t, { cap: { languages: ["en"], autoLanguage: false } });
  await assert.rejects(en.service.transcribe(en.request, true), /selected language/);
  en.service.save({ ...en.settings, language: "auto" });
  await assert.rejects(en.service.transcribe(en.request, true), /selected language/);
});
test("Stop aborts STT, rejects stale results and clears buffers", async (t) => {
  let entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  let buffer: Uint8Array | undefined;
  const s = setup(t, {
    stt: async (audio, _language, signal) => {
      buffer = audio;
      entered();
      await new Promise<void>((r) => signal.addEventListener("abort", () => r(), { once: true }));
      return "stale";
    },
  });
  const result = s.service.transcribe(s.request, true);
  await ready;
  assert.throws(() => s.service.save(s.settings), /Stop Voice/);
  await assert.rejects(s.service.transcribe({ ...s.request, id: randomUUID() }, true), /active/);
  s.service.cancel();
  await assert.rejects(result, /cancelled/);
  assert.ok(buffer?.every((n) => n === 0));
  assert.equal(s.service.diagnostics.at(-1)?.status, "CANCELLED");
});
test("TTS strips code/URLs/citations and erases provider audio", async (t) => {
  let received = "";
  const audio = wav();
  const s = setup(t, {
    tts: async (text) => {
      received = text;
      return audio;
    },
  });
  const result = await s.service.speak(
    { id: randomUUID(), text: "**RTX 5060** [S3] https://example.org/path\n```js\nsecret()\n```" },
    true,
  );
  assert.match(received, /RTX 5060/);
  assert.match(received, /example.org/);
  assert.ok(!received.includes("secret"));
  assert.ok(!received.includes("S3"));
  assert.ok(audio.every((n) => n === 0));
  assert.equal(Buffer.from(result.audio, "base64").toString("ascii", 0, 4), "RIFF");
  await assert.rejects(s.service.speak({ id: randomUUID(), text: "Привет" }, true), /language/);
});
test("recording format and settings boundaries", () => {
  validateWav(wav());
  const invalid = wav();
  invalid.writeUInt32LE(48000, 24);
  assert.throws(() => validateWav(invalid));
  assert.throws(() => validateWav(Buffer.alloc(2000000)));
  assert.throws(() => validateVoiceSettings({ ...voiceDefaults, storage: "\\\\server\\voice" }));
  assert.equal(shortcutValid("Ctrl+Space"), true);
  assert.equal(shortcutValid("Ctrl+C"), false);
  assert.equal(shortcutValid("Alt+V", ["Alt+V"]), false);
  assert.equal(speechText("**Привіт** `АБ-928` [1]"), "Привіт АБ-928");
});
