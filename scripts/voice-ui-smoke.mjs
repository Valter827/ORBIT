// Deterministic browser fixtures. Never claimed as native microphone acceptance.
import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import fs from "node:fs";
import assert from "node:assert/strict";
import { voiceDefaults } from "../dist/packages/core/src/voice/service.js";
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {VoiceControls} from './frontend/src/voice';function App(){const [r,setR]=React.useState();return <><textarea aria-label="Typed draft" defaultValue="Keep my draft"/><VoiceControls visible busy={false} response={r} send={async text=>{window.sent.push(text);setR({id:crypto.randomUUID(),text:'A synthetic response.',running:false});return true}} stopModel={()=>window.stops++} setup={()=>{}} /></>}createRoot(document.getElementById('root')).render(<App/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  jsx: "automatic",
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  outdir: "memory",
  loader: { ".css": "empty" },
});
const script = bundle.outputFiles.find((f) => f.path.endsWith(".js")).text;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end('<div id="root"></div><script>' + script + "</script>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.ORBIT_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error(e.message));
const calls = [];
let pending;
let cancelled = 0;
const capabilities = {
  id: "whisper",
  name: "fixture",
  local: true,
  available: true,
  languages: ["ru", "uk", "en"],
  autoLanguage: true,
  streaming: false,
  partialTranscript: false,
};
await page.exposeFunction("invokeFixture", async (_cmd, args) => {
  calls.push(args?.method);
  if (args.method === "voice.status")
    return {
      settings: { ...voiceDefaults, language: "en" },
      stt: [capabilities],
      tts: [],
      voices: [],
      localOnly: true,
      active: null,
      rawAudioPersistence: "NONE",
    };
  if (args.method === "voice.cancel") {
    cancelled++;
    if (pending) {
      pending.reject(Error("cancelled"));
      pending = undefined;
    }
    return { ok: true };
  }
  if (args.method === "voice.transcribe") {
    assert.equal(args.params.permission, true);
    assert.equal(Buffer.from(args.params.audio, "base64").toString("ascii", 0, 4), "RIFF");
    return { text: "Fixture transcript" };
  }
  if (args.method === "voice.speak")
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
  throw Error("Unexpected fixture call");
});
await page.addInitScript(() => {
  window.sent = [];
  window.stops = 0;
  window.micCalls = 0;
  window.tracksStopped = 0;
  window.audioPauses = 0;
  window.Audio = class {
    constructor() {
      window.fixturePlayer = this;
    }
    play() {
      this.onplaying?.();
      return Promise.resolve();
    }
    pause() {
      window.audioPauses++;
    }
  };
  window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.invokeFixture(cmd, args) };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        window.micCalls++;
        if (window.denyMic) throw new DOMException("Denied", "NotAllowedError");
        return { getTracks: () => [{ stop: () => window.tracksStopped++ }] };
      },
    },
  });
  window.AudioContext = class {
    sampleRate = 48000;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {} };
    }
    createScriptProcessor() {
      const n = { connect() {}, disconnect() {}, onaudioprocess: null };
      setTimeout(
        () => n.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } }),
        10,
      );
      return n;
    }
  };
});
const evidence = { kind: "mocked browser integration; not real microphone/audio", checks: [] };
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  const mic = page.getByRole("button", { name: "Start microphone recording" });
  await mic.waitFor();
  await mic.click();
  assert.equal(await page.evaluate(() => window.micCalls), 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.evaluate(() => window.micCalls), 0);
  evidence.checks.push("explicit consent and cancel before getUserMedia PASS");
  await mic.click();
  await page.evaluate(() => {
    window.denyMic = true;
  });
  await page.getByRole("button", { name: "Allow microphone and start" }).click();
  await page.getByRole("alert").filter({ hasText: "permission denied" }).waitFor();
  evidence.checks.push("permission denied state PASS");
  await page.evaluate(() => {
    window.denyMic = false;
  });
  await mic.click();
  await page.getByRole("button", { name: "Allow microphone and start" }).click();
  await page.getByText("Listening · microphone active").waitFor();
  await page.getByRole("button", { name: "Stop recording and transcribe" }).click();
  await page.getByRole("textbox", { name: "Recognized text" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Typed draft" }).inputValue(), "Keep my draft");
  assert.deepEqual(await page.evaluate(() => window.sent), []);
  evidence.checks.push("visible recording, review-first, draft preserved PASS");
  await page.getByRole("button", { name: "Send transcript" }).click();
  await page.getByText("Speaking · microphone off").waitFor();
  assert.deepEqual(await page.evaluate(() => window.sent), ["Fixture transcript"]);
  await page.getByRole("button", { name: "Stop Voice", exact: true }).click();
  assert.ok(cancelled > 0);
  evidence.checks.push("same send callback and TTS cancellation PASS");
  await page.getByRole("textbox", { name: "Typed draft" }).focus();
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.down("Space");
  await page.getByText("Listening · microphone active").waitFor();
  await page.keyboard.up("Space");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  await page.getByRole("textbox", { name: "Recognized text" }).waitFor();
  assert.ok((await page.evaluate(() => window.tracksStopped)) >= 2);
  evidence.checks.push("push-to-talk while text focused, release stops tracks PASS");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Voice Mode off" }).click();
  await page.getByText("Listening · microphone active").waitFor();
  await page.getByRole("button", { name: "Stop Voice", exact: true }).click();
  evidence.checks.push("Voice Mode visible start and stop PASS");
  await page.getByRole("button", { name: "Read response aloud" }).click();
  await page.waitForFunction(() => document.querySelector(".voice-speaking"));
  while (!pending) await new Promise((r) => setTimeout(r, 10));
  pending.resolve({ audio: Buffer.alloc(44).toString("base64"), mime: "audio/wav" });
  pending = undefined;
  await page.waitForFunction(() => window.fixturePlayer);
  await page.getByRole("button", { name: "Stop Voice", exact: true }).click();
  assert.equal(await page.evaluate(() => window.audioPauses), 1);
  assert.equal(await page.evaluate(() => window.fixturePlayer.src), "");
  evidence.checks.push("Stop pauses active playback and clears source immediately PASS (audio double)");
  assert.ok(!calls.includes("chat.start")); // component delegates through the supplied existing chat callback
  evidence.status = "PASS";
} catch (e) {
  evidence.status = "FAIL";
  evidence.error = e.stack;
  process.exitCode = 1;
} finally {
  fs.mkdirSync("validation", { recursive: true });
  fs.writeFileSync("validation/voice-ui.json", JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
}
