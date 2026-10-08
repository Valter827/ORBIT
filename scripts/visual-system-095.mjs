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
let visualSources=[];
let visualAnswer="";
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
const browserPath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.context().grantPermissions(["clipboard-read","clipboard-write"]);
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
    const r=await host.request(args.method,args.params);if(args.method==='chat.status'&&r&&!r.running&&!r.error&&visualAnswer)return {...r,text:visualAnswer,intelligence:{...r.intelligence,sources:visualSources}};if(args.method==='chat.messages'&&visualAnswer)return r.map(m=>m.role==='assistant'?{...m,content:visualAnswer,intelligence:{...m.intelligence,sources:visualSources}}:m);return r;
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
const results={version:'0.9.5',scope:'Controlled visual/UI acceptance on production frontend and core; fixture model and explicitly injected sample responses/cards. NOT real AI or native acceptance.',date:new Date().toISOString(),screenshots:[],checks:{}};
await fs.mkdir('validation/visual-095',{recursive:true});
const snap=async(name)=>{await page.screenshot({path:'validation/visual-095/'+name+'.png',animations:'disabled'});results.screenshots.push({file:name+'.png',resolution:page.viewportSize(),description:name});};
const nav=async(name)=>{await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();};
const fit=async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Root overflow');const composer=await page.locator('.chat-composer').boundingBox();if(await page.locator('.chat-composer').isVisible())assert.ok(composer.y+composer.height<=page.viewportSize().height+1,'Composer cut off');};
const fence=String.fromCharCode(96).repeat(3);
visualAnswer='# Как работает RAG\n\nRAG соединяет **поиск по вашим материалам** и генерацию ответа. Сначала система находит подходящие фрагменты, затем объясняет их понятным языком.\n\n## Три шага\n\n1. Найти релевантный источник.\n2. Передать модели ограниченный контекст.\n   - Сохранить происхождение данных.\n   - Указать источник ответа.\n3. Проверить утверждения.\n\n> Источник помогает проверить ответ, но не даёт модели новых разрешений.\n\n## TypeScript\n\n'+fence+'typescript\nexport function rank<T extends { score: number }>(items: T[]): T[] {\n  return [...items].sort((a, b) => b.score - a.score);\n}\n'+fence+'\n\n## Формулы\n\nЭнергия: $E = mc^2$. Сила: $F = ma$.\n\n$$\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$\n\n## Сравнение\n\n| Этап | Результат | Проверка |\n|---|---|---|\n| Поиск | Фрагменты | Релевантность |\n| Ответ | Объяснение | Источники |\n\nEnglish: What’s new?\n\nРусский: Что нового в ORBIT?\n\nУкраїнська: Що нового в ORBIT?\n\n«текст» — test → 10 ± 2 °C · ≤ ≥ × ÷ ← ↑ ↓ …\n\n[Документация Tauri](https://v2.tauri.app/plugin/updater/)';
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#chat-request').waitFor();await page.waitForFunction(()=>document.activeElement?.id==='chat-request');
 for(const [width,height]of [[1100,700],[1280,720],[1366,768],[1440,900],[1920,1080]]){await page.setViewportSize({width,height});await fit();await snap('01-chat-empty-'+width);}
 results.checks.responsive='PASS';await page.setViewportSize({width:1440,height:900});
 await page.locator('#chat-request').fill('Объясни простыми словами, как работает RAG.');await page.locator('#chat-request').press('Enter');await page.locator('.chat-message.assistant .katex').first().waitFor();await page.getByRole('button',{name:'Stop generating',exact:true}).waitFor({state:'hidden'});
 await page.locator('.chat-transcript').evaluate(el=>el.scrollTop=0);await snap('02-chat-answer');await page.locator('.message-code').scrollIntoViewIfNeeded();await snap('03-code');await page.getByRole('button',{name:'Copy code',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/export function rank/);await page.waitForTimeout(1900);assert.equal(await page.getByRole('button',{name:'Copy code',exact:true}).textContent(),'Copy code');results.checks.copy='PASS';
 await page.locator('.katex-display').scrollIntoViewIfNeeded();await snap('04-math');assert.equal(await page.locator('.katex-error').count(),0);assert.ok(await page.locator('math').count()>=3);results.checks.math='PASS';await page.locator('.markdown-table').scrollIntoViewIfNeeded();await snap('05-table-unicode');assert.match(await page.locator('.message-body').last().textContent(),/Що нового в ORBIT/);results.checks.unicode='PASS';
 visualSources=[{name:'Tauri updater',text:'Controlled visual source: supported platforms and update signatures.',url:'https://v2.tauri.app/plugin/updater/',retrievedAt:new Date().toISOString()},{name:'Rust',text:'Controlled price display sample: USD 39.99 · Store region: US. Visual fixture, not a current price.',url:'https://store.steampowered.com/app/252490/Rust/',retrievedAt:new Date().toISOString()},{name:'But what is a neural network? · 3Blue1Brown · 10:14',text:'Transcript (en, controlled visual sample) [10:14–10:41]: The sigmoid maps a real number into a value between zero and one.',url:'https://www.youtube.com/watch?v=aircAruvnKk&t=614s',retrievedAt:new Date().toISOString()},{name:'Controlled computer store',text:'Controlled address for visual review · Kharkiv, Ukraine. No rating or inventory supplied.',url:'https://www.openstreetmap.org/node/123456',retrievedAt:new Date().toISOString()}];visualAnswer='## Sources, with context\n\nThese cards are controlled visual samples. Actual provider results are tested separately.';
 await page.locator('#chat-request').fill('Hello again');await page.locator('#chat-request').press('Enter');await page.locator('.source-cards').last().waitFor();await page.locator('.source-card').last().scrollIntoViewIfNeeded();await snap('06-source-cards');for(const [kind,n]of [['steam','07-steam'],['video','08-youtube'],['place','09-places']]){await page.locator('.source-'+kind).last().scrollIntoViewIfNeeded();await snap(n)}
 await page.locator('.source-title').last().click();await page.getByRole('dialog').waitFor();await snap('10-source-preview');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Close');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');results.checks.dialogFocusTrap='PASS';await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);results.checks.previewEscape='PASS';
 await nav('Browser');await snap('11-browser-empty');const settings=await host.request('ai.state');const p=settings.profiles.find(p=>p.id===settings.selected);await host.request('ai.saveProfile',{...p,intelligence:{...p.intelligence,web:'ask'}});await host.request('ai.localOnly',{enabled:false});await page.waitForTimeout(2200);await page.getByLabel('Public URL or search').fill('https://example.com/');await page.getByRole('button',{name:'Open / Search',exact:true}).click();await page.getByRole('dialog').waitFor();await snap('12-internet-ask');await page.keyboard.press('Escape');
 await host.request('ai.memoryAdd',{scope:'user',content:'Prefer concise explanations with clear examples.',shared:false});const space=await host.request('ai.knowledgeSpaceCreate',{profileId:p.id,name:'Project Aurora',project:''});await host.request('ai.knowledgeNote',{profileId:p.id,spaces:[space.id],name:'ORBIT visual review.txt',text:'Controlled Knowledge source. The project name is Aurora.'});
 for(const [name,file]of [['Knowledge','13-knowledge'],['Memory','14-memory'],['My AIs','15-my-ais'],['Projects','16-projects'],['Agent activity','17-agent'],['Files','18-files']]){await nav(name);await page.waitForTimeout(250);await snap(file)}
 await page.getByRole('button',{name:'Settings',exact:true}).click();await snap('19-settings-general');await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Appearance',exact:true}).click();await snap('20-settings-appearance');await page.getByLabel('Theme',{exact:true}).selectOption('light');await page.waitForTimeout(250);assert.equal(await page.getByLabel('Theme',{exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(32, 39, 56)');results.checks.lightControlColor='PASS';await snap('21-settings-light');await page.reload();await page.getByRole('button',{name:'Chats',exact:true}).click();await page.getByRole('button',{name:'New chat',exact:true}).click();await snap('22-chat-light');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');results.checks.themePersistence='PASS';
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Appearance',exact:true}).click();await page.getByLabel('Theme',{exact:true}).selectOption('system');await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'dark');await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'light');results.checks.systemTheme='PASS';assert.equal(await page.locator('.shell').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');results.checks.reducedMotion='PASS';await page.getByLabel('Theme',{exact:true}).selectOption('dark');
 await host.request('ai.localOnly',{enabled:true});await nav('Chats');await page.waitForTimeout(2200);await snap('23-local-only');await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await snap('24-sidebar-collapsed');await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement instanceof HTMLElement&&document.activeElement!==document.body));await snap('25-keyboard-focus');const focused=await page.evaluate(()=>document.activeElement?.outerHTML);await page.keyboard.press('Shift+Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.outerHTML),focused);results.checks.keyboard='PASS';
 assert.deepEqual(errors,[]);results.completed=true;
}catch(error){results.error=String(error);process.exitCode=1;await snap('failure').catch(()=>{});}finally{await fs.writeFile('validation/visual-095.json',JSON.stringify(results,null,2));await browser.close();await new Promise(r=>server.close(r));await host.request('shutdown');await chatFixture.close();}console.log(results);
