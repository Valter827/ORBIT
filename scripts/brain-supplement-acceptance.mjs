import fs from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { freemem } from 'node:os';
const models=['gemma3:4b','qwen3.5:9b-q4_K_M','ministral-3:8b','deepseek-r1:8b'];
const root='validation/brain-supplement-0101'; await fs.mkdir(root,{recursive:true});
const cases=[
 ...[['JavaScript','function sum_even(values)'],['TypeScript','function sum_even(values: number[]): number'],['Python','def sum_even(values):'],['Rust','fn sum_even(values: &[i64]) -> i64']].map(([language,signature])=>({id:'code-'+language,category:'generated coding',language,prompt:`Write ${language} code. Implement exactly ${signature}. Return the sum of EVEN integers in the input, including negative even values and zero. Empty input returns 0. Do not modify the input. Output only the complete function, without Markdown, examples, imports, main, I/O, unsafe code, dependencies or explanation. Use a simple loop and arithmetic. No helper functions.`})),
 {id:'natural-en',category:'english',prompt:'In natural English, write a three-sentence update using only these facts: the draft was submitted Tuesday; review is scheduled Friday; no decision has been made. Do not invent approval or a result.'},
 {id:'natural-ru',category:'russian',prompt:'Напиши естественное обновление статуса на русском в трёх предложениях, используя только факты: черновик отправлен во вторник; проверка назначена на пятницу; решение ещё не принято. Не придумывай одобрение или результат.'},
 {id:'natural-uk',category:'ukrainian',prompt:'Напиши природне оновлення статусу українською у трьох реченнях, використовуючи лише факти: чернетку надіслано у вівторок; перевірку заплановано на п’ятницю; рішення ще не ухвалено. Не вигадуй схвалення або результат.'},
 {id:'public-web',category:'public evidence',prompt:'Use only this source snapshot, paraphrased from NASA Mars Facts, retrieved 2026-10-09: Mars has two moons, Phobos and Deimos. Source URL: https://science.nasa.gov/mars/facts/ . Question: Name both moons and cite the supplied URL. A third moon name is not supplied; do not invent one.'},
 {id:'vision-shape',category:'vision',image:true,prompt:'Look at the image. What shape is blue? Reply with only the shape name.'},
 {id:'vision-count',category:'vision',image:true,prompt:'Look at the image. How many colored shapes are present? Reply with only the number.'},
];
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,sum]);}
const head=Buffer.alloc(13);head.writeUInt32BE(128,0);head.writeUInt32BE(128,4);head[8]=8;head[9]=2;const pixels=Buffer.alloc(128*385,255);
for(let y=0;y<128;y++){pixels[y*385]=0;for(let x=0;x<128;x++){const color=x>=12&&x<=51&&y>=44&&y<=83?[255,0,0]:(x-94)**2+(y-64)**2<=400?[0,0,255]:[255,255,255];for(let c=0;c<3;c++)pixels[y*385+1+x*3+c]=color[c];}}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]); await fs.writeFile(root+'/visual-input.png',png);
await fs.writeFile(root+'/suite.json',JSON.stringify({suite:'orbit-brain-supplement-0.10.1-1',configuration:{temperature:0,num_ctx:4096,num_predict:1024,thinking:'runtime default',timeoutMs:120000},cases},null,2));
const inventory=await (await fetch('http://127.0.0.1:11434/api/tags')).json();
for(const model of models){
 const item=inventory.models.find(m=>m.name===model);if(!item)throw Error('Missing '+model);
 const show=await (await fetch('http://127.0.0.1:11434/api/show',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model})})).json();
 let result={model,digest:item.digest,suite:'orbit-brain-supplement-0.10.1-1',started:new Date().toISOString(),cases:[],complete:false};
 const file=root+'/'+model.replaceAll(':','-')+'.json';const save=()=>fs.writeFile(file,JSON.stringify(result,null,2)); try { const previous=JSON.parse(await fs.readFile(file,'utf8')); if(previous.digest!==item.digest || previous.suite!==result.suite)throw Error('Saved supplement identity changed'); result=previous; } catch(e) { if(e.code!=='ENOENT')throw e; } if(result.complete){console.log(model+' already complete');continue;} await save();
 for(const c of cases){
  if(result.cases.some(r=>r.id===c.id))continue;
  console.log(model+' '+c.id);const started=performance.now();let row={id:c.id,category:c.category};
  if(c.image&&!show.capabilities?.includes('vision'))row={...row,status:'UNSUPPORTED',reason:'Runtime metadata does not declare vision'};
  else try{
   const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,stream:false,messages:[{role:'system',content:'Follow the user instruction precisely. Return final output only.'},{role:'user',content:c.prompt,...(c.image?{images:[png.toString('base64')]}:{})}],options:{temperature:0,num_ctx:4096,num_predict:1024},keep_alive:'5m'}),signal:AbortSignal.timeout(120000)});
   const r=await response.json();if(!response.ok||r.error)throw Error(String(r.error??('HTTP '+response.status)));
   const text=String(r.message?.content??'');row={...row,status:text?'GENERATED':'FAIL',reason:text?undefined:'No final answer within fixed budget',response:text,doneReason:r.done_reason,outputTokens:r.eval_count,decodeTokensPerSecond:r.eval_duration?r.eval_count/(r.eval_duration/1e9):null,elapsedMs:performance.now()-started,hostFreeRamBytes:freemem()};
   if(c.image&&text)row.status=(c.id==='vision-shape'?/\bcircle\b/i.test(text):/^2[.!]?$/.test(text.trim()))?'PASS':'FAIL';
   if(c.id==='public-web'&&text)row.status=/Phobos/i.test(text)&&/Deimos/i.test(text)&&text.includes('https://science.nasa.gov/mars/facts/')?'PASS':'FAIL';
  }catch(e){const reason=String(e);row={...row,status:/timeout|timed out/i.test(reason)?'TIMEOUT':/out of memory|\boom\b|unable to allocate/i.test(reason)?'OOM':/not support|unsupported/i.test(reason)?'UNSUPPORTED':'FAIL',reason,elapsedMs:performance.now()-started};}
  result.cases.push(row);await save();console.log(row.status);
 }
 result.complete=true;result.ended=new Date().toISOString();await save();
}
