import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { AIHub } from "../dist/packages/core/src/desktop/ai-hub.js";
import { CompatibleProvider } from "../dist/packages/core/src/ai/providers/compatible.js";
import { InferenceBudget, semanticVerify, understand } from "../dist/packages/core/src/ai/semantic.js";
import { IntelligenceSettings } from "../dist/packages/core/src/ai/intelligence.js";
import { probeModel } from "../dist/packages/core/src/ai/probes.js";
import { research, WikipediaSearch, PublicWebFetch } from "../dist/packages/core/src/ai/web-research.js";
const out="validation/hardening-real-acceptance.json";
const evidence={date:new Date().toISOString(),model:"gemma3:4b",steps:{}};
const save=()=>fs.writeFile(out,JSON.stringify(evidence,null,2));
const record=async(name,fn)=>{try{evidence.steps[name]={status:"PASS",...await fn()};}catch(e){evidence.steps[name]={status:"FAIL",error:String(e)};}await save();console.log(name+": "+evidence.steps[name].status);};
const provider=new CompatibleProvider("local","http://127.0.0.1:11434/v1/",true,async()=>null);
const models=await provider.listModels(AbortSignal.timeout(20000));
evidence.runtime={endpoint:"http://127.0.0.1:11434",models};
const model=models.find(m=>m.model==="gemma3:4b");assert.ok(model);
const budget=()=>new InferenceBudget(provider,model,AbortSignal.timeout(90000),3,4096);
await record("semanticRequest",async()=>{
 const result=await understand("Что мы решили по архитектуре?",IntelligenceSettings.parse({mode:"balanced"}),budget(),{files:false,sense:false,extraCalls:true});
 assert.equal(result.analyzer,"Semantic fallback");assert.ok(result.plan.memory||result.plan.knowledge);assert.equal(result.plan.sense,false);
 return result;
});
await record("semanticParaphrase",async()=>{
 const source={sourceId:"test-astronomy",name:"Controlled public astronomy evidence",text:"The dense Venusian atmosphere prevents heat escaping. Its surface temperature exceeds that of Mercury."};
 const result=await semanticVerify("Compare Venus and Mercury temperatures.","Venus is hotter than Mercury because its dense atmosphere traps heat.",[source],budget());
 assert.equal(result.stage,"Semantic evidence comparison");assert.equal(result.verification.status,"Verified");
 assert.ok(result.verification.claims.every(c=>c.status==="SUPPORTED"&&c.excerptId));
 return result;
});
await record("semanticContradiction",async()=>{
 const source={sourceId:"test-astronomy",name:"Controlled public astronomy evidence",text:"Venus has the highest average surface temperature of all planets in the solar system."};
 const result=await semanticVerify("What is the hottest planet?","Mercury is the hottest planet.",[source],budget());
 assert.equal(result.stage,"Semantic evidence comparison");assert.ok(result.verification.claims.some(c=>c.status==="CONTRADICTED"));
 assert.doesNotMatch(result.text,/Mercury/);assert.match(result.text,/Venus/);return result;
});
await record("realCancellation",async()=>{
 const controller=new AbortController();let received=0,cancelled=false;
 try{for await(const event of provider.stream(model.model,{system:"Follow the user. /no_think",messages:[{role:"user",content:"Write an extremely long numbered list of 1000 detailed facts about space."}],maxTokens:2000,signal:controller.signal})){received++;if(received>=2)controller.abort();}}catch(error){cancelled=controller.signal.aborted;}
 assert.ok(received>=2&&cancelled,"Actual streaming HTTP request must abort");
 return {receivedEvents:received,requestAborted:cancelled};
});
await record("capabilityProbes",async()=>({probes:await probeModel(provider,model,"http://127.0.0.1:11434/v1/",AbortSignal.timeout(150000))}));
await record("webResearch",async()=>{
 const result=await research({request:"Какая планета Солнечной системы самая горячая?",policy:"allow",localOnly:false,consent:true,search:new WikipediaSearch(),fetch:new PublicWebFetch(),signal:AbortSignal.timeout(25000)});
 if(!result.sources.length){return {status:"NOT VERIFIED",reason:result.status};}
 const sources=result.sources.map(s=>({...s,text:s.text.split(/(?<=[.!?])\s+/).filter(t=>/hottest|temperature|atmosphere|greenhouse/i.test(t)).slice(0,3).join(" ").slice(0,1500)})).filter(s=>s.text);
 const result2=await semanticVerify("What is the hottest planet?","Venus is the hottest planet.",sources,budget());
 assert.match(result2.text,/Venus/);assert.equal(result2.verification.status,"Verified");
 return {research:result.status,query:result.query,...result2};
});
const base=path.resolve(".desktop-cache","hardening-real-"+Date.now());
let hub=new AIHub(base,()=>{});
const configs=[{id:"cosmo-local",name:"Ollama",type:"local",endpoint:"http://127.0.0.1:11434/v1/",localInferenceConfirmed:true,remoteAcknowledged:false}];
hub.configure(configs,{});
const p=hub.profile();p.modelId="gemma3:4b";p.providerId="cosmo-local";p.intelligence.mode="deep";p.intelligence.web="off";p.maxTokens=800;
hub.store.saveProfile(p);hub.store.setPreference("localOnly","true");
await hub.knowledge.put(p.id,"public-astronomy.md","Venus has the highest average surface temperature of all planets. Its thick atmosphere traps heat through the greenhouse effect.");
await record("deepPipeline",async()=>{
 hub.chat({profileId:p.id,request:"Which planet has the highest surface temperature, and why? Please verify both facts."},"");
 while(hub.busy())await new Promise(r=>setTimeout(r,80));
 const result=hub.chatStatus();evidence.deepResult=result;await save();assert.equal(result.error,undefined);assert.match(result.text,/Venus|Венер/);
 assert.equal(result.intelligence.verificationStage,"Semantic evidence comparison");assert.ok(result.intelligence.inferenceCalls>=2&&result.intelligence.inferenceCalls<=3);
 return result;
});
await record("ambiguousMemory",async()=>{
 hub.store.addMemory(p,"","user","Architecture decision: use PostgreSQL as the database and TypeScript for the server.",false);
 p.intelligence.mode="balanced";hub.store.saveProfile(p);
 hub.chat({profileId:p.id,request:"Что мы решили по архитектуре?"},"");
 while(hub.busy())await new Promise(r=>setTimeout(r,80));
 const result=hub.chatStatus();assert.equal(result.error,undefined);assert.match(result.text,/PostgreSQL|TypeScript/i);assert.equal(result.intelligence.analyzer,"Semantic fallback");return result;
});
await record("integratedWebFact",async()=>{
 const fresh=hub.profile();fresh.intelligence.mode="deep";fresh.intelligence.web="allow";fresh.intelligence.searchProvider="wikipedia";fresh.modelId="gemma3:4b";fresh.providerId="cosmo-local";fresh.maxTokens=500;
 hub.store.saveProfile(fresh);hub.store.setPreference("localOnly","false");
 // Explicitly remove controlled Knowledge: this scenario must discover its own public evidence.
 for(const item of hub.knowledge.list(fresh.id)) await hub.knowledge.remove(fresh.id,item.id);
 hub.chat({profileId:fresh.id,request:"Какая планета Солнечной системы самая горячая?"},"");
 while(hub.busy())await new Promise(r=>setTimeout(r,80));
 const result=hub.chatStatus();evidence.webResult=result;await save();
 assert.equal(result.error,undefined);assert.match(result.text,/Venus|Венер/);assert.equal(result.intelligence.webStatus,"Sources retrieved");assert.equal(result.intelligence.verification.status,"Verified");return result;
});
await hub.shutdown();
evidence.completed=true;await save();

