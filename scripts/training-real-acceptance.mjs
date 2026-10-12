import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {cosmoDataset} from '../dist/packages/core/src/training/dataset-v1.js';
import {validateDataset,scoreAnswer,hash} from '../dist/packages/core/src/training/dataset.js';
import {TrainingConfigSchema,HELDOUT_VERSION,DATASET_VERSION} from '../dist/packages/core/src/training/types.js';
import {compareEvaluations} from '../dist/packages/core/src/training/evaluation.js';
import {baselineCases} from '../dist/packages/core/src/ai/model-studio.js';
const home='D:/Orbit/AI', python=home+'/Training/venv-0102/Scripts/python.exe', base=home+'/Models/gemma-3-4b-it-093f9f3';
const id='cosmo-pilot-'+new Date().toISOString().replaceAll(/[^0-9]/g,'')+'-'+crypto.randomUUID().slice(0,8);
const root=home+'/Training/'+id, adapter=home+'/Adapters/'+id;
fs.mkdirSync(root);fs.mkdirSync(adapter);
const write=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2));
const config=TrainingConfigSchema.parse({base:'google/gemma-3-4b-it',revision:'093f9f388b31de276ce2de164bdc2081324b9767'});
const dataset=validateDataset(cosmoDataset,baselineCases.map(x=>x.prompt));if(!dataset.valid)throw Error('Dataset leak gate failed');
const manifest=JSON.parse(fs.readFileSync(base+'/.orbit-base.json','utf8'));if(manifest.revision!==config.revision||manifest.model!==config.base)throw Error('Pinned identity mismatch');
for(const file of manifest.files){const target=path.resolve(base,file.path);if(!target.startsWith(path.resolve(base)+path.sep))throw Error('Manifest path invalid');const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(target))digest.update(chunk);if(digest.digest('hex')!==file.sha256)throw Error('Base digest mismatch: '+file.path);}
const baseHash=hash(manifest.files), configHash=hash(config), datasetHash=dataset.hash;
write('experiment.json',{id,base:config.base,revision:config.revision,config,configHash,datasetHash,baseHash,datasetVersion:DATASET_VERSION,created:new Date().toISOString(),promotion:'NOT ELIGIBLE: pipeline pilot'});
for(const split of ['train','validation'])write(split+'.json',cosmoDataset.filter(x=>x.split===split).map(x=>({messages:x.messages,answer:x.answer})));
const heldout=cosmoDataset.filter(x=>x.split==='test');write('eval-prompts.json',heldout.flatMap(x=>[0,1].map(repeat=>({id:x.id,repeat,messages:x.messages}))));
const worker=path.resolve('training/worker.py');
const environment={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:path.dirname(python),TEMP:home+'/TrainingCache',TMP:home+'/TrainingCache',HF_HOME:home+'/TrainingCache/offline-worker',HF_TOKEN_PATH:home+'/TrainingCache/offline-worker/no-token',HF_HUB_DISABLE_IMPLICIT_TOKEN:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',WANDB_DISABLED:'true',TOKENIZERS_PARALLELISM:'false',PYTHONUTF8:'1'};
let active;
process.on('SIGINT',()=>{fs.writeFileSync(root+'/cancel.request','cancel');active?.kill();});
async function phase(name,mode,useAdapter=false){
 write('config.json',{config,baseDirectory:base,adapterDirectory:adapter,baseHash,datasetHash,useAdapter});
 const stdout=fs.createWriteStream(root+'/'+name+'-events.jsonl'),stderr=fs.createWriteStream(root+'/'+name+'-warnings.log');
 const started=new Date().toISOString();console.log(JSON.stringify({phase:name,state:'STARTED',id,root}));
 const child=spawn(python,['-I',worker,'--config',root+'/config.json','--mode',mode],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:environment});active=child;
 child.stdout.pipe(stdout);child.stdout.on('data',b=>process.stdout.write(b));child.stderr.pipe(stderr);
 const timer=setTimeout(()=>child.kill(),2*60*60*1000);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(timer);active=null;
 write(name+'-process.json',{pid:child.pid,started,ended:new Date().toISOString(),exitCode:code});
 if(code!==0)throw Error(name+' worker failed; exit '+code);
 if(mode==='eval'){const result=JSON.parse(fs.readFileSync(root+'/evaluation-output.json','utf8'));if(!result.complete||result.results.length!==heldout.length*2)throw Error(name+' incomplete evaluation');write(name+'.json',result);return result;}
}
function scored(result){return {suite:HELDOUT_VERSION,datasetHash,baseHash,configHash:hash({temperature:0,maxTokens:512,seed:config.seed}),complete:result.complete,observations:result.results.map(row=>{const example=heldout.find(x=>x.id===row.id);if(!example)throw Error('Unknown held-out id');return {...row,category:example.category,passed:scoreAnswer(example,row.response)};})};}
try{
 await phase('hardware-fit','fit');
 const before=await phase('base-heldout-before','eval');write('base-heldout-before-scored.json',scored(before));
 await phase('pilot-training','train');const result=JSON.parse(fs.readFileSync(root+'/result.json','utf8'));if(result.optimizerSteps!==8||!result.complete||!result.adapterLoaded)throw Error('Incomplete real optimizer/adapter receipt');
 const after=await phase('adapter-heldout-after','eval',true);if(!after.results.some(x=>x.response.trim()))throw Error('Fresh adapter inference empty');write('adapter-heldout-after-scored.json',scored(after));
 const comparison=compareEvaluations(scored(before),scored(after));write('paired-comparison.json',comparison);
 write('acceptance.json',{pilot:'PASS',optimizerSteps:8,adapterSaved:true,freshProcessReload:'PASS',heldoutAfter:'PASS',alpha:'NOT CREATED',promotion:'NOT ELIGIBLE',comparison,training:result,root,adapter});console.log('REAL_PILOT_COMPLETE '+root);
}catch(error){write('acceptance.json',{pilot:'INCONCLUSIVE',error:String(error),alpha:'NOT CREATED',promotion:'NOT ELIGIBLE',root,adapter});console.error(String(error));process.exitCode=1;}
