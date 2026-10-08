// Production frontend and core + real local Ollama. Only the Tauri IPC bridge is substituted.
// This is browser acceptance, not native Windows acceptance.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { createDesktopHost } from "../dist/packages/core/src/desktop/host.js";
const host = createDesktopHost(() => {});
const base = path.resolve(".desktop-cache", "studio-ui-" + Date.now());
await host.request("configure", { workspace: null, stateDirectory: base, providers: [{ id: "cosmo-local", name: "Ollama", type: "local", endpoint: "http://127.0.0.1:11434/v1/", localInferenceConfirmed: true, remoteAcknowledged: false }] });
let ai = await host.request("ai.state"); const profile = ai.profiles.find(p => p.builtin);
await host.request("ai.saveProfile", { ...profile, providerId: "cosmo-local", modelId: "gemma3:4b", intelligence: { ...profile.intelligence, auto: true, web: "off" } });
await host.request("ai.localOnly", { enabled: true });
await host.request("ai.models", { providerId: "cosmo-local", refresh: true });
const server = createServer((req, res) => { void (async () => {
  const file = path.resolve("frontend-dist", "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  assert.ok(file.startsWith(path.resolve("frontend-dist") + path.sep));
  res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
  res.end(await fs.readFile(file));
})().catch(() => { res.statusCode = 404; res.end(); }); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }); page.setDefaultTimeout(30000);
const errors = [], evidence = { version: "0.10.0", native: "NOT VERIFIED", model: "real Ollama gemma3:4b", screenshots: [], checks: {} };
page.on("pageerror", error => errors.push(error.message));
const desktop = { settings: { projects: [], workspace: null, model: "", verificationCommand: "npm test", filesEnabled: true, terminalEnabled: false, closeBehavior: "exit", notifications: false, shortcut: "Ctrl+Space", paletteShortcut: "Ctrl+K", settingsShortcut: "Ctrl+,", newTaskShortcut: "Ctrl+N", onboarding: true, trayExplained: true }, projects: [], hasKey: false, version: "0.10.0", warning: "", autostart: false };
await page.exposeFunction("orbitInvoke", async (cmd, args = {}) => {
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "desktop_state") return desktop;
  if (cmd === "core_command") return host.request(args.method, args.params);
  if (cmd === "window_action") return null;
  throw new Error("Unsupported browser bridge command: " + cmd);
});
await page.addInitScript(() => { window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.orbitInvoke(cmd, args), transformCallback: () => 1, unregisterCallback: () => {} }; window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }; });
await fs.mkdir("validation/studio-ui-010", { recursive: true });
const snap = async name => { const file = "validation/studio-ui-010/" + name + ".png"; await page.screenshot({ path: file, animations: "disabled" }); evidence.screenshots.push(file); };
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Model Studio", exact: true }).click();
  await page.getByRole("heading", { name: "Your hardware" }).waitFor();
  await page.getByText("AMD Ryzen", { exact: false }).waitFor();
  await snap("01-studio-runtime-dark");
  await page.getByRole("button", { name: /gemma3:4b.*Ollama/ }).click();
  await page.getByRole("heading", { name: "gemma3:4b", exact: true }).scrollIntoViewIfNeeded(); await snap("02-model-details");
  await page.getByRole("button", { name: "Run real benchmark", exact: true }).click();
  await page.getByRole("heading", { name: "Benchmark running" }).waitFor(); await snap("03-benchmark-running");
  await page.getByRole("heading", { name: "Latest run · COMPLETE" }).waitFor({ timeout: 180000 });
  await page.getByRole("heading", { name: "Latest run · COMPLETE" }).scrollIntoViewIfNeeded(); await snap("04-real-results");
  await page.getByRole("button", { name: "Use for manual chat" }).click();
  await page.locator('.brain-identity select').scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector('.brain-identity select')?.value === 'manual'); await snap("05-manual-brain");
  await page.locator('.brain-identity select').selectOption("auto");
  await page.waitForFunction(() => document.querySelector('.brain-identity select')?.value === 'auto'); await snap("06-auto-brain");
  for (const theme of ["dark", "light"]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1100, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Root overflow");
      await snap("07-" + theme + "-" + width);
    }
  }
  assert.deepEqual(errors, []); evidence.checks = { navigation: "PASS", realBenchmark: "PASS", manualAuto: "PASS", darkLightResponsive: "PASS", consoleErrors: 0 };
} catch (error) { evidence.error = String(error); process.exitCode = 1; await snap("failure").catch(() => {}); }
finally { await fs.writeFile("validation/studio-ui-010.json", JSON.stringify(evidence, null, 2)); await browser.close(); await new Promise(r => server.close(r)); await host.request("shutdown"); }
console.log(evidence);
