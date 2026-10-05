import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { AIHub } from "../dist/packages/core/src/desktop/ai-hub.js";
const base=path.resolve(".desktop-cache","knowledge-folder-"+Date.now()),folder=path.join(base,"ORBIT");
await fs.mkdir(folder,{recursive:true});
const source=await fs.readFile("packages/core/src/ai/intelligence.ts","utf8"),start=source.indexOf("export function chooseModel("),end=source.indexOf("\nexport ",start+1);
assert.ok(start>=0&&end>start);
await fs.writeFile(path.join(folder,"intelligence.ts"),source.slice(start,end));
await fs.writeFile(path.join(folder,"architecture.md"),"# Smart Brain\nSmart Brain selects a suitable model using chooseModel in intelligence.ts. It filters required capabilities and Local Only, then prefers a model tier for the selected mode: fast, balanced or reasoning.\n# Controlled marker\nFOLDER_CURRENT_VALUE = OLD_VALUE_09");
const hub=new AIHub(path.join(base,"state"),()=>{});hub.configure([{id:"cosmo-local",name:"Ollama",type:"local",endpoint:"http://127.0.0.1:11434/v1/",localInferenceConfirmed:true,remoteAcknowledged:false}],{});
const profile=hub.profile();profile.providerId="cosmo-local";profile.modelId="gemma3:4b";profile.maxTokens=500;profile.intelligence.web="off";hub.store.saveProfile(profile);hub.store.setPreference("localOnly","true");
const space=hub.knowledge.spaces.create(profile.id,{name:"ORBIT source acceptance",project:folder});
const index=async()=>{hub.knowledge.ingest(profile.id,[folder],{},[space.id]);while(hub.knowledge.busy())await new Promise(r=>setTimeout(r,20));assert.equal(hub.knowledge.status().errors.length,0);};
try{
 await index();const before=hub.knowledge.list(profile.id),code=before.find(s=>s.name==="intelligence.ts");
 hub.chat({profileId:profile.id,request:"Где реализован Smart Brain и как он работает? Используй код и документацию проекта."},folder);while(hub.busy())await new Promise(r=>setTimeout(r,60));
 const answer=hub.chatStatus();assert.equal(answer.error,undefined);assert.match(answer.text,/chooseModel|intelligence\.ts/);assert.ok(answer.knowledge.sources.some(s=>s.name==="intelligence.ts"));assert.ok(answer.knowledge.sources.some(s=>s.name==="architecture.md"));
 const content=await fs.readFile(path.join(folder,"architecture.md"),"utf8");await fs.writeFile(path.join(folder,"architecture.md"),content.replace("OLD_VALUE_09","NEW_VALUE_09"));await index();
 const after=hub.knowledge.list(profile.id);assert.equal(after.find(s=>s.id===code.id).updated,code.updated);assert.equal(hub.knowledge.status().unchanged,1);
 assert.equal((await hub.knowledge.retrieve(profile.id,"OLD_VALUE_09")).sources.length,0);assert.ok((await hub.knowledge.retrieve(profile.id,"NEW_VALUE_09")).sources.length);
 await fs.writeFile("validation/knowledge-folder-acceptance.json",JSON.stringify({status:"PASS",mode:"Real core folder ingestion + real Ollama; native picker NOT VERIFIED",answer,indexing:hub.knowledge.status(),unrelatedSourceUnchanged:true,oldValueRemoved:true},null,2));console.log("Folder Smart Brain acceptance: PASS");
}finally{await hub.shutdown();}
