import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {AIHub} from "../dist/packages/core/src/desktop/ai-hub.js";
import {KnowledgeLimits} from "../dist/packages/core/src/desktop/knowledge.js";
const base=path.resolve(".desktop-cache","knowledge-performance-"+Date.now()),hub=new AIHub(base,()=>{}),profile=hub.profile(),limits=KnowledgeLimits.parse({chunks:10000});
const started=performance.now(),rss=process.memoryUsage().rss;
for(let file=0;file<200;file++){
 const text=Array.from({length:50},(_,i)=>{const id=file*50+i;return `# Orbital calibration sector ${id}\nThe calibration code for sector ${id} is ORBIT_BENCH_${id}. Controlled performance corpus only.`;}).join("\n");
 await hub.knowledge.put(profile.id,`sector-${file}.md`,text,"","note",undefined,limits);
}
const indexingMs=performance.now()-started,count=hub.store.db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks").get().n;
assert.equal(count,10000);
const latency=[];let result;
for(let i=0;i<20;i++){const start=performance.now();result=await hub.knowledge.retrieve(profile.id,"ORBIT_BENCH_7349");latency.push(performance.now()-start);assert.ok(result.sources.some(s=>s.text.includes("ORBIT_BENCH_7349")));}
const evidence={version:"0.9.4",date:new Date().toISOString(),status:"PASS",corpus:"controlled generated data",chunks:count,documents:200,indexingMs,retrievalMs:latency,rssBefore:rss,rssAfter:process.memoryUsage().rss,diagnostics:result.diagnostics};
hub.store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");evidence.databaseBytes=(await fs.stat(path.join(base,"database","ai.sqlite"))).size;await hub.shutdown();
await fs.writeFile("validation/knowledge-performance.json",JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
