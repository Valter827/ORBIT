// Optional browser acceptance check. Uses a fixture provider, never claims live AI verification.
// ORBIT_PLAYWRIGHT_MODULE may point to an installed playwright index.mjs.
// ORBIT_CHROME may select an existing Chrome executable.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createOrbitServer } from "../dist/packages/core/src/server.js";
const spec=process.env.ORBIT_PLAYWRIGHT_MODULE;
const {chromium}=await import(spec?pathToFileURL(spec).href:"playwright");
const base=await fs.mkdtemp(path.join(os.tmpdir(),"orbit-ui-acceptance-"));
const root=path.join(base,"workspace");
await fs.cp(path.resolve("demos/failing-add"),root,{recursive:true});
let calls=0;
const provider={
 id:"anthropic",isConfigured:async()=>true,
 models:()=>[{provider:"anthropic",model:"UI-TEST-FIXTURE",contextWindow:200000,inputCostPerMTok:0,outputCostPerMTok:0,tier:"balanced",supportsTools:true,local:false}],
 complete:async()=>{
  calls++;
  const steps=[
    {text:"Run tests, read math.js, propose a fix and verify."},
    {tool:"TerminalTool.run",args:{command:"npm test"}},
    {tool:"FileTool.read",args:{path:"src/math.js"}},
    {tool:"FileTool.write",args:{path:"src/math.js",content:"export function add(a, b) {\n  return a + b;\n}\n"}},
    {tool:"TerminalTool.run",args:{command:"npm test"}},
    {text:"The arithmetic fix is ready for independent verification."}
  ];
  const step=steps[Math.min(calls-1,steps.length-1)];
  return {text:step.text??"",toolCalls:step.tool?[{toolCallId:"ui-fixture-"+calls,toolName:step.tool,arguments:step.args}]:[],usage:{inputTokens:1,outputTokens:1},model:"UI-TEST-FIXTURE"};
 }
};
const server=await createOrbitServer({workspace:root,stateDirectory:path.join(base,"state"),uiDirectory:process.cwd(),provider});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true,...(process.env.ORBIT_CHROME?{executablePath:process.env.ORBIT_CHROME}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:"+server.address().port,{waitUntil:"networkidle"});
 await page.getByText("Ready",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Ask ORBIT",exact:true}).click();
 const end=Date.now()+20000;let approvedPlan=0,approvedDiff=0,permissions=0;
 while(Date.now()<end){
  const status=await page.locator("#status").innerText();
  if(status.startsWith("Completed"))break;
  if(status.startsWith("Failed"))throw new Error(status);
  for(const [label,increment]of [
    ["Approve plan",()=>approvedPlan++],["Apply",()=>approvedDiff++],["Allow once",()=>permissions++]
  ]){
    const button=page.getByRole("button",{name:label,exact:true});
    if(await button.count()){await button.click();increment();}
  }
  await new Promise(r=>setTimeout(r,40));
 }
 assert.match(await page.locator("#status").innerText(),/^Completed/);
 assert.equal(approvedPlan,1);assert.equal(approvedDiff,1);assert.ok(permissions>=4);
 assert.match(await fs.readFile(path.join(root,"src/math.js"),"utf8"),/return a \+ b/);
 await page.screenshot({path:"ui-acceptance.png",fullPage:false});
 await page.getByText("Undo changes",{exact:true}).click();
 await page.getByRole("button",{name:"Undo Task",exact:true}).click();
 await page.getByText("Undo restored the original files.",{exact:true}).waitFor();
 assert.match(await fs.readFile(path.join(root,"src/math.js"),"utf8"),/return a - b/);
 calls=0;
 await page.getByRole("button",{name:"Ask ORBIT",exact:true}).click();
 await page.getByRole("button",{name:"Approve plan",exact:true}).click();
 await page.getByRole("button",{name:"Allow once",exact:true}).waitFor();
 await page.getByRole("button",{name:"Stop Agent",exact:true}).click();
 await page.getByText("Cancelled:",{exact:false}).first().waitFor();
 assert.match(await fs.readFile(path.join(root,"src/math.js"),"utf8"),/return a - b/);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:"PASS",provider:"fixture, not live AI",approvedPlan,approvedDiff,permissions,providerCalls:calls,pageErrors:errors,undo:"PASS",stopBeforeExecution:"PASS"}));
}finally{
 await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
 assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));
 assert.ok(path.basename(base).startsWith("orbit-ui-acceptance-"));
 await fs.rm(base,{recursive:true,force:true});
}
