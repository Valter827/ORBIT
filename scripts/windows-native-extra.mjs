// Additional real installed-build checks. No fixture provider or API requests.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
let browser;
for (let i = 0; i < 40; i++) {
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
assert.ok(browser);
const context = browser.contexts()[0];
let page;
for (let i = 0; i < 40; i++) {
  page = context.pages().find((p) => p.url().includes("tauri.localhost") && !p.url().includes("quick="));
  if (page) break;
  await new Promise((r) => setTimeout(r, 250));
}
assert.ok(page);
await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
const invoke = (method, args = {}) =>
  page.evaluate(({ method, args }) => window.__TAURI_INTERNALS__.invoke(method, args), { method, args });
const before = await invoke("desktop_state");
assert.equal(before.hasKey, false);
assert.equal(before.autostart, false);
const input = {};
for (const key of [
  "model",
  "verificationCommand",
  "filesEnabled",
  "terminalEnabled",
  "closeBehavior",
  "notifications",
  "shortcut",
  "paletteShortcut",
  "settingsShortcut",
  "newTaskShortcut",
  "onboarding",
])
  input[key] = before.settings[key];
Object.assign(input, { autostart: false, apiKey: null, disconnect: false });
try {
  await invoke("save_settings", { input: { ...input, autostart: true } });
  assert.equal((await invoke("desktop_state")).autostart, true);
  await invoke("save_settings", { input });
  assert.equal((await invoke("desktop_state")).autostart, false);
  console.log("PASS: Windows autostart enable/read/disable/read");
  await invoke("window_action", { action: "quick" });
  let quick;
  for (let i = 0; i < 40; i++) {
    quick = context.pages().find((p) => p.url().includes("quick=1"));
    if (quick) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(quick);
  await quick.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  await quick.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("quick_submit", { request: "Native Quick Ask acceptance draft" }),
  );
  await page.getByRole("textbox").filter({ visible: true }).first().waitFor();
  assert.ok(
    await page
      .locator("textarea")
      .evaluateAll((nodes) => nodes.some((n) => n.value === "Native Quick Ask acceptance draft")),
  );
  console.log("PASS: native Quick Ask window and draft handoff");
  const exe = path.resolve("validation/installed-orbit/ORBIT.exe");
  const launched = spawnSync(exe, [], { windowsHide: true, timeout: 10000 });
  assert.equal(launched.status, 0);
  assert.equal((await invoke("desktop_state")).version, "0.3.0");
  console.log("PASS: second instance exits and original IPC remains available");
  const history = await invoke("core_command", { method: "history", params: {} });
  assert.ok(Array.isArray(history));
  const windowState = JSON.parse(
    await fs.readFile(path.join(process.env.APPDATA, "app.orbit.personal-agent/.window-state.json"), "utf8"),
  );
  assert.equal(windowState.main.width, await page.evaluate(() => window.innerWidth));
  assert.equal(windowState.main.height, await page.evaluate(() => window.innerHeight));
  console.log("PASS: saved main window size restored; SQLite history endpoint available after restart");
  await page.screenshot({ path: "validation/windows-native-running.png" });
  await fs.writeFile(
    "validation/windows-native-acceptance.json",
    JSON.stringify(
      {
        version: before.version,
        url: page.url(),
        autostartRoundTrip: true,
        quickAsk: true,
        singleInstance: true,
        windowSizeRestored: true,
        historyEndpoint: true,
      },
      null,
      2,
    ),
  );
} finally {
  await invoke("save_settings", { input }).catch(() => {});
  await browser.close().catch(() => {});
}
