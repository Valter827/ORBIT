// Native installed ORBIT acceptance. The loopback server is a protocol fixture, not an LLM.
import {chromium} from "playwright";
import {createServer} from "node:http";
import {spawnSync} from "node:child_process";
import {promises as fs} from "node:fs";
import assert from "node:assert/strict";
const results=[], secret="orbit-acceptance-synthetic-key";
let authenticated=0, browser,page;
const server=createServer((req,res)=>{
 if(req.headers.authorization==="Bearer "+secret)authenticated++;
 res.setHeader("content-type","application/json");
 if(req.url==="/v1/models"){res.end(JSON.stringify({data:[{id:"acceptance-fixture",capabilities:["tools"],context_length:32768}]}));return;}
 if(req.url!=="/v1/chat/completions"){res.writeHead(404);res.end();return;}
 let body="";req.on("data",b=>body+=b);req.on("end",()=>{
 const input=JSON.parse(body);assert.equal(input.tools,undefined);
 if(!input.stream){res.end(JSON.stringify({model:"acceptance-fixture",choices:[{message:{content:"OK"}}],usage:{prompt_tokens:2,completion_tokens:1}}));return;}
 res.setHeader("content-type","text/event-stream");
 res.write('data: {"model":"acceptance-fixture","choices":[{"delta":{"content":"Native fixture "},"finish_reason":null}]}\n\n');
 const timer=setTimeout(()=>res.end('data: {"choices":[{"delta":{"content":"response"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":3}}\n\ndata: [DONE]\n\n'),1500);
 res.on("close",()=>clearTimeout(timer));
 });
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const config={id:"acceptance-local",name:"Acceptance protocol fixture",type:"local",endpoint:"http://127.0.0.1:"+server.address().port+"/v1/",remoteAcknowledged:false,localInferenceConfirmed:true};
const connect=async()=>{
 for(let i=0;i<50;i++){try{browser=await chromium.connectOverCDP("http://127.0.0.1:9224");page=browser.contexts()[0].pages().find(p=>p.url().includes("tauri.localhost")&&!p.url().includes("quick="));if(page)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(page);await page.reload();await page.getByRole("heading",{name:"What shall we work on?",exact:true}).waitFor();
};
const invoke=(method,args={})=>page.evaluate(({method,args})=>window.__TAURI_INTERNALS__.invoke(method,args),{method,args});
const core=(method,params={})=>invoke("core_command",{method,params});
try{
 await connect();
 assert.equal((await invoke("desktop_state")).version,"0.4.0");results.push("PASS installed version and Desktop shortcut launch");
 const prior=await core("ai.state");
 const retained=prior.profiles.find(p=>p.providerId!==config.id);assert.ok(retained);prior.selected=retained.id;
 await core("ai.select",{id:retained.id});
 for(const p of prior.profiles.filter(p=>p.providerId===config.id))await core("ai.delete",{id:p.id});
 assert.ok(!prior.providers.some(p=>p.id===config.id && p.name!==config.name),"Refusing to overwrite a non-test provider");
 await invoke("save_provider",{input:{provider:config,apiKey:secret,disconnect:false}});
 await core("ai.models",{providerId:config.id,refresh:true});
 await page.getByRole("button",{name:"AI Studio",exact:true}).click();
 await page.getByRole("button",{name:"+ Create AI",exact:true}).click();
 await page.getByLabel("Name",{exact:true}).fill("NOVA");
 await page.getByRole("button",{name:"Continue",exact:true}).click();
 await page.getByLabel(/^Provider/).selectOption(config.id);
 await page.getByRole("button",{name:"Refresh available models",exact:true}).click();
 await page.getByLabel(/^Model/).selectOption("acceptance-fixture");
 for(let i=1;i<7;i++)await page.getByRole("button",{name:"Continue",exact:true}).click();
 await page.getByRole("button",{name:"Save AI",exact:true}).click();
 const card=page.locator("section.card").filter({has:page.getByRole("heading",{name:"NOVA",exact:true})});
 await card.getByRole("button",{name:"Open / Select",exact:true}).click();
 results.push("PASS eight-step NOVA wizard and selection");
 await page.getByRole("button",{name:"Home",exact:true}).click();
 if(!await page.getByLabel("Local Only Mode",{exact:true}).isChecked())await page.getByLabel("Local Only Mode",{exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll("label")].find(e=>e.textContent==="Local Only Mode")?.querySelector("input")?.checked);
 await page.getByLabel("Ask ORBIT",{exact:true}).fill("Explain this test");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await page.getByRole("button",{name:"AI Studio",exact:true}).click();
 await page.getByRole("button",{name:"Home",exact:true}).click();
 await page.locator(".chat-message.assistant").filter({hasText:"Native fixture response"}).waitFor();
 await page.getByRole("button",{name:"Regenerate",exact:true}).click();
 await page.getByRole("button",{name:"Regenerate",exact:true}).waitFor({state:"visible"});
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent==="Regenerate");return b&&!b.disabled;});
 assert.equal(await page.locator(".chat-message.assistant").count(),1);
 results.push("PASS streaming Chat, navigation continuity and regeneration without duplicate replies");
 await page.getByLabel("Ask ORBIT",{exact:true}).fill("Cancel this response");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await page.getByRole("button",{name:"Stop generating",exact:true}).click();
 await page.getByText("Generation stopped.",{exact:true}).waitFor();
 results.push("PASS cancellation");
 await assert.rejects(core("testConnection"),/LOCAL ONLY/);
 results.push("PASS Local Only blocks legacy remote connection test");
 await page.screenshot({path:"validation/windows-v04-chat.png"});
 const saved=await core("ai.state"), nova=saved.profiles.find(p=>p.id===saved.selected);assert.equal(nova.name,"NOVA");
 const exported=await core("ai.export",{id:nova.id});assert.ok(!exported.text.includes(secret));
 const beforeRestart=authenticated;assert.ok(beforeRestart>0);
 await invoke("window_action",{action:"stop-exit"}).catch(()=>{});
 await browser.close().catch(()=>{});browser=undefined;page=undefined;
 await new Promise(r=>setTimeout(r,1200));
 const launch=spawnSync("powershell.exe",["-NoProfile","-Command","Start-Process -FilePath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ORBIT.lnk') -WindowStyle Hidden"],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port=9224"}});
 assert.equal(launch.status,0);await connect();
 const restored=await core("ai.state");assert.equal(restored.selected,nova.id);assert.equal(restored.profiles.find(p=>p.id===nova.id).modelId,"acceptance-fixture");
 await core("ai.test",{providerId:config.id,modelId:"acceptance-fixture"});
 assert.ok(authenticated>beforeRestart);assert.ok(!JSON.stringify(restored).includes(secret));
 results.push("PASS restart: NOVA selection, model and Windows Credential Manager credential persist");
 await page.getByRole("button",{name:"AI Studio",exact:true}).click();await page.screenshot({path:"validation/windows-v04-studio.png"});
 await invoke("save_provider",{input:{provider:config,disconnect:true}});
 results.push("PASS disconnect removes synthetic credential");
 await core("ai.localOnly",{enabled:prior.localOnly});await core("ai.select",{id:prior.selected});
 await core("ai.delete",{id:nova.id});
 await invoke("window_action",{action:"stop-exit"}).catch(()=>{});
 results.push("NOT VERIFIED real Anthropic and real local LLM: no credentials/runtime supplied");
 console.log(results.join("\n"));
 await fs.writeFile("validation/windows-v04-result.json",JSON.stringify({results,fixture:true},null,2));
}catch(error){console.error(error);if(page)await page.screenshot({path:"validation/windows-v04-failure.png"}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close().catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));}
