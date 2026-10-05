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
  version: JSON.parse(await fs.readFile("package.json","utf8")).version,
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
const fixtureAgent=bootstrapAI.profiles.find(p=>p.builtin);
await host.request("ai.saveProfile",{...fixtureAgent,providerId:chatFixture.provider.id,modelId:"polish-fixture",intelligence:{...fixtureAgent.intelligence,auto:false,web:"off"}});
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
  await page.locator("#chat-request").waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "chat-request");
  assert.equal(await page.getByRole("button", {name:"+ New chat",exact:true}).count(), 1);
  await capture("delivery-chat-first");
  await page.keyboard.type("Controlled delivery smoke");
  await page.keyboard.press("Enter");
  await page.locator(".chat-message.assistant").filter({hasText:"Fixture response."}).waitFor();
  await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
  assert.ok(await page.locator(".chat-message.assistant pre code").count());
  const completed=await host.request("chat.status");
  assert.equal(completed.error,undefined);
  
  await page.reload();
  await page.locator(".chat-message.assistant").filter({hasText:"Fixture response."}).waitFor();
  for (const width of [1100,1440,1920]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await capture("delivery-chat-"+width);
  }
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  const navigation=page.getByRole("navigation",{name:"Settings sections"});
  await navigation.getByRole("button",{name:"About",exact:true}).click();
  await page.getByText(desktop.version,{exact:false}).first().waitFor();
  await capture("delivery-about");
  assert.deepEqual(errors,[]);
  await fs.writeFile("validation/delivery-ui-smoke.json",JSON.stringify({
    status:"PASS",version:desktop.version,browser:browser.version(),fixture:true,nativeAcceptance:"NOT VERIFIED",
    checks:["chat-first","composer-autofocus","keyboard-send","fixture-chat-markdown","reload-history","responsive-layout","about-version"],
    captures
  },null,2));
  console.log("PASS: current chat-first frontend integration with fixture provider. Not real AI or native acceptance.");
} catch (error) {
  await page.screenshot({path:"validation/delivery-ui-failure.png"}).catch(()=>{});
  throw error;
} finally {
  await host.request("shutdown").catch(()=>{});
  await browser.close();
  await chatFixture.close();
  await new Promise(resolve=>server.close(resolve));
  if(path.dirname(base)!==os.tmpdir())throw new Error("Unsafe cleanup");
  await fs.rm(base,{recursive:true,force:true});
}
