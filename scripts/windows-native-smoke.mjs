// Invoked on a fresh installed release in CI or an explicitly authorized temporary install.
// Refuses an existing key to avoid overwriting user credentials.
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
let browser;
for (let i = 0; i < 40; i++) {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
assert.ok(browser, "Installed ORBIT did not expose its WebView2 test endpoint");
const context = browser.contexts()[0];
let page;
for (let i = 0; i < 30; i++) {
  page = context.pages().find((p) => p.url().includes("tauri.localhost"));
  if (page) break;
  await new Promise((r) => setTimeout(r, 200));
}
assert.ok(page, "Production assets were not loaded from Tauri");
await page
  .getByRole("button", { name: "Explore ORBIT", exact: true })
  .or(page.getByRole("heading", { name: /What shall we work on\?|COSMO 1\.0/ }))
  .first().waitFor();
await fs.mkdir("validation", { recursive: true });
await page.screenshot({ path: "validation/windows-native-first-run.png" });
const state = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("desktop_state"));
const pkg=JSON.parse(await fs.readFile("package.json","utf8"));
assert.equal(state.version, pkg.version);
assert.equal(state.autostart, false);
assert.equal(state.hasKey, false, "Do not overwrite an existing credential");
await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("save_settings", {
    input: {
      model: "claude-sonnet-4-6",
      verificationCommand: "npm test",
      filesEnabled: true,
      terminalEnabled: true,
      closeBehavior: "exit",
      notifications: false,
      shortcut: "",
      paletteShortcut: "Ctrl+K",
      settingsShortcut: "Ctrl+,",
      newTaskShortcut: "Ctrl+N",
      onboarding: true,
      autostart: false,
      apiKey: "sk-ant-ci-test-not-a-real-api-key",
      disconnect: false,
    },
  }),
);
const stored = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("desktop_state"));
assert.equal(stored.hasKey, true);
assert.ok(!JSON.stringify(stored).includes("sk-ant-ci"));
await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("window_action", { action: "stop-exit" })).catch(() => {});
await browser.close().catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
const launched = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "Start-Process -FilePath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ORBIT.lnk') -WindowStyle Hidden",
  ],
  { windowsHide: true, env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9223" } },
);
assert.equal(launched.status, 0);
let restarted;
for (let i = 0; i < 40; i++) {
  try {
    restarted = await chromium.connectOverCDP("http://127.0.0.1:9223");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
assert.ok(restarted);
let second;
for (let i = 0; i < 40; i++) {
  second = restarted
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("tauri.localhost"));
  if (second) break;
  await new Promise((r) => setTimeout(r, 250));
}
assert.ok(second);
await second.waitForFunction(() => !!window.__TAURI_INTERNALS__);
await second.getByRole("heading", { name: /What shall we work on\?|COSMO 1\.0/ }).first().waitFor();
const restored = await second.evaluate(() => window.__TAURI_INTERNALS__.invoke("desktop_state"));
assert.equal(restored.hasKey, true);
assert.equal(restored.settings.notifications, false);
await second.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("save_settings", {
    input: {
      model: "claude-sonnet-4-6",
      verificationCommand: "npm test",
      filesEnabled: true,
      terminalEnabled: true,
      closeBehavior: "exit",
      notifications: false,
      shortcut: "",
      paletteShortcut: "Ctrl+K",
      settingsShortcut: "Ctrl+,",
      newTaskShortcut: "Ctrl+N",
      onboarding: true,
      autostart: false,
      apiKey: null,
      disconnect: true,
    },
  }),
);
assert.equal((await second.evaluate(() => window.__TAURI_INTERNALS__.invoke("desktop_state"))).hasKey, false);
await second
  .evaluate(() => window.__TAURI_INTERNALS__.invoke("window_action", { action: "stop-exit" }))
  .catch(() => {});
await restarted.close().catch(() => {});
console.log(
  "PASS: native installed window, secure key save/restart/disconnect, persisted settings; no provider network calls.",
);
