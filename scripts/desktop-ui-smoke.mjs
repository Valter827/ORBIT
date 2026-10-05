// This is a browser UI integration test, not a native Windows acceptance test.
// Tauri commands are substituted only in this test harness. Agent tools, files,
// terminal verification, SQLite and Undo execute for real in a disposable project.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createDesktopHost } from "../dist/packages/core/src/desktop/host.js";
import { FixtureProvider } from "../dist/packages/core/test/fixtures/desktop-provider.js";
import { createChatFixture, createVisualCapture, checkCreatorAndChat } from "./visual-polish-checks.mjs";
const chatFixture = await createChatFixture();
const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-ui-desktop-"));
const workspace = path.join(base, "project"),
  state = path.join(base, "state");
await fs.cp(path.resolve("demos/failing-add"), workspace, { recursive: true });
const original = await fs.readFile(path.join(workspace, "src/math.js"), "utf8");
let host = createDesktopHost(() => {}, new FixtureProvider());
let desktop = {
  settings: {
    projects: [],
    workspace: null,
    model: "claude-sonnet-4-6",
    verificationCommand: "npm test",
    filesEnabled: true,
    terminalEnabled: true,
    closeBehavior: "exit",
    notifications: true,
    shortcut: "Ctrl+Space",
    paletteShortcut: "Ctrl+K",
    settingsShortcut: "Ctrl+,",
    newTaskShortcut: "Ctrl+N",
    onboarding: false,
    trayExplained: false,
  },
  projects: [],
  hasKey: false,
  version: "0.6.1",
  warning: "",
  autostart: false,
};
const configure = () =>
  host.request("configure", {
    workspace: desktop.settings.workspace,
    stateDirectory: state,
    model: desktop.settings.model,
    providers: [
      {
        id: "anthropic",
        name: "Anthropic",
        type: "anthropic",
        endpoint: "",
        remoteAcknowledged: false,
        localInferenceConfirmed: false,
      },
      chatFixture.provider,
    ],
    verificationCommand: desktop.settings.verificationCommand,
    filesEnabled: desktop.settings.filesEnabled,
    terminalEnabled: desktop.settings.terminalEnabled,
  });
