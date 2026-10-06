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
const previousEvidence=process.argv.includes("--resume")?JSON.parse(await fs.readFile("validation/knowledge-intelligence-regression-acceptance.json","utf8")):null;
const root=process.cwd(),model=process.argv[2]??"gemma3:4b",runId=previousEvidence?.runId??String(Date.now());
const base=path.join(root,".desktop-cache","real-local-"+runId),trace=path.join(root,"validation","knowledge-intelligence-regression-network-"+runId+".jsonl");
await fs.mkdir(base,{recursive:true});if(!previousEvidence)await fs.writeFile(trace,"");
const out=path.join(root,"validation","knowledge-intelligence-regression-acceptance.json");
const evidence=previousEvidence??{runId,date:new Date().toISOString(),model,mode:"Browser production frontend + separate production core + real Ollama; native shell not executed",networkTrace:path.basename(trace),steps:{}};
delete evidence.error;
const save=async()=>fs.writeFile(out,JSON.stringify(evidence,null,2));
const record=async(name,value)=>{evidence.steps[name]=value;await save();console.log(name+": "+(value.status??"recorded"));};
const wait=async(fn,timeout=180000)=>{const until=Date.now()+timeout;while(Date.now()<until){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,150));}throw new Error("Acceptance timed out");};
let visualPermission=false;
const drafts=new Map();
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
 createInterface({input:child.stdout}).on("line",line=>{const msg=JSON.parse(line);if(msg.topic==="chat"&&msg.payload?.type==="text")drafts.set(msg.payload.id,(drafts.get(msg.payload.id)??"")+msg.payload.text);const task=pending.get(msg.id);if(task){clearTimeout(task.timer);pending.delete(msg.id);msg.error?task.reject(new Error(msg.error)):task.resolve(msg.result);}});
 child.once("exit",code=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error("Core exited "+code));}pending.clear();});
 call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error("Core timeout: "+method));},180000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+"\n");});
 await call("configure",JSON.parse(await fs.readFile(path.join(base,"provider-settings.json"),"utf8")));
}
async function stopCore(){if(!child||child.exitCode!==null)return;await call("shutdown").catch(()=>{});child.stdin.end();await new Promise(r=>child.once("exit",r));}
const desktop={settings:{projects:[],workspace:null,model:"",verificationCommand:"npm test",filesEnabled:true,terminalEnabled:false,closeBehavior:"exit",notifications:false,shortcut:"Ctrl+Space",paletteShortcut:"Ctrl+K",settingsShortcut:"Ctrl+,",newTaskShortcut:"Ctrl+N",onboarding:true,trayExplained:true},projects:[],hasKey:false,version:"0.9.3",warning:"",autostart:false};
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
 async function mode(value) {
   await page.getByRole("button",{name:value[0].toUpperCase()+value.slice(1),exact:true}).click();
   await wait(async()=> (await call("ai.state")).profiles.find(p=>p.id===cosmo.id).intelligence.mode===value);
 }
 async function send(text) {
   const old=(await call("chat.status"))?.id;
   await page.locator("#chat-request").fill(text); await page.keyboard.press("Enter");
   const answer=await wait(async()=>{const g=await call("chat.status");return g&&g.id!==old&&!g.running?g:null;});
   assert.equal(answer.error,undefined);
   await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
   return answer;
 }
 await mode("fast");
 await page.getByLabel("Brain selection").selectOption("auto");
 await wait(async()=> (await call("ai.state")).profiles.find(p=>p.id===cosmo.id).intelligence.auto);
 await call("ai.localOnly",{enabled:true});
 const fast=await send("Привет");
 assert.equal(fast.model,model);assert.equal(fast.knowledge.sources.length,0);assert.equal(fast.memoryUsed.length,0);
 await record("fast",{status:"PASS",response:fast.text,model:fast.model,timings:fast.intelligence});
 assert.equal(await page.getByRole("button",{name:"Verify answer",exact:true}).count(),0);
 await call("ai.knowledgeNote",{profileId:cosmo.id,name:"silver-planet.md",text:'ORBIT_TEST_FACT_928 = "The silver planet is Nereon."'});
 await call("ai.knowledgeNote",{profileId:cosmo.id,name:"irrelevant-recipe.md",text:"Banana bread uses flour and sugar."});
 await mode("balanced");
 const knowledge=await send("What do my notes say: what is the silver planet?");
 assert.match(knowledge.text,/Nereon/i);assert.ok(knowledge.knowledge.sources.some(s=>s.name==="silver-planet.md"));assert.ok(!knowledge.knowledge.sources.some(s=>s.name==="irrelevant-recipe.md"));
 let last=page.locator(".chat-message.assistant").last();
 await last.locator("details summary").click();await last.getByRole("button",{name:"silver-planet.md",exact:true}).click();
 await page.getByRole("dialog",{name:"silver-planet.md",exact:true}).waitFor();
 assert.match(await page.locator(".source-preview").textContent(),/Nereon/);
 await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();
 await record("knowledge",{status:"PASS",answer:knowledge.text,sources:knowledge.knowledge.sources,preview:true,timings:knowledge.intelligence});
 await call("ai.memoryAdd",{scope:"user",content:"Preferred programming language = JavaScript.",shared:false});
 const memory=await send("What programming language do I prefer, according to my memory?");
 assert.match(memory.text,/JavaScript/i);assert.equal(memory.memoryUsed.length,1);
 const conflict=await send("I now prefer TypeScript. Which programming language do I prefer now? Answer only the language.");
 assert.match(conflict.text,/TypeScript/i);
 await record("memory",{status:"PASS",answer:memory.text,currentInputWins:conflict.text,used:memory.memoryUsed});
 const nasa="So Venus – not Mercury – is the hottest planet in our solar system.";
 await call("ai.knowledgeNote",{profileId:cosmo.id,name:"NASA · https://science.nasa.gov/solar-system/temperatures-across-our-solar-system/",text:nasa});
 await mode("deep");
 const deep=await send("Какая планета Солнечной системы самая горячая?");
 assert.match(deep.text,/Venus|Венер/i);assert.doesNotMatch(deep.text,/Nereon/);assert.ok(deep.intelligence.verification.sources.some(s=>s.text===nasa));
 await record("deepFactual",{status:"PASS",draft:drafts.get(deep.id),evidence:deep.intelligence.verification.sources,final:deep.text,verification:deep.intelligence.verification.status,timings:deep.intelligence});
 const beforeVerify=(await fs.readFile(trace,"utf8")).split("\n").filter(l=>l.includes('"/v1/chat/completions"')&&l.includes('"event":"request"')).length;
 const old=deep.id;await page.getByRole("button",{name:"Verify answer",exact:true}).click();
 const verified=await wait(async()=>{const g=await call("chat.status");return g&&g.id!==old&&!g.running?g:null;});
 assert.equal(verified.error,undefined);
 const afterVerify=(await fs.readFile(trace,"utf8")).split("\n").filter(l=>l.includes('"/v1/chat/completions"')&&l.includes('"event":"request"')).length;
 assert.ok(afterVerify-beforeVerify<=1,"Verify uses at most one evidence comparison inference");
 await record("verifyUX",{status:"PASS",extraInferenceCalls:afterVerify-beforeVerify,statusLabel:verified.intelligence.verification.status});
 await page.getByRole("button",{name:"Stop generating",exact:true}).waitFor({state:"hidden"});
 for(const [width,height] of [[1100,700],[1440,900],[1920,1080]]) {
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const composer=await page.locator("#chat-request").boundingBox();assert.ok(composer&&composer.y+composer.height<=height);
  await page.screenshot({path:"validation/knowledge-intelligence-regression-chat-"+width+".png"});
 }
 const conversation=verified.conversationId,before=await call("chat.messages",{id:conversation,profileId:cosmo.id});
 await stopCore();await startCore();
 const restored=(await call("ai.state")).profiles.find(p=>p.id===cosmo.id);
 assert.equal(restored.intelligence.mode,"deep");assert.equal(restored.intelligence.auto,true);
 assert.deepEqual(await call("chat.messages",{id:conversation,profileId:cosmo.id}),before);
 await page.reload();await page.locator(".chat-message.assistant").last().waitFor();
 await record("restart",{status:"PASS",messages:before.length,mode:restored.intelligence.mode,auto:restored.intelligence.auto,corePids});
 const cancelOld=(await call("chat.status"))?.id;
 await page.locator("#chat-request").fill("Write a detailed 2000-word essay about the history of programming languages. Include many examples.");
 await page.keyboard.press("Enter");
 const running=await wait(async()=>{const g=await call("chat.status");return g?.running&&g.id!==cancelOld&&g.phase==="Thinking…"?g:null;});
 await wait(()=>drafts.get(running.id)?.length>10);
 await page.getByRole("button",{name:"Stop generating",exact:true}).click();
 const stopped=await wait(async()=>{const g=await call("chat.status");return g?.id===running.id&&!g.running?g:null;});
 assert.match(stopped.error,/stopped/i);assert.equal(stopped.intelligence.verification,undefined);
 await record("cancellation",{status:"PASS",result:stopped.error,verificationAfterStop:false});
 await record("sense",{status:"NOT VERIFIED",reason:"This core/browser regression does not exercise native ORBIT.exe Sense."});
 const lines=(await fs.readFile(trace,"utf8")).split("\n").filter(Boolean).map(l=>JSON.parse(l));
 assert.ok(lines.filter(l=>l.event==="request").every(l=>l.allowed));
 assert.ok(lines.some(l=>l.event==="responseClosed"&&l.sseFrames>1));
 assert.ok(lines.some(l=>l.event==="responseClosed"&&l.aborted));
 await record("localOnly",{status:"PASS",requests:lines.filter(l=>l.event==="request").length,nonLoopback:0,realStreaming:true,realAbort:true});
 await record("agent",{status:descriptor.supportsTools?"NOT VERIFIED":"UNSUPPORTED",capabilities:descriptor.capabilities});
 evidence.completed=true;await save();
}catch(error){evidence.error=String(error);await save();if(page)await page.screenshot({path:"validation/knowledge-intelligence-regression-failure.png"}).catch(()=>{});throw error;}
finally{if(scopeSession)await senseCommand("stop",{}).catch(()=>{});if(windowProcess)windowProcess.kill();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await stopCore();}

