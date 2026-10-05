import {pathToFileURL} from "node:url";
// Real acceptance: production core, actual Ollama, actual Windows Sense helper.
// Browser substitutes the Tauri transport only. It never substitutes model inference.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {createServer} from "node:http";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
const previousEvidence=process.argv.includes("--resume")?JSON.parse(await fs.readFile("validation/intelligence-ui-acceptance.json","utf8")):null;
const root=process.cwd(),model=process.argv[2]??"gemma3:4b",runId=previousEvidence?.runId??String(Date.now());
const base=path.join(root,".desktop-cache","real-local-"+runId),trace=path.join(root,"validation","intelligence-ui-network-"+runId+".jsonl");
await fs.mkdir(base,{recursive:true});if(!previousEvidence)await fs.writeFile(trace,"");
const out=path.join(root,"validation","intelligence-ui-acceptance.json");
const evidence=previousEvidence??{runId,date:new Date().toISOString(),model,mode:"Browser production frontend + separate production core + real Ollama; native shell not executed",networkTrace:path.basename(trace),steps:{}};
delete evidence.error;
const save=async()=>fs.writeFile(out,JSON.stringify(evidence,null,2));
const record=async(name,value)=>{evidence.steps[name]=value;await save();console.log(name+": "+(value.status??"recorded"));};
const wait=async(fn,timeout=180000)=>{const until=Date.now()+timeout;while(Date.now()<until){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,150));}throw new Error("Acceptance timed out");};
let visualPermission=false;
let child,call,pending,sequence=0,corePids=[],server,browser,page,windowProcess,latestSense,scopeSession,snapshot,epoch=0;
const ps=path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
const helper=await fs.readFile("src-tauri/src/sense-helper.ps1","utf8");
async function nativeHelper(input){
 const proc=spawn(ps,["-NoProfile","-NonInteractive","-Command",helper],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let output="";proc.stdout.on("data",c=>{output+=c;if(output.length>3500000)proc.kill();});proc.stderr.resume();proc.stdin.end(JSON.stringify(input)+"\n");
 const timer=setTimeout(()=>proc.kill(),25000);
 try{const exit=await new Promise((resolve,reject)=>{proc.once("exit",resolve);proc.once("error",reject);});assert.equal(exit,0,"Windows Sense helper failed");return JSON.parse(output);}finally{clearTimeout(timer);}
}
const config={workspace:null,stateDirectory:base,providers:[{id:"cosmo-local",name:"Ollama · real local",type:"local",endpoint:"http://127.0.0.1:11434/v1/",remoteAcknowledged:false,localInferenceConfirmed:true}],providerKeys:{},filesEnabled:true,terminalEnabled:false,verificationCommand:"npm test"};
await fs.writeFile(path.join(base,"provider-settings.json"),JSON.stringify(config));
async function startCore(){
 pending=new Map();
 child=spawn(path.join(root,"src-tauri/resources/node/node.exe"),["--disable-warning=ExperimentalWarning","--import",pathToFileURL(path.join(root,"scripts/real-local-network-observer.mjs")).href,path.join(root,"src-tauri/resources/core/host.mjs")],{
 cwd:base,windowsHide:true,stdio:["pipe","pipe","pipe"],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:base,TMP:base,USERPROFILE:process.env.USERPROFILE,LOCALAPPDATA:process.env.LOCALAPPDATA,PATH:path.join(process.env.SystemRoot,"System32"),ORBIT_ACCEPTANCE_TRACE:trace}
 });
 corePids.push(child.pid);let diagnostic="";child.stderr.on("data",c=>{diagnostic=(diagnostic+c).slice(-8000);});child.once("exit",code=>{if(code)console.log(diagnostic);});
 createInterface({input:child.stdout}).on("line",line=>{const msg=JSON.parse(line);const task=pending.get(msg.id);if(task){clearTimeout(task.timer);pending.delete(msg.id);msg.error?task.reject(new Error(msg.error)):task.resolve(msg.result);}});
 child.once("exit",code=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error("Core exited "+code));}pending.clear();});
 call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("Core timeout: "+method));},180000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+"\n");});
 await call("configure",JSON.parse(await fs.readFile(path.join(base,"provider-settings.json"),"utf8")));
}
async function stopCore(){if(!child||child.exitCode!==null)return;await call("shutdown").catch(()=>{});child.stdin.end();await new Promise(r=>child.once("exit",r));}
const desktop={settings:{projects:[],workspace:null,model:"",verificationCommand:"npm test",filesEnabled:true,terminalEnabled:false,closeBehavior:"exit",notifications:false,shortcut:"Ctrl+Space",paletteShortcut:"Ctrl+K",settingsShortcut:"Ctrl+,",newTaskShortcut:"Ctrl+N",onboarding:true,trayExplained:true},projects:[],hasKey:false,version:"0.7.0",warning:"",autostart:false};
async function senseCommand(action,params){
 if(action==="stop"){const old=epoch++;scopeSession=undefined;snapshot=undefined;await call("sense.cancel",{epoch:old});return {};}
 if(action==="windows"){const all=await nativeHelper({action:"windows"});return {...all,windows:all.windows.filter(w=>w.processId===windowProcess?.pid),displays:[]};}
 if(action==="start"){const all=await nativeHelper({action:"windows"});const target=all.windows.find(w=>w.processId===windowProcess?.pid&&w.id===params.targetId);assert.ok(target,"Only the designated public test window is allowed");assert.equal(params.scope,"current-window");const state=await call("ai.state");assert.equal(state.profiles.find(p=>p.id===params.profileId)?.senseEnabled,true);scopeSession={sessionId:++epoch,profileId:params.profileId,scope:params.scope,target};return scopeSession;}
 assert.ok(scopeSession&&params.sessionId===scopeSession.sessionId,"Sense lease required");
 if(action==="capture"){snapshot=await call("sense.sanitize",await nativeHelper({action:"capture",scope:scopeSession.scope,target:scopeSession.target,snapshot:!!params.snapshot}));return snapshot;}
 if(action==="ask"){assert.ok(snapshot);latestSense=await call("sense.analyze",{epoch,input:{profileId:scopeSession.profileId,snapshot,question:params.question,acknowledgedDestination:params.acknowledgedDestination,includeImage:params.includeImage}});return latestSense;}
 throw new Error("Unsupported acceptance command");
}
try{
 const runtime=await fetch("http://127.0.0.1:11434/api/version").then(r=>r.json());
 const tags=await fetch("http://127.0.0.1:11434/api/tags").then(r=>r.json());assert.ok(tags.models.some(m=>m.name===model));
 const info=await fetch("http://127.0.0.1:11434/api/show",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model})}).then(r=>r.json());
 assert.ok(info.details?.parameter_size&&!info.remote_host,"Expected a locally installed model");
 await record("runtime",{status:"PASS",runtime,models:tags.models,capabilities:info.capabilities,details:info.details});
 await startCore();const state=await call("ai.state"),cosmo=state.profiles.find(p=>p.builtin?.id==="cosmo");assert.ok(cosmo);
 const discovered=await call("ai.detect");const models=await call("ai.models",{providerId:"cosmo-local",refresh:true});const descriptor=models.find(m=>m.model===model);assert.ok(descriptor);
 await call("ai.saveProfile",{...cosmo,providerId:"cosmo-local",modelId:model,maxTokens:1024});await call("ai.select",{id:cosmo.id});
 await record("discovery",{status:"PASS",runtimes:discovered,descriptor});
 const tested=await call("ai.brainTest",{profileId:cosmo.id});assert.ok(tested.text?.trim());await record("inference",{status:"PASS",text:tested.text});
 server=createServer((req,res)=>{void(async()=>{const file=path.resolve(root,"frontend-dist","."+((req.url??"/").split("?")[0]==="/" ? "/index.html":(req.url??"/").split("?")[0]));assert.ok(file.startsWith(path.join(root,"frontend-dist")+path.sep));const bytes=await fs.readFile(file);res.setHeader("content-type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(bytes);})().catch(()=>{res.statusCode=404;res.end();});});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=await chromium.launch({headless:false,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(30000);
 await page.exposeFunction("orbitRealInvoke",async(cmd,args={})=>{
  if(cmd.startsWith("plugin:event|"))return 1;
  if(cmd==="desktop_state")return desktop;
  if(cmd==="save_provider"){
    assert.equal(args.input.provider.type,"local");
    assert.equal(args.input.provider.endpoint,"http://127.0.0.1:11434/v1/");
    const index=config.providers.findIndex(p=>p.id===args.input.provider.id);
    if(index>=0)config.providers[index]=args.input.provider;else config.providers.push(args.input.provider);
    await fs.writeFile(path.join(base,"provider-settings.json"),JSON.stringify(config));
    await call("configure",config);return {};
  }
  if(cmd==="core_command"){
    const result=await call(args.method,args.params);
    if(visualPermission&&args.method==="status")return {...result,pending:[{id:"visual-only",kind:"permission",data:{request:{domain:"terminal",action:"execute",risk:"LOW",target:"npm test",reason:"UI rendering example only — verify project tests. No agent task or command was run."}}}]};
    return result;
  }
  if(cmd==="sense_command")return senseCommand(args.action,args.params??{});
  throw new Error("Unsupported browser transport: "+cmd);
 });
 await page.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:(cmd,args)=>window.orbitRealInvoke(cmd,args),transformCallback:()=>1,unregisterCallback:()=>{}};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};});
 const url="http://127.0.0.1:"+server.address().port;await page.goto(url);

 await page.getByLabel("Current AI",{exact:true}).waitFor();
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 assert.equal(await page.locator(".chat-toolbar,.chat-identity").count(),0);
 assert.equal(await page.getByRole("button",{name:"+ New chat",exact:true}).count(),1);
 async function snapshots(kind) {
  for(const [width,height] of [[1100,700],[1366,768],[1440,900],[1920,1080]]) {
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"No horizontal overflow");
   if(kind!=="settings") {const r=await page.locator("#chat-request").boundingBox();assert.ok(r&&r.y+r.height<=height,"Composer visible");}
   await page.mouse.move(10,10);await new Promise(r=>setTimeout(r,100));await page.screenshot({path:"validation/intelligence-ui-"+kind+"-"+width+".png"});
  }
 }
 await snapshots("new");
 await page.keyboard.type("Привет");await page.keyboard.press("Enter");
 await wait(async()=>{const g=await call("chat.status");return g&&!g.running&&g.text?g:null;});
 await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
 await record("keyboardChat",{status:"PASS",withoutComposerClick:true,response:(await call("chat.status")).text});
 const previous=(await call("chat.status")).id;
 await page.locator("#chat-request").fill("Write a short Markdown demonstration. Include all four: a ## heading, a three-item bullet list, a fenced typescript code block adding two numbers, and a Markdown table with columns Name and Value and two rows. Do not wrap the entire response in a code fence.");
 await page.keyboard.press("Enter");
 const response=await wait(async()=>{const g=await call("chat.status");return g&&g.id!==previous&&!g.running?g:null;});
 assert.equal(response.error,undefined);
 await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
 const last=page.locator(".chat-message.assistant").last();
 for(const selector of ["h2","ul li",".message-code pre code","table tr"])assert.ok(await last.locator(selector).count()>0,"Markdown: "+selector);
 await record("realMarkdown",{status:"PASS",model:response.model,response:response.text});
 await snapshots("active");
 await last.locator(".markdown-table").scrollIntoViewIfNeeded();await page.screenshot({path:"validation/intelligence-ui-markdown-detail.png"});
 await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await snapshots("collapsed");await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole("button",{name:"Settings",exact:true}).click();
 const sections=["General","Appearance","AI & Models","Local AI","Sense","Agent & Permissions","Knowledge & Memory","Shortcuts","Privacy & Data","Advanced","About"];
 for(const section of sections) {
  const nav=page.getByRole("navigation",{name:"Settings sections"});
  await nav.getByRole("button",{name:section,exact:true}).click();
  await wait(async()=>await page.locator(".settings-content > h2").textContent()===section);
  assert.equal(await nav.locator('[aria-current="page"]').count(),1);
  assert.equal(await nav.locator('[aria-current="page"]').textContent(),section);
  const other=nav.getByRole("button",{name:section==="General"?"Privacy & Data":"General",exact:true});await other.hover();await new Promise(r=>setTimeout(r,200));
  const activeBackground=await nav.locator('[aria-current="page"]').evaluate(el=>getComputedStyle(el).backgroundColor);
  const hoverBackground=await other.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(activeBackground,hoverBackground,"Hover must not look selected");
  for(const [width,height] of [[1100,700],[1366,768]]) {await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 }
 await record("settingsRegression",{status:"PASS",sections,activeStateMatchesContent:true,hoverDistinct:true,sizes:["1100x700","1366x768"]});
 await page.getByRole("navigation",{name:"Settings sections"}).getByRole("button",{name:"General",exact:true}).click();await snapshots("settings");
 await page.getByRole("button",{name:"Chats",exact:true}).click();await page.setViewportSize({width:1440,height:900});
 let menu=page.locator(".recent-row").filter({has:page.locator('[aria-current="true"]')}).locator(".recent-menu");
 await menu.locator("summary").click();await menu.getByRole("button",{name:"Rename",exact:true}).click();
 let dialog=page.getByRole("dialog",{name:"Rename conversation"});await dialog.waitFor();
 await wait(()=>page.getByLabel("Conversation name").evaluate(el=>el===document.activeElement));
 await page.getByLabel("Conversation name").fill("Final polish acceptance");await page.keyboard.press("Enter");await dialog.waitFor({state:"hidden"});
 await page.getByRole("button",{name:"Final polish acceptance",exact:true}).waitFor();
 menu=page.locator(".recent-row").filter({has:page.getByRole("button",{name:"Final polish acceptance",exact:true})}).locator(".recent-menu");
 if(!await menu.evaluate(el=>el.open))await menu.locator("summary").click();
 await menu.getByRole("button",{name:"Rename",exact:true}).click();await dialog.waitFor();await page.screenshot({path:"validation/intelligence-ui-rename-dialog.png"});
 await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
 await menu.getByRole("button",{name:"Delete",exact:true}).click();dialog=page.getByRole("dialog",{name:"Delete this conversation?"});await dialog.waitFor();
 await page.keyboard.press("Tab");assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
 await page.screenshot({path:"validation/intelligence-ui-delete-dialog.png"});
 await dialog.getByRole("button",{name:"Delete",exact:true}).click();await dialog.waitFor({state:"hidden"});
 await wait(async()=>await page.locator(".chat-message").count()===0);
 await record("dialogs",{status:"PASS",renameEnter:true,escape:true,focusTrap:true,delete:true});
 evidence.completed=true;await save();
}catch(error){evidence.error=String(error);await save();if(page)await page.screenshot({path:"validation/intelligence-ui-failure.png"}).catch(()=>{});throw error;}
finally{if(scopeSession)await senseCommand("stop",{}).catch(()=>{});if(windowProcess)windowProcess.kill();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await stopCore();}

