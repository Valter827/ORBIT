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
const errors = [], evidence = { version: "0.10.1", native: "NOT VERIFIED", model: "real Ollama gemma3:4b", screenshots: [], checks: {} };
page.on("pageerror", error => errors.push(error.message));
const desktop = { settings: { projects: [], workspace: null, model: "", verificationCommand: "npm test", filesEnabled: true, terminalEnabled: false, closeBehavior: "exit", notifications: false, shortcut: "Ctrl+Space", paletteShortcut: "Ctrl+K", settingsShortcut: "Ctrl+,", newTaskShortcut: "Ctrl+N", onboarding: true, trayExplained: true }, projects: [], hasKey: false, version: "0.10.1", warning: "", autostart: false };
await page.exposeFunction("orbitInvoke", async (cmd, args = {}) => {
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "desktop_state") return desktop;
  if (cmd === "core_command") return host.request(args.method, args.params);
  if (cmd === "window_action") return null;
  throw new Error("Unsupported browser bridge command: " + cmd);
});
await page.addInitScript(() => { window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.orbitInvoke(cmd, args), transformCallback: () => 1, unregisterCallback: () => {} }; window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }; });
await fs.mkdir("validation/roles-ui-0101", { recursive: true });
const snap = async name => { const file = "validation/roles-ui-0101/" + name + ".png"; await page.screenshot({ path: file, animations: "disabled", fullPage: true }); evidence.screenshots.push(file); };
try {
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Model Studio",exact:true}).click();
 await page.getByRole("button",{name:"Apply measured 0.10.1 roles",exact:true}).click();
 await page.getByText("Assigned · capability checks apply",{exact:true}).first().waitFor();
 assert.equal(await page.getByText("Assigned · capability checks apply",{exact:true}).count(),6);
 await page.getByRole("heading",{name:"Brain roles",exact:true}).scrollIntoViewIfNeeded();await snap("01-six-assigned-roles");
 const mappings=[['COSMO Core','gemma3:4b'],['COSMO Sight','qwen3.5:9b-q4_K_M'],['COSMO Logic','deepseek-r1:8b'],['COSMO Swift','ministral-3:8b'],['COSMO Recall','embeddinggemma:300m']];
 for(const [alias,model] of mappings){await page.getByRole('button',{name:new RegExp(alias)}).click();const summary=page.locator('summary').filter({hasText:'Advanced Details · underlying model and provenance'});if((await summary.locator('..').getAttribute('open'))===null)await summary.click();await page.locator('details[open]').getByText(model,{exact:true}).waitFor();await summary.scrollIntoViewIfNeeded();await snap('advanced-'+alias.replaceAll(' ','-'));}
 const state=await host.request('ai.state');const p=state.profiles.find(p=>p.id===state.selected);assert.equal(Object.keys(p.intelligence.roles).length,6);for(const role of Object.values(p.intelligence.roles)){assert.ok(role.digest);assert.ok(role.benchmarkId);}assert.equal(state.localOnly,true);
 const saved=JSON.stringify(p.intelligence.roles);await page.reload();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Model Studio',exact:true}).click();await page.getByText('Assigned · capability checks apply',{exact:true}).first().waitFor();assert.equal(JSON.stringify((await host.request('ai.state')).profiles.find(x=>x.id===p.id).intelligence.roles),saved);
 evidence.checks={appliedSixRoles:'PASS',exactProvenance:'PASS',reloadPersistence:'PASS',localOnly:'PASS',consoleErrors:errors.length};assert.deepEqual(errors,[]);
} catch(error){evidence.error=String(error);process.exitCode=1;await snap('failure').catch(()=>{});}
finally{await fs.writeFile('validation/roles-ui-0101.json',JSON.stringify(evidence,null,2));await browser.close();await new Promise(r=>server.close(r));await host.request('shutdown');}
console.log(evidence);


