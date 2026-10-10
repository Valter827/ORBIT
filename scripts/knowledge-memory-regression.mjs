import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {AIHub} from "../dist/packages/core/src/desktop/ai-hub.js";
import {Candidate} from "../dist/packages/core/src/desktop/personal-memory.js";
import {createProfile} from "../dist/packages/core/src/ai/profiles.js";
const out="validation/knowledge-memory-regression.json",base=path.resolve(".desktop-cache","memory-real-"+Date.now());
const evidence={date:new Date().toISOString(),version:"0.10.0",model:"gemma3:4b",steps:{}};
const save=()=>fs.writeFile(out,JSON.stringify(evidence,null,2));
const step=async(name,fn)=>{try{evidence.steps[name]={status:"PASS",...await fn()};}catch(error){evidence.steps[name]={status:"FAIL",error:String(error)};}await save();console.log(name+": "+evidence.steps[name].status);};
const configs=[{id:"cosmo-local",name:"Ollama",type:"local",endpoint:"http://127.0.0.1:11434/v1/",localInferenceConfirmed:true,remoteAcknowledged:false}];
let hub;const start=()=>{hub=new AIHub(base,()=>{});hub.configure(configs,{});hub.store.setPreference("localOnly","true");};
start();let profile=hub.profile();profile.providerId="cosmo-local";profile.modelId="gemma3:4b";profile.maxTokens=450;profile.memory.user=true;profile.memory.project=true;profile.intelligence.web="off";hub.store.saveProfile(profile);
const chat=async(request,project="",profileId=profile.id)=>{hub.chat({profileId,request},project);while(hub.busy())await new Promise(r=>setTimeout(r,60));const result=hub.chatStatus();assert.equal(result.error,undefined);return result;};
const initialRuntime=await fetch("http://127.0.0.1:11434/api/tags").then(r=>r.json());evidence.runtime=initialRuntime;await save();
let firstId,secondId;
await step("explicitPreference",async()=>{
 const answer=await chat("Запомни, что для новых веб-проектов я предпочитаю JavaScript.");
 const proposals=hub.store.personal.proposals(profile,"");assert.equal(proposals.length,1);assert.equal(proposals[0].candidate.type,"preference");assert.equal(hub.store.personal.rows(profile,"").length,0);
 firstId=hub.store.personal.decide(profile,"",proposals[0].id,"remember");
 assert.ok(firstId);return {answer:answer.text,memory:hub.store.personal.get(profile,"",firstId)};
});
await step("followUpRecall",async()=>{
 const answer=await chat("Какой язык лучше использовать для моего нового веб-проекта?");
 assert.match(answer.text,/JavaScript/i);assert.ok(answer.intelligence.memoryUsed.some(m=>m.id===firstId));return answer;
});
await step("currentInputWinsAndConflict",async()=>{
 const answer=await chat("Теперь я предпочитаю TypeScript для веб-проектов. Какой язык мне выбрать?");
 assert.match(answer.text,/TypeScript/);assert.equal(hub.store.personal.get(profile,"",firstId).status,"active");
 // Separate durable declaration avoids classifying a question itself as a memory.
 await chat("Теперь я предпочитаю TypeScript для веб-проектов.");
 const proposal=hub.store.personal.proposals(profile,"").find(p=>p.candidate.content.includes("TypeScript"));assert.ok(proposal);
 assert.ok(hub.store.personal.conflicts(profile,"",proposal.candidate).some(m=>m.id===firstId));
 secondId=hub.store.personal.decide(profile,"",proposal.id,"update");
 assert.equal(hub.store.personal.get(profile,"",firstId).status,"superseded");assert.equal(hub.store.personal.get(profile,"",secondId).status,"active");
 return {answer:answer.text,activeId:secondId,oldStatus:"superseded"};
});
await step("backendDoesNotReplaceWeb",async()=>{
 await chat("Теперь я предпочитаю Rust для нового backend.");
 const proposal=hub.store.personal.proposals(profile,"").find(p=>p.candidate.content.includes("Rust"));assert.ok(proposal);
 assert.equal(hub.store.personal.conflicts(profile,"",proposal.candidate).length,0);
 hub.store.personal.decide(profile,"",proposal.id,"remember");
 assert.equal(hub.store.personal.get(profile,"",secondId).status,"active");return {webPreferencePreserved:true};
});
const project="ORBIT-memory-acceptance";
await step("projectContinuityRestart",async()=>{
 for(const [type,content] of [["project","ORBIT completed release v0.7.1."],["decision","ORBIT next stage is v0.8 Personal Memory 2.0."],["project","ORBIT blocker: Windows Application Control blocks desktop build."],["task","ORBIT next task: test Memory 2.0 with local Ollama."]])
 hub.store.personal.save(profile,project,Candidate.parse({type,content,scope:"project"}));
 await hub.shutdown();start();profile=hub.store.profile(profile.id);
 const answer=await chat("Продолжим ORBIT.",project);evidence.projectResult=answer;await save();
 assert.match(answer.text,/Memory|памят/i);assert.match(answer.text,/Windows|Application Control/i);assert.ok(answer.intelligence.memoryUsed.length>=3);return answer;
});
await step("isolation",async()=>{
 const nova=createProfile("NOVA");nova.providerId="cosmo-local";nova.modelId="gemma3:4b";nova.maxTokens=250;nova.intelligence.web="off";hub.store.saveProfile(nova);
 const answer=await chat("Какой язык я предпочитаю для веб-проектов?","",nova.id);assert.equal(answer.intelligence.memoryUsed.length,0);return {answer:answer.text,privateMemoryTransferred:false};
});
await step("forgetRestart",async()=>{
 hub.store.personal.forget(profile,"",secondId);await hub.shutdown();start();profile=hub.store.profile(profile.id);
 const answer=await chat("Какой язык я предпочитаю для веб-проектов?");
 assert.ok(!answer.intelligence.memoryUsed.some(m=>m.id===secondId||m.id===firstId));return {answer:answer.text,used:answer.intelligence.memoryUsed,forgottenId:secondId};
});
await step("noiseAndSecrets",async()=>{
 const before=hub.store.personal.proposals(profile,"").length;
 await chat("Привет");await chat("Сегодня идёт дождь.");await chat("Какой язык я предпочитаю?");
 assert.equal(hub.store.personal.proposals(profile,"").length,before);
 // No secret is sent to the model or written into evidence.
 const {detectMemory}=await import("../dist/packages/core/src/desktop/personal-memory.js");
 assert.equal(detectMemory("Remember api_key=synthetic-test-value",""),null);
 return {noiseProposals:0,secretExcluded:true};
});
await step("transparency",async()=>{
 const records=hub.store.personal.rows(profile,project);assert.ok(records.every(r=>r.type&&r.scope&&r.source&&r.at));return {records:records.map(r=>({id:r.id,type:r.type,scope:r.scope,source:r.source,created:r.at,status:r.status,useCount:r.use_count}))};
});
await step("automaticCategoryPolicy",async()=>{
 const automatic=createProfile("Automatic test");automatic.providerId="cosmo-local";automatic.modelId="gemma3:4b";automatic.maxTokens=200;automatic.memory.suggestions=false;automatic.memory.automatic=["preference"];automatic.intelligence.web="off";hub.store.saveProfile(automatic);
 await chat("I prefer Python for backend work.","",automatic.id);
 const records=hub.store.personal.rows(automatic,"");assert.equal(records.length,1);assert.equal(records[0].type,"preference");assert.equal(hub.store.personal.proposals(automatic,"").length,0);
 await chat("My goal is to learn astronomy.","",automatic.id);
 assert.equal(hub.store.personal.rows(automatic,"").length,1);assert.equal(hub.store.personal.proposals(automatic,"").length,0);
 return {preferencesAutoSaved:true,otherCategoriesExcluded:true,suggestionsDisabled:true};
});
await hub.shutdown();evidence.completed=true;await save();
if(Object.values(evidence.steps).some(s=>s.status==="FAIL"))process.exitCode=1;
