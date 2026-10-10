import fs from 'node:fs/promises';
import {brainOutcome} from '../dist/packages/core/src/ai/brain-outcomes.js';
const rows=[];
for(const model of ['gemma3:4b','qwen3.5:9b-q4_K_M','ministral-3:8b','deepseek-r1:8b']){
 const e=JSON.parse(await fs.readFile('validation/brain-eval-0101-'+model.replaceAll(':','-')+'.json','utf8'));const r=e.steps.benchmark.result;
 const outcomes=Object.fromEntries(['PASS','FAIL','TIMEOUT','OOM','UNSUPPORTED'].map(s=>[s,r.cases.filter(c=>brainOutcome(c)===s).length]));
 const performance=r.metadata.performance;
 const row={model,digest:r.metadata.digest,completed:r.status==='COMPLETE'&&r.cases.length===106,status:r.status,total:r.cases.length,outcomes,categories:r.metadata.categoryScores,coreScore:r.metadata.coreScore,capabilities:r.capabilities,performance,memory:e.steps.memoryPipeline,knowledge:e.steps.knowledgePipeline,history:e.steps.historyAndResultsRestart,hardware:r.hardware};
 rows.push(row);
 console.log(JSON.stringify({...row,memory:{status:row.memory.status,retrieved:row.memory.retrieved,inserted:row.memory.inserted,finalFacts:row.memory.finalFacts},knowledge:{status:row.knowledge.status,adherence:row.knowledge.modelAdherence},hardware:undefined},null,2));
}
await fs.writeFile('validation/main-comparison-complete.json',JSON.stringify(rows,null,2));
