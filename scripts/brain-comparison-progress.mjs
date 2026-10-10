import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { BRAIN_EVAL_SUITE } from '../dist/packages/core/src/ai/brain-eval.js';
const names=['gemma3:4b','qwen3.5:9b-q4_K_M','ministral-3:8b','deepseek-r1:8b'];
const live=[];
for(const dir of await fs.readdir('.desktop-cache')){
 if(!dir.startsWith('model-studio-acceptance-'))continue;
 let db;try{db=new DatabaseSync(`.desktop-cache/${dir}/database/ai.sqlite`,{readOnly:true});for(const row of db.prepare('SELECT payload FROM model_evaluations').all()){const r=JSON.parse(row.payload);if(names.includes(r.model) && r.suite === BRAIN_EVAL_SUITE)live.push(r);}}catch{}finally{db?.close();}
}
const rows=[];
for(const model of names){
 let e;try{e=JSON.parse(await fs.readFile('validation/brain-eval-0101-'+model.replaceAll(':','-')+'.json','utf8'));}catch{}
 const latest=live.filter(r=>r.model===model).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
 const r=e?.steps?.benchmark?.result;
 const completed=r?.status==='COMPLETE' && r.suite === BRAIN_EVAL_SUITE && (!latest || Date.parse(latest.at) <= Date.parse(r.at));
 rows.push({model,status:completed?'COMPLETE':latest?.status??'NOT TESTED',recordedCases:completed?r.cases.length:latest?.cases.length??0,quality:completed?`${r.cases.filter(c=>c.passed).length}/${r.cases.length}`:'NOT FINAL',suite:completed?r.suite:latest?.suite??null,capabilities:completed?r.capabilities:null,memory:e?.steps?.memoryPipeline?.finalCompleteness??'NOT TESTED',knowledge:e?.steps?.knowledgePipeline?.modelAdherence??'NOT TESTED',history:e?.steps?.historyAndResultsRestart?.status??'NOT TESTED'});
}
const result={at:new Date().toISOString(),release:'IN PROGRESS',winner:'NOT SELECTED',note:'Partial cases are progress only. Short capability probes are not Agent acceptance. Synthetic benchmark checks are not general quality guarantees.',models:rows};
await fs.writeFile('validation/brain-comparison-progress.json',JSON.stringify(result,null,2));
const markdown=['# ORBIT 0.10.1 — comparison in progress','',result.note,'','| Model | Execution | Cases recorded | Completed quality checks | Memory final facts | Knowledge | History |','|---|---|---:|---|---|---|---|',...rows.map(r=>`| ${r.model} | ${r.status} | ${r.recordedCases} | ${r.quality} | ${r.memory} | ${r.knowledge} | ${r.history} |`),'','Winner: NOT SELECTED. Windows 0.10.1 installer: NOT PRODUCED.','',`Updated: ${result.at}`,''].join('\n');
await fs.writeFile('validation/BRAIN-COMPARISON-IN-PROGRESS.md',markdown);console.log(markdown);