await configure();
const bootstrapAI=await host.request("ai.state");
const fixtureAgent=bootstrapAI.profiles.find(p=>p.name==="ORBIT");
await host.request("ai.saveProfile",{...fixtureAgent,providerId:chatFixture.provider.id,modelId:"polish-fixture"});
await host.request("ai.models",{providerId:chatFixture.provider.id,refresh:true});
const server = createServer((req, res) => {
  void (async () => {
    const relative = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve("frontend-dist", "." + (relative === "/" ? "/index.html" : relative));
    const root = path.resolve("frontend-dist");
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await fs.readFile(file);
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    );
    res.end(bytes);
  })().catch(() => {
    res.writeHead(404);
    res.end();
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browserPath = process.argv[process.argv.indexOf("--browser") + 1];
const browser = await chromium.launch({
  headless: true,
  ...(process.argv.includes("--browser") ? { executablePath: browserPath } : {}),
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const { capture, captures } = createVisualCapture(page, process.argv.includes("--visual"));
const errors = [];
let setupFixture=false;
page.on("pageerror", (error) => errors.push(error.message));
await page.exposeFunction("orbitTestInvoke", async (cmd, args) => {
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "desktop_state") return structuredClone(desktop);
  if(cmd==="save_provider"){assert.equal(args.input.provider.endpoint,chatFixture.provider.endpoint);return null;}
  if (cmd === "core_command"){
    if(setupFixture&&args.method==="ai.detect")return [{runtime:"LM Studio compatible",endpoint:chatFixture.provider.endpoint,models:await host.request("ai.models",{providerId:chatFixture.provider.id,refresh:true})}];
    return host.request(args.method, args.params);
  }
  if (cmd === "choose_project") {
    desktop.settings.workspace = workspace;
    desktop.settings.projects = [workspace];
    desktop.projects = [{ path: workspace, available: true }];
    await configure();
    return { path: workspace };
  }
  if (cmd === "save_settings") {
    const { apiKey, disconnect, autostart, ...settings } = args.input;
    if (disconnect) desktop.hasKey = false;
    else if (apiKey) desktop.hasKey = true;
    desktop.settings = { ...desktop.settings, ...settings };
    desktop.autostart = autostart;
    await configure();
    return null;
  }
  if (cmd === "window_action") return null;
  throw new Error("Unsupported harness command: " + cmd);
});
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => window.orbitTestInvoke(cmd, args),
    transformCallback: () => 1,
    unregisterCallback: () => {},
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
});
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.getByRole("button", { name: "Explore ORBIT", exact: true }).waitFor();
  await capture("onboarding");
  await page.getByRole("button", { name: "Explore ORBIT", exact: true }).click();
  await page.getByRole("heading",{name:"COSMO 1.0",exact:true}).first().waitFor();
  await page.getByRole("button",{name:"Set up COSMO / Brain settings",exact:true}).click();
  await page.getByRole("heading",{name:"Set up COSMO locally",exact:true}).waitFor();
  await page.getByRole("button",{name:"Reconnect / Check again",exact:true}).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll(".local-setup button")).some(b=>b.textContent==="Reconnect / Check again"&&!b.disabled));
  await page.screenshot({path:"validation/cosmo-local-setup-v061.png"});
  setupFixture=true;
  await page.getByRole("button",{name:"Reconnect / Check again",exact:true}).click();
  await page.getByLabel("Installed models",{exact:true}).selectOption("polish-fixture");
  await page.getByLabel("Confirm local inference",{exact:true}).check();
  await page.getByRole("button",{name:"Test model",exact:true}).click();
  await page.getByText("Ready · Local · polish-fixture",{exact:true}).waitFor();
  await page.screenshot({path:"validation/cosmo-setup-fixture-v061.png"});
  await page.getByRole("button",{name:"Chat with COSMO",exact:true}).click();
  setupFixture=false;
  const initialAI=await host.request("ai.state");
  await page.getByLabel("Current AI",{exact:true}).selectOption(initialAI.profiles.find(p=>p.name==="ORBIT").id);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Add Project", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("heading", { name: "What shall we work on?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Agent Mode", exact: true }).click();
  await page.getByRole("textbox", { name: "Ask ORBIT", exact: true }).fill("Find and fix the failing test.");
  await page.getByRole("button", { name: "Run agent", exact: true }).click();
  const deadline = Date.now() + 90000;
  let approvedPlan = false,
    appliedDiff = false,
    permissions = 0;
  while (Date.now() < deadline) {
    const plan = page.getByRole("button", { name: "Approve plan", exact: true });
    const diff = page.getByRole("button", { name: "Apply changes", exact: true });
    const allow = page.getByRole("button", { name: "Allow once", exact: true });
    if (await plan.count()) {
      if (!approvedPlan) await capture("plan");
      await plan.click();
      approvedPlan = true;
    } else if (await diff.count()) {
      if (!appliedDiff) await capture("diff");
      await diff.click();
      appliedDiff = true;
    } else if (await allow.count()) {
      if (!permissions) await capture("permission");
      await allow.click();
      permissions++;
    }
    const status = await host.request("status");
    if (status.current && !status.busy) {
      assert.equal(status.current.result.reason, "completed");
      break;
    }
    await page.waitForTimeout(200);
  }
  assert.ok(approvedPlan && appliedDiff && permissions > 0, "UI must approve plan, diff and real tools");
  assert.notEqual(await fs.readFile(path.join(workspace, "src/math.js"), "utf8"), original);
  await page.getByText("COMPLETED", { exact: true }).and(page.locator(":visible")).waitFor({ timeout: 10000 });
  await fs.mkdir("validation", { recursive: true });
  await page.screenshot({ path: "validation/desktop-agent-ui.png" });
  await capture("agent-timeline");
  // A new host reads the same local database and Undo manifest.
  await host.request("shutdown");
  host = createDesktopHost(() => {}, new FixtureProvider());
  await configure();
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Undo Task", exact: true }).click();
  await page.getByText("UNDONE", { exact: true }).and(page.locator(":visible")).waitFor({ timeout: 10000 });
  assert.equal(await fs.readFile(path.join(workspace, "src/math.js"), "utf8"), original);
  await page.keyboard.press("Control+,");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByLabel("Quick Ask shortcut", { exact: true }).fill("Ctrl+Shift+Space");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Settings saved" }).waitFor();
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page.keyboard.press("Control+,");
  assert.equal(await page.getByLabel("Quick Ask shortcut", { exact: true }).inputValue(), "Ctrl+Shift+Space");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Home", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });
  await page.getByText("Offline", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "▸ src", exact: true }).click();
  await page.getByRole("button", { name: "· math.js", exact: true }).click();
  await page.getByText("return a - b;", { exact: false }).waitFor();
  await page.screenshot({ path: "validation/desktop-files-ui.png" });

  await checkCreatorAndChat({ page, host, capture });
  await fs.writeFile(
    "validation/polish-result.json",
    JSON.stringify(
      {
        fixture: true,
        checks: [
          "agent-approvals-diff-undo",
          "settings-keyboard-restart",
          "wizard-ten-steps",
          "knowledge-count-and-preview",
          "chat-stream-code-copy-new-conversation",
          "memory-filter-edit",
          "reduced-motion",
        ],
        captures,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: React onboarding, real core agent flow with fixture provider, restart/history, Undo, settings, keyboard and offline files.",
  );
  console.log("Native shell, Credential Manager, folder dialog, tray and installer are NOT tested by this harness.");
} catch (error) {
  await page.screenshot({ path: "validation/polish-failure.png" }).catch(() => {});
  throw error;
} finally {
  await host.request("shutdown").catch(() => {});
  await browser.close();
  await chatFixture.close();
  await new Promise((resolve) => server.close(resolve));
  if (path.dirname(base) !== os.tmpdir()) throw new Error("Unsafe cleanup path");
  await fs.rm(base, { recursive: true, force: true });
}
