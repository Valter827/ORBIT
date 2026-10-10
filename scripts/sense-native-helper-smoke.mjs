import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { startSenseFixture } from "./sense-fixture.mjs";
import { sanitizeSense } from "../dist/packages/core/src/sense/session.js";
const ps=path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
const helper=await fs.readFile("src-tauri/src/sense-helper.ps1","utf8");
async function run(input) {
 const child=spawn(ps,["-NoProfile","-NonInteractive","-Command",helper],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let out=""; child.stdout.on("data",c=>{out+=c;});child.stderr.resume();
 child.stdin.end(JSON.stringify(input)+"\n");
 const timer=setTimeout(()=>child.kill(),25000);
 try { const code=await new Promise(resolve=>child.once("exit",resolve));assert.equal(code,0,"Native helper failed");return JSON.parse(out); }
 finally {clearTimeout(timer);}
}
const evidence={liveAI:"NOT VERIFIED",mode:"real Windows fixture windows"};
for(const mode of ["normal","ocr","protected"]){
 const fixture=startSenseFixture(mode);
 try {
  let target;
  for(let attempt=0;attempt<8&&!target;attempt++){
    await new Promise(r=>setTimeout(r,800));
    const choices=await run({action:"windows"});
    target=choices.windows.find(w=>w.title==="ORBIT Sense acceptance fixture" && w.processId===fixture.pid);
  }
  assert.ok(target,"Fixture not visible; mode="+mode+"; exit="+fixture.exitCode);
  const result=sanitizeSense(await run({action:"capture",scope:"current-window",target,snapshot:mode!=="ocr"}));
  if(mode==="normal"){
   assert.match(result.visibleText,/capital of Canada/);
   assert.ok(result.nodes.some(n=>n.name==="Continue"));
   assert.ok(result.image);
   evidence.accessibilityExtraction="PASS";evidence.controlRoles="PASS";evidence.ephemeralSnapshot="PASS";
  }
  if(mode==="ocr"){
   assert.ok(result.visibleText.length<80,"Fixture must require OCR fallback");
   assert.equal(result.ocrStatus,"available-confidence-unknown");
   assert.match(result.ocrText,/Canada|capital/i);
   evidence.ocrFallback="PASS";
  }
  if(mode==="protected"){
   if(!result.protectedCount)console.log("Protected fixture metadata:",JSON.stringify({roles:result.nodes.map(n=>n.role),complete:result.complete,containsSecret:JSON.stringify(result).includes("fixture-only-password")}));
   assert.ok(result.protectedCount>0);
   assert.equal(result.image,null);
   assert.doesNotMatch(JSON.stringify(result),/fixture-only-password/);
   evidence.protectedControls="PASS";
  }
 }finally{fixture.kill();await new Promise(r=>fixture.once("exit",r));}
}
await fs.writeFile("validation/sense-native-helper-v06.json",JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
