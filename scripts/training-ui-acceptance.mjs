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
const errors = [], evidence = { version: "0.10.2", native: "NOT VERIFIED", model: "real Ollama gemma3:4b", screenshots: [], checks: {} };
page.on("pageerror", error => errors.push(error.message));
const desktop = { settings: { projects: [], workspace: null, model: "", verificationCommand: "npm test", filesEnabled: true, terminalEnabled: false, closeBehavior: "exit", notifications: false, shortcut: "Ctrl+Space", paletteShortcut: "Ctrl+K", settingsShortcut: "Ctrl+,", newTaskShortcut: "Ctrl+N", onboarding: true, trayExplained: true }, projects: [], hasKey: false, version: "0.10.2", warning: "", autostart: false };
await page.exposeFunction("orbitInvoke", async (cmd, args = {}) => {
  if (cmd.startsWith("plugin:event|")) return 1;
  if (cmd === "desktop_state") return desktop;
  if (cmd === "core_command") return host.request(args.method, args.params);
  if (cmd === "window_action") return null;
  throw new Error("Unsupported browser bridge command: " + cmd);
});
await page.addInitScript(() => { window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => window.orbitInvoke(cmd, args), transformCallback: () => 1, unregisterCallback: () => {} }; window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }; });
await fs.mkdir("validation/training-ui-0102", { recursive: true });
const snap = async name => { const file = "validation/training-ui-0102/" + name + ".png"; await page.screenshot({ path: file, animations: "disabled", fullPage: true }); evidence.screenshots.push(file); };
try {
 const rolesBefore=JSON.stringify((await host.request('ai.state')).profiles.map(p=>p.intelligence.roles));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Model Studio',exact:true}).click();
 await page.getByRole('button',{name:'Open Training Lab',exact:true}).click();
 await page.getByRole('heading',{name:'Alpha status'}).waitFor();
 await page.getByRole('heading',{name:'Alpha status'}).scrollIntoViewIfNeeded();await snap('01-overview');
 const nav=page.getByRole('navigation',{name:'Training Lab sections'});
 await nav.getByRole('button',{name:'Dataset',exact:true}).click();
 await page.getByText('28 training · 14 validation · 14 held-out',{exact:true}).waitFor();await snap('02-dataset');
 const dataset=await host.request('ai.trainingState');assert.equal(dataset.dataset.valid,true);assert.ok(dataset.dataset.examples.every(x=>x.split!=='test'));
 await nav.getByRole('button',{name:'Base Model',exact:true}).click();await page.getByText('SELECTED FOR PILOT; fit unverified',{exact:true}).waitFor();await snap('03-base-selection');
 const storageRoot=path.resolve('.desktop-cache','training-ui-storage-'+Date.now());
 const storage={models:path.join(storageRoot,'models'),training:path.join(storageRoot,'runs'),datasets:path.join(storageRoot,'datasets'),adapters:path.join(storageRoot,'adapters'),python:'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'};
 await nav.getByRole('button',{name:'Overview',exact:true}).click();
 for(const [label,key] of [['Model storage (original Safetensors)','models'],['Training workspace','training'],['Dataset cache','datasets'],['Adapter output','adapters'],['Isolated Python interpreter','python']])await page.getByLabel(label,{exact:true}).fill(storage[key]);
 await page.getByRole('button',{name:'Save storage',exact:true}).click();await page.getByRole('button',{name:'Check training environment',exact:true}).click();await page.getByText('Environment not ready',{exact:true}).waitFor();await snap('04-honest-preflight');
 await nav.getByRole('button',{name:'Training',exact:true}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Create training draft',exact:true}).click();await page.getByRole('button',{name:'Start training',exact:true}).waitFor();await page.getByRole('button',{name:'Start training',exact:true}).click();
 await page.getByRole('button',{name:'Create new experiment from config',exact:true}).waitFor();const failed=await host.request('ai.trainingState');assert.equal(failed.jobs[0].state,'Failed');assert.equal(failed.jobs[0].adapter,undefined);assert.match(failed.jobs[0].error,/orbit-base|ENOENT/);await snap('05-real-missing-base-failure');
 assert.equal(JSON.stringify((await host.request('ai.state')).profiles.map(p=>p.intelligence.roles)),rolesBefore);
 await page.reload();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Model Studio',exact:true}).click();await page.getByRole('button',{name:'Open Training Lab',exact:true}).click();const reload=await host.request('ai.trainingState');assert.equal(reload.jobs[0].id,failed.jobs[0].id);assert.equal(reload.jobs[0].state,'Failed');
 await page.setViewportSize({width:920,height:800});await snap('06-compact');assert.deepEqual(errors,[]);
 evidence.checks={realTraining:'NOT PERFORMED',ui:'PASS',datasetGate:'PASS',heldoutAnswersHidden:'PASS',storage:'PASS',preflightMissingDependencies:'PASS',failedJobPersistence:'PASS',noFakeAdapter:'PASS',existingRolesPreserved:'PASS',consoleErrors:errors.length};
} catch(error){evidence.error=String(error);process.exitCode=1;await snap('failure').catch(()=>{});}
finally{await fs.writeFile('validation/training-ui-0102.json',JSON.stringify(evidence,null,2));await browser.close();await new Promise(r=>server.close(r));await host.request('shutdown');}
console.log(evidence);
