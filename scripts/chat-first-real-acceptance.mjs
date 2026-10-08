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
const previousEvidence=process.argv.includes("--resume")?JSON.parse(await fs.readFile("validation/chat-first-real-acceptance.json","utf8")):null;
const root=process.cwd(),model=process.argv[2]??"gemma3:4b",runId=previousEvidence?.runId??String(Date.now());
const base=path.join(root,".desktop-cache","real-local-"+runId),trace=path.join(root,"validation","chat-first-network-"+runId+".jsonl");
await fs.mkdir(base,{recursive:true});if(!previousEvidence)await fs.writeFile(trace,"");
const out=path.join(root,"validation","chat-first-real-acceptance.json");
const evidence=previousEvidence??{runId,date:new Date().toISOString(),model,mode:"Browser UI + separate production core process + production Windows Sense helper; Rust native broker not executed",networkTrace:path.basename(trace),steps:{}};
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
const desktop={settings:{projects:[],workspace:null,model:"",verificationCommand:"npm test",filesEnabled:true,terminalEnabled:false,closeBehavior:"exit",notifications:false,shortcut:"Ctrl+Space",paletteShortcut:"Ctrl+K",settingsShortcut:"Ctrl+,",newTaskShortcut:"Ctrl+N",onboarding:true,trayExplained:true},projects:[],hasKey:false,version:"0.6.1",warning:"",autostart:false};
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
 await page.getByRole("heading",{name:"COSMO 1.0",exact:true}).first().waitFor();
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await page.screenshot({path:"validation/chat-first-new.png"});
 await page.keyboard.type("Привет");await page.keyboard.press("Enter");
 await wait(async()=>{const g=await call("chat.status");return g&&!g.running&&g.text?g:null;});
 await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await record("keyboardStartup",{status:"PASS",typedWithoutClick:true});
 
 async function send(text){
  const previous=(await call("chat.status"))?.id;await page.locator("#chat-request").fill(text);await page.getByRole("button",{name:"Send message ↑",exact:true}).click();
  const samples=[];const result=await wait(async()=>{const g=await call("chat.status");if(g&&g.id!==previous){if(g.running&&g.text.length)samples.push(g.text.length);if(!g.running)return g;}return null;});
  assert.equal(result.error,undefined);assert.ok(result.text.trim());await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
  return {...result,sampleLengths:[...new Set(samples)]};
 }
 if(!previousEvidence){
 const name=await send("Меня зовут Алекс.");
 const intro=await send("Привет. Представься одним предложением.");
 await record("chat",{status:"PASS",nameResponse:name.text,introduction:intro.text,model:intro.model,conversationId:intro.conversationId});
 const context=await send("Как меня зовут в контексте этого разговора, если я только что представился как Алекс?");
 assert.match(context.text,/Алекс|Alex/i);const noHint=await send("Как меня зовут? Ответь только именем.");assert.match(noHint.text,/Алекс|Alex/i);await record("context",{status:"PASS",question:"Как меня зовут в контексте этого разговора, если я только что представился как Алекс?",answer:context.text,noHintAnswer:noHint.text});
 await page.screenshot({path:"validation/chat-first-chat-v061.png"});
 const chatId=context.conversationId,before=await call("chat.messages",{id:chatId,profileId:cosmo.id});
 await stopCore();await startCore();const restored=await call("ai.state");
 assert.equal(restored.selected,cosmo.id);assert.equal(restored.profiles.find(p=>p.id===cosmo.id).modelId,model);
 assert.deepEqual(await call("chat.messages",{id:chatId,profileId:cosmo.id}),before);
 await page.reload();await page.locator(".chat-message.user").filter({hasText:"Меня зовут Алекс."}).first().waitFor();
 await record("restart",{status:"PASS",corePids,messageCount:before.length,selectedModel:model});
 const stream=await send("Напиши восемь коротких предложений о планетах Солнечной системы.");await record("streaming",{status:stream.sampleLengths.length>1?"PASS":"NOT VERIFIED",sampleLengths:stream.sampleLengths,answer:stream.text});
 const previous=(await call("chat.status"))?.id;
 await page.locator("#chat-request").fill("Напиши очень длинную историю о космическом путешествии: не менее 2000 слов, с подробным описанием каждой планеты.");
 await page.getByRole("button",{name:"Send message ↑",exact:true}).click();
 const generating=await wait(async()=>{const s=await call("chat.status");return s?.id!==previous&&s?.running&&s.text.length>30?s:null;});
 await page.getByRole("button",{name:"Stop generating",exact:true}).click();
 const stopped=await wait(async()=>{const s=await call("chat.status");return s?.id===generating.id&&!s.running?s:null;});assert.match(stopped.error,/stopped/i);
 await new Promise(r=>setTimeout(r,750));const later=await call("chat.status");assert.equal(later.text,stopped.text);
 const network=await fs.readFile(trace,"utf8");assert.ok(network.split("\n").filter(Boolean).map(l=>JSON.parse(l)).some(r=>r.event==="responseClosed"&&r.path==="/v1/chat/completions"&&r.complete===false));
 await record("cancellation",{status:"PASS",error:stopped.error,charactersAtStop:stopped.text.length,charactersLater:later.text.length,httpResponseClosedIncomplete:true});
 const knowledgeFile=path.join(base,"ORBIT_TEST_FACT_928.txt");await fs.writeFile(knowledgeFile,'ORBIT_TEST_FACT_928 = "The silver planet is Nereon."');
 await call("knowledge.ingest",{profileId:cosmo.id,paths:[knowledgeFile]});
 await wait(async()=>{const list=await call("ai.knowledgeList",{profileId:cosmo.id});return list.some(s=>s.name==="ORBIT_TEST_FACT_928.txt"&&s.chunkCount>0);});
 const knowledge=await send("What is the silver planet?");assert.match(knowledge.text,/Nereon/i);assert.ok(knowledge.knowledge?.sources.some(s=>s.name==="ORBIT_TEST_FACT_928.txt"));
 await record("knowledge",{status:"PASS",answer:knowledge.text,sources:knowledge.knowledge.sources.map(s=>s.name)});await page.getByRole("button",{name:"Context",exact:true}).click();await page.screenshot({path:"validation/chat-first-knowledge-v061.png"});
 }else{await page.locator(".chat-toolbar summary").click();await page.getByLabel("Chat history",{exact:true}).selectOption(evidence.steps.chat.conversationId);await page.locator(".chat-toolbar summary").click();}
 await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByRole("button",{name:"Privacy & Data",exact:true}).click();
 if(!(await call("ai.state")).localOnly)await page.getByLabel("Local Only Mode",{exact:true}).click();await wait(async()=> (await call("ai.state")).localOnly);
 await page.getByRole("button",{name:"Chats",exact:true}).click();
 if(evidence.steps.localOnly?.status!=="PASS"){const local=await send("Одним предложением объясни, почему Луна светится.");await record("localOnly",{status:"PASS",enabled:(await call("ai.state")).localOnly,answer:local.text,configuredProviders:config.providers.map(p=>({id:p.id,endpoint:p.endpoint})),remoteProviderConfigured:false});}
 const windowScript="Add-Type -AssemblyName System.Windows.Forms,System.Drawing\n$f=New-Object Windows.Forms.Form\n$f.Text='ORBIT real local Sense acceptance'\n$f.Size=New-Object Drawing.Size(620,410)\n$l=New-Object Windows.Forms.Label\n$l.Text=\"Question:\\nWhat is the capital of France?\\n\\nA) Berlin\\nB) Madrid\\nC) Paris\\nD) Rome\".Replace('\\n',[Environment]::NewLine)\n$l.Font=New-Object Drawing.Font('Arial',18)\n$l.Location=New-Object Drawing.Point(20,20)\n$l.Size=New-Object Drawing.Size(560,330)\n$f.Controls.Add($l)\n[void]$f.ShowDialog()";
 windowProcess=spawn(ps,["-NoProfile","-NonInteractive","-Command",windowScript],{windowsHide:false,stdio:"ignore"});
 await wait(async()=> (await nativeHelper({action:"windows"})).windows.some(w=>w.processId===windowProcess.pid),30000);
 await page.bringToFront();await page.getByRole("button",{name:"Sense",exact:true}).click();
 const onboard=page.getByRole("button",{name:"Continue",exact:true});if(await onboard.isVisible())await onboard.click();
 if(!(await page.getByLabel("Enable Sense for COSMO",{exact:true}).isChecked()))await page.getByLabel("Enable Sense for COSMO",{exact:true}).click();
 await page.getByRole("button",{name:"Choose visible window / display",exact:true}).click();
 await page.getByRole("button",{name:"Share selected scope",exact:true}).click();
 await page.getByRole("button",{name:"Read shared window",exact:true}).click();await page.getByText("Last updated:",{exact:false}).waitFor();
 assert.match(snapshot.visibleText+" "+snapshot.ocrText,/capital of France/);
 await page.locator("#sense-request").fill("COSMO, ответь на вопрос на моём экране.");
 await page.getByRole("button",{name:"Ask COSMO",exact:true}).click();await wait(()=>latestSense);
 assert.match(latestSense.text,/Paris|Париж/i);assert.equal(latestSense.path,"structured-context");
 await record("sense",{status:"PASS",answer:latestSense.text,path:latestSense.path,publicWindowText:snapshot.visibleText,ocrStatus:snapshot.ocrStatus,sources:latestSense.sources,nativeRustBroker:"NOT VERIFIED"});
 latestSense=undefined;await page.locator("#sense-request").fill("Что находится на моём экране?");
 await page.getByRole("button",{name:"Ask COSMO",exact:true}).click();await wait(()=>latestSense);
 assert.ok(latestSense.text.trim());await record("senseUX",{status:"PASS",question:"Что находится на моём экране?",answer:latestSense.text,path:latestSense.path});
 await page.screenshot({path:"validation/chat-first-sense-v061.png"});
 if(descriptor.capabilities?.vision===true){
  const captured=await call("sense.sanitize",await nativeHelper({action:"capture",scope:scopeSession.scope,target:scopeSession.target,snapshot:true}));
  if(captured.image){
   const bytes=Buffer.from(captured.image,"base64"),imageHash=createHash("sha256").update(bytes).digest("hex");
   const imageOnly={...captured,visibleText:"",ocrText:"",nodes:[]};
   const vision=await call("sense.analyze",{epoch:++epoch,input:{profileId:cosmo.id,snapshot:imageOnly,question:"Read the multiple-choice question in the attached image and give the correct letter and answer.",acknowledgedDestination:"",includeImage:true}});
   assert.equal(vision.path,"vision");assert.ok(/Paris|Париж/i.test(vision.text)||/^\s*C[).]?\s*$/i.test(vision.text),"Vision must select Paris or its option C");
   await record("vision",{status:"PASS",answer:vision.text,correctOption:"C) Paris",path:vision.path,imageBytes:bytes.length,imageSha256:imageHash,extractedTextSent:false});
  }else await record("vision",{status:"NOT VERIFIED",reason:"Sense privacy/capture checks did not provide an image"});
 }else await record("vision",{status:"UNSUPPORTED",capabilities:descriptor.capabilities});
 await senseCommand("stop",{});
 await record("agent",{status:descriptor.supportsTools?"NOT VERIFIED":"UNSUPPORTED",capabilities:descriptor.capabilities,reason:descriptor.supportsTools?"Tool metadata confirmed; agent execution requires separate acceptance":"Runtime metadata does not confirm tool calling; no Agent claim from chat"});
 const lines=(await fs.readFile(trace,"utf8")).split("\n").filter(Boolean).map(l=>JSON.parse(l));
 assert.ok(lines.filter(l=>l.event==="request").every(l=>l.allowed));
 assert.ok(lines.filter(l=>l.event==="request"&&l.path==="/v1/chat/completions").every(l=>l.origin==="http://127.0.0.1:11434"));
 const streams=lines.filter(l=>l.event==="responseClosed"&&l.path==="/v1/chat/completions"&&l.sseFrames>1);
 assert.ok(streams.length);await record("network",{status:"PASS",inferenceOrigins:[...new Set(lines.filter(l=>l.path==="/v1/chat/completions"&&l.origin).map(l=>l.origin))],remoteRequests:lines.filter(l=>l.allowed===false).length,streams});

 await page.getByRole("button",{name:"Chat",exact:true}).click();
 await page.getByRole("button",{name:"Settings",exact:true}).click();
 const sections=["General","Appearance","AI & Models","Local AI","Sense","Agent & Permissions","Knowledge & Memory","Shortcuts","Privacy & Data","Advanced","About"];
 for(const section of sections){await page.getByRole("navigation",{name:"Settings sections"}).getByRole("button",{name:section,exact:true}).click();await page.getByRole("heading",{name:section,exact:true}).first().waitFor();if(section==="Local AI")await page.locator(".local-model-row").first().waitFor();await page.screenshot({path:"validation/chat-first-settings-"+section.replaceAll(/[^a-z]/gi,"-")+".png"});}
 await record("settings",{status:"PASS",sections});
 await page.getByRole("button",{name:"My AIs",exact:true}).click();await page.screenshot({path:"validation/chat-first-my-ais.png"});
 await page.getByRole("button",{name:"Chats",exact:true}).click();
 for(const [width,height] of [[1100,700],[1366,768],[1440,900],[1920,1080]]){
 await page.setViewportSize({width,height});const bounds=await page.locator("#chat-request").boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height,"Composer must remain visible");
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"No horizontal page overflow");
 await page.screenshot({path:"validation/chat-first-size-"+width+".png"});}
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole("button",{name:"Collapse sidebar",exact:true}).click();await page.screenshot({path:"validation/chat-first-collapsed.png"});
 await page.reload();await page.getByRole("button",{name:"Expand sidebar",exact:true}).waitFor();
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await page.getByRole("button",{name:"Expand sidebar",exact:true}).click();
 await record("responsive",{status:"PASS",sizes:["1100×700","1366×768","1440×900","1920×1080"],sidebarPersistence:true});

 await page.getByRole("button",{name:"New chat",exact:true}).click();
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await page.keyboard.type("Line one");await page.keyboard.press("Shift+Enter");await page.keyboard.type("Line two");
 assert.equal(await page.locator("#chat-request").inputValue(),"Line one\nLine two");
 await page.locator("#chat-request").fill("");
 await page.keyboard.press("Control+k");await page.getByRole("dialog",{name:"Command palette"}).waitFor();
 await new Promise(r=>setTimeout(r,500));
 assert.equal(await page.locator("#chat-request").evaluate(el=>document.activeElement===el),false);
 await page.keyboard.press("Escape");await page.getByRole("dialog").waitFor({state:"hidden"});
 await record("keyboardNavigation",{status:"PASS",newChatFocus:true,shiftEnter:true,paletteEscape:true,noDialogFocusSteal:true});
 const codeAnswer=await send("Show a TypeScript function that adds two numbers, in a fenced code block, then explain it briefly.");
 await page.locator(".message-code").first().waitFor();await page.screenshot({path:"validation/chat-first-code.png"});
 await record("codeRendering",{status:"PASS",answer:codeAnswer.text});
 const selectedProfile=(await call("ai.state")).profiles.find(p=>p.id===cosmo.id);
 await call("ai.saveProfile",{...selectedProfile,modelId:""});
 await page.reload();await page.getByRole("button",{name:"Set Up Local AI",exact:true}).waitFor();
 await wait(()=>page.locator("#chat-setup").evaluate(el=>document.activeElement===el));
 assert.equal(await page.locator("#chat-request").isDisabled(),true);
 await page.screenshot({path:"validation/chat-first-unconfigured.png"});
 await page.getByRole("button",{name:"Set Up Local AI",exact:true}).click();
 await page.getByLabel("Installed models",{exact:true}).selectOption(model);
 await page.getByLabel("Confirm local inference",{exact:true}).check();
 await page.locator(".local-setup").getByRole("button",{name:"Test model",exact:true}).click();
 await page.locator(".local-setup").waitFor({state:"hidden"});
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await record("setupReturn",{status:"PASS",realModelTest:true,automaticReturn:true,composerFocused:true});
 await call("ai.saveProfile",selectedProfile);await page.reload();
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 await record("unconfigured",{status:"PASS",chatVisible:true,setupFocused:true,composerDisabled:true});

 await page.locator(".chat-toolbar summary").click();
 page.once("dialog", d=>d.accept("Renamed acceptance chat"));await page.locator(".chat-toolbar").getByRole("button",{name:"Rename",exact:true}).click();
 await page.getByRole("button",{name:"Renamed acceptance chat",exact:true}).waitFor();
 page.once("dialog", d=>d.accept());await page.locator(".chat-toolbar").getByRole("button",{name:"Delete",exact:true}).click();
 await wait(async()=>await page.locator(".chat-message").count()===0);
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 const duplicate=await call("ai.duplicate",{id:cosmo.id});await call("ai.saveProfile",{...duplicate,name:"NOVA acceptance"});
 await wait(async()=>await page.getByRole("option",{name:"NOVA acceptance",exact:true}).count()>0);
 await page.getByLabel("Current AI",{exact:true}).selectOption(duplicate.id);
 await wait(()=>page.locator("#chat-request").evaluate(el=>document.activeElement===el));
 assert.equal((await call("ai.state")).selected,duplicate.id);
 await page.getByLabel("Current AI",{exact:true}).selectOption(cosmo.id);
 await record("historyAndSwitch",{status:"PASS",renamed:true,deleted:true,aiSwitchFocus:true});
 visualPermission=true;await page.getByRole("button",{name:"Agent activity",exact:true}).click();
 await page.getByRole("heading",{name:"Permission required",exact:true}).waitFor();
 await page.screenshot({path:"validation/chat-first-permission-UI-ONLY.png"});visualPermission=false;
 await record("permissionVisual",{status:"PASS",scope:"Rendering-only synthetic approval; not real Agent acceptance; no command executed"});
 evidence.completed=true;await save();
}catch(error){evidence.error=String(error);await save();if(page)await page.screenshot({path:"validation/chat-first-failure-v061.png"}).catch(()=>{});throw error;}
finally{if(scopeSession)await senseCommand("stop",{}).catch(()=>{});if(windowProcess)windowProcess.kill();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await stopCore();}

