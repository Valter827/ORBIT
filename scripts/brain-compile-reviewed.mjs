import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=path.resolve('validation/brain-supplement-0101');
const reviewed=JSON.parse(await fs.readFile(path.join(root,'reviewed-code.json'),'utf8'));
const tests=[[],[1,3,5],[2,4,6],[-5,-4,-3,-2,-1],[0,0,0],[1,2,-4,7,8],[-2147483648,2147483646],Array.from({length:33},(_,i)=>i-16)];
const expected=tests.map(a=>a.filter(x=>x%2===0).reduce((a,b)=>a+b,0));
const python=process.env.ORBIT_EVAL_PYTHON;
const rustc=process.env.ORBIT_EVAL_RUSTC;
const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP};
const results=[];let rustExecutionBlocked=false;
for(const entry of reviewed){
 const file=JSON.parse(await fs.readFile(path.join(root,entry.model.replaceAll(':','-')+'.json'),'utf8'));
 const c=file.cases.find(c=>c.id==='code-'+entry.language);const code=(c?.response??'').trim().replace(/^```[^\n]*\n/,'').replace(/\n```$/,'');
 const sha=createHash('sha256').update(code).digest('hex');
 if(sha!==entry.sha256||entry.review!=='pure arithmetic function')throw Error('Code not reviewed: '+entry.model+' '+entry.language);
 const directory=path.join(root,'compiled',entry.model.replaceAll(':','-'),entry.language);await fs.mkdir(directory,{recursive:true});
 const record={model:entry.model,language:entry.language,sha256:sha,compilation:'NOT TESTED',execution:'NOT TESTED',passed:0,total:tests.length};
 const run=(binary,args,timeout=10000)=>spawnSync(binary,args,{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});
 let execution;
 if(entry.language==='JavaScript'||entry.language==='TypeScript'){
  const ext=entry.language==='TypeScript'?'ts':'mjs';const src=path.join(directory,'generated.'+ext);await fs.writeFile(src,code);
  if(ext==='ts'){
   const program=ts.createProgram([src],{noEmit:true,strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,types:[],skipLibCheck:true});
   const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
   if(errors.length){record.compilation='FAIL';record.reason=errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n');results.push(record);continue;}
  }
  const js=ext==='ts'?ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText:code;
  const runner=path.join(directory,'runner.mjs');await fs.writeFile(runner,js+'\nconst cases='+JSON.stringify(tests)+';const expected='+JSON.stringify(expected)+';let passed=0;for(let i=0;i<cases.length;i++){const before=JSON.stringify(cases[i]);if(sum_even(cases[i])===expected[i]&&JSON.stringify(cases[i])===before)passed++;}console.log(JSON.stringify({passed,total:cases.length}));');
  const syntax=run(process.execPath,['--check',runner]);record.compilation=syntax.status===0?'PASS':'FAIL';
  if(syntax.status!==0)record.reason=syntax.stderr;else execution=run(process.execPath,['--permission','--allow-fs-read='+runner,'--disable-proto=throw',runner],5000);
 }else if(entry.language==='Python'){
  if(!python){record.compilation='UNSUPPORTED';record.reason='Python interpreter unavailable';}
  else{const source=path.join(directory,'generated.py');await fs.writeFile(source,code);
   const runner=path.join(directory,'runner.py');await fs.writeFile(runner,'import json\n'+code+'\ncases='+JSON.stringify(tests)+'\nexpected='+JSON.stringify(expected)+'\npassed=0\nfor i, values in enumerate(cases):\n before=list(values)\n if sum_even(values)==expected[i] and values==before: passed+=1\nprint(json.dumps({"passed":passed,"total":len(cases)}))\n');
   const compile=run(python,['-I','-S','-m','py_compile',source]);record.compilation=compile.status===0?'PASS':'FAIL';if(compile.status!==0)record.reason=compile.stderr;else execution=run(python,['-I','-S',runner],5000);
  }
 }else if(entry.language==='Rust'){
  if(!rustc){record.compilation='UNSUPPORTED';record.reason='Rust compiler unavailable';}
  else{const source=path.join(directory,'generated.rs');const checks=tests.map((a,i)=>`if sum_even(&[${a.map(n=>n+'i64').join(',')}]) == ${expected[i]}i64 { passed += 1; }`).join('\n');await fs.writeFile(source,code+'\nfn main(){let mut passed=0;'+checks+'println!("{}",passed);}\n');
   const binary=path.join(directory,'generated-tests.exe');const compile=run(rustc,['--edition=2021',source,'-o',binary],60000);record.compilation=compile.status===0?'PASS':'FAIL';if(compile.status!==0)record.reason=compile.stderr||String(compile.error);else if(rustExecutionBlocked){record.execution='UNSUPPORTED';record.reason='Windows execution policy blocked the first generated Rust test; no bypass attempted';}else{execution=run(binary,[],5000);if(execution.error&&/blocked|policy|permission|EACCES|EPERM|577|1260/i.test(String(execution.error))){rustExecutionBlocked=true;record.execution='UNSUPPORTED';record.reason=String(execution.error);execution=undefined;}}
  }
 }
 if(execution){if(execution.error){record.execution=execution.error.code==='ETIMEDOUT'?'TIMEOUT':'FAIL';record.reason=String(execution.error);}else if(execution.status!==0){record.execution='FAIL';record.reason=execution.stderr;}else{try{const parsed=JSON.parse(execution.stdout.trim());const value=typeof parsed==="number"?{passed:parsed,total:tests.length}:parsed;record.passed=value.passed;record.execution=value.passed===tests.length?'PASS':'FAIL';}catch{record.execution='FAIL';record.reason='Invalid test harness output';}}}
 results.push(record);await fs.writeFile(path.join(root,'compiled-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(record));
}
await fs.writeFile(path.join(root,'compiled-results.json'),JSON.stringify(results,null,2));
