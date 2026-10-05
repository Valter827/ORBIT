import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {AIHub} from "../dist/packages/core/src/desktop/ai-hub.js";
import {LocalEmbeddings} from "../dist/packages/core/src/desktop/knowledge.js";
import {createProfile} from "../dist/packages/core/src/ai/profiles.js";
const base=path.resolve(".desktop-cache","knowledge-real-"+Date.now()),out="validation/knowledge-real-acceptance.json";
const evidence={version:"0.9.1",date:new Date().toISOString(),model:"gemma3:4b",steps:{}};
const save=()=>fs.writeFile(out,JSON.stringify(evidence,null,2));
const step=async(name,fn)=>{try{evidence.steps[name]={status:"PASS",...await fn()};}catch(e){evidence.steps[name]={status:"FAIL",error:String(e)};}await save();console.log(name+": "+evidence.steps[name].status);};
let hub;const start=()=>{hub=new AIHub(base,()=>{});hub.configure([{id:"cosmo-local",name:"Ollama",type:"local",endpoint:"http://127.0.0.1:11434/v1/",localInferenceConfirmed:true,remoteAcknowledged:false}],{});hub.store.setPreference("localOnly","true");};
start();let profile=hub.profile();profile.providerId="cosmo-local";profile.modelId="gemma3:4b";profile.maxTokens=500;profile.intelligence.web="off";hub.store.saveProfile(profile);
const chat=async request=>{hub.chat({profileId:profile.id,request},"ORBIT-controlled-knowledge");while(hub.busy())await new Promise(r=>setTimeout(r,60));const result=hub.chatStatus();assert.equal(result.error,undefined);return result;};
evidence.runtime=await fetch("http://127.0.0.1:11434/api/tags").then(r=>r.json());
const space=hub.knowledge.spaces.create(profile.id,{name:"ORBIT acceptance",project:"ORBIT-controlled-knowledge"});
const put=async(name,text)=>{const result=await hub.knowledge.put(profile.id,name,text);hub.knowledge.spaces.assign(profile.id,result.id,[space.id]);return result;};
let architecture,reason,code;
await step("uniqueFact",async()=>{
 architecture=await put("architecture.md","# Cobalt architecture\nORBIT_TEST_ARCHITECTURE_09: The cobalt module uses the Helios queue.");
 const result=await chat("According to architecture.md, which queue does the cobalt module use?");
 assert.match(result.text,/Helios/i);assert.ok(result.knowledge.sources.some(s=>s.sourceId===architecture.id&&s.text.includes("Helios")&&s.section==="Cobalt architecture"));return result;
});
await step("multiDocument",async()=>{
 reason=await put("queue-decision.md","# Helios selection\nThe Helios queue was selected for bounded background jobs in the cobalt module.");
 const result=await chat("According to the project documents, what queue does the cobalt module use and why was that queue selected?");
 assert.match(result.text,/Helios/);assert.match(result.text,/bounded|огранич/i);assert.ok(result.knowledge.sources.some(s=>s.sourceId===architecture.id));assert.ok(result.knowledge.sources.some(s=>s.sourceId===reason.id));return result;
});
await step("codeLocation",async()=>{
 code=await put("src/risk.ts","// Controlled source\nexport function calculateOrbitRisk(value: number) {\n  return value * 7;\n}");
 const result=await chat("Where is function calculateOrbitRisk implemented in my source files?");
 const hit=result.knowledge.sources.find(s=>s.sourceId===code.id);assert.ok(hit);assert.equal(hit.symbol,"calculateOrbitRisk");assert.equal(hit.lineStart,2);assert.match(result.text,/risk\.ts|calculateOrbitRisk/);return result;
});
await step("duplicateRerank",async()=>{
 await put("copy-architecture.md","# Cobalt architecture\nORBIT_TEST_ARCHITECTURE_09: The cobalt module uses the Helios queue.");
 await put("distractor.md","# Cobalt paint\nThe cobalt paint color is blue. This document does not describe any software queue.");
 const result=await hub.knowledge.retrieve(profile.id,"cobalt module Helios queue",undefined,{project:"ORBIT-controlled-knowledge"});
 assert.equal(result.sources.filter(s=>s.text.includes("ORBIT_TEST_ARCHITECTURE_09")).length,1);assert.notEqual(result.sources[0].name,"distractor.md");return result;
});
await step("incrementalDelete",async()=>{
 const before=await put("changing.md","# Current value\nControlledSourceValue = OLD_VALUE_09");
 await put("changing.md","# Current value\nControlledSourceValue = NEW_VALUE_09");
 assert.equal((await hub.knowledge.retrieve(profile.id,"OLD_VALUE_09")).sources.length,0);
 assert.ok((await hub.knowledge.retrieve(profile.id,"NEW_VALUE_09")).sources.some(s=>s.sourceId===before.id));
 hub.knowledge.remove(profile.id,before.id);assert.equal((await hub.knowledge.retrieve(profile.id,"NEW_VALUE_09")).sources.length,0);return {oldRemoved:true,newIndexed:true,deleteRemoved:true};
});
await step("isolation",async()=>{
 const other=createProfile("STUDY acceptance");hub.store.saveProfile(other);assert.equal((await hub.knowledge.retrieve(other.id,"Helios")).sources.length,0);assert.throws(()=>hub.knowledge.preview(other.id,architecture.id));return {crossProfileBlocked:true};
});
await step("restart",async()=>{
 await hub.shutdown();start();profile=hub.store.profile(profile.id);
 const result=await chat("What queue is specified for the cobalt module in architecture.md?");assert.match(result.text,/Helios/);assert.ok(result.knowledge.sources.some(s=>s.sourceId===architecture.id));return result;
});
await step("conflictingDocuments",async()=>{
 await put("database-old.md","# Storage decision\nThe project database is PostgreSQL.");
 await put("database-new.md","# Storage decision\nThe project database is SQLite.");
 const result=await chat("According to database-old.md and database-new.md, what is the project database? Explain any disagreement.");
 assert.match(result.text,/PostgreSQL/);assert.match(result.text,/SQLite/);assert.match(result.text,/disagree|conflict|contradict|differ|противореч|расхожд/i);return result;
});
await step("realEmbeddings",async()=>{
 assert.ok(evidence.runtime.models.some(m=>m.name==="embeddinggemma:300m"),"Approved embedding model must be installed");
 const backend=new LocalEmbeddings("http://127.0.0.1:11434/v1/","embeddinggemma:300m");hub.knowledge.setEmbedding(backend);
 const source=await put("astronomy-note.md","# Celestial observation\nAstronomers observe distant stars using optical telescopes after sunset.");
 const result=await hub.knowledge.retrieve(profile.id,"Which instruments help scientists examine luminous objects in the night sky?");
 evidence.embeddingAttempt=result;await save();assert.equal(result.strategy,"hybrid");assert.ok(result.sources.some(s=>s.sourceId===source.id));return {model:"embeddinggemma:300m",...result};
});
await hub.shutdown();evidence.completed=true;await save();if(Object.values(evidence.steps).some(s=>s.status==="FAIL"))process.exitCode=1;
