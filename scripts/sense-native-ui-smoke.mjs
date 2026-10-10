import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const ps=path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
let browser;
for(let attempt=0;attempt<30;attempt++){try{browser=await chromium.connectOverCDP("http://127.0.0.1:9227");break;}catch(error){if(attempt===29)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}
const fixture=spawn(ps,["-NoProfile","-NonInteractive","-Command","Add-Type -AssemblyName System.Windows.Forms,System.Drawing\n$f=New-Object Windows.Forms.Form\n$f.Text='ORBIT Sense acceptance fixture'\n$f.Size=New-Object Drawing.Size(680,400)\n$f.StartPosition='CenterScreen'\n$l=New-Object Windows.Forms.Label\n$l.Text='Question: What is the capital of Canada? Error: Cannot find module dotenv.'\n$l.Location=New-Object Drawing.Point(20,20)\n$l.Size=New-Object Drawing.Size(620,70)\n$f.Controls.Add($l)\n$b=New-Object Windows.Forms.Button\n$b.Text='Continue'\n$b.Location=New-Object Drawing.Point(450,250)\n$f.Controls.Add($b)\n$f.Add_Paint({param($sender,$e) $e.Graphics.DrawString('Visible OCR question: Canada capital?',(New-Object Drawing.Font('Arial',18)),[Drawing.Brushes]::Black,20,120)})\n[void]$f.ShowDialog()"],{windowsHide:false,stdio:"ignore"});

const page=browser.contexts()[0].pages().find(p=>p.url().includes("tauri.localhost"));
assert.ok(page,"Native Tauri window missing");
page.setDefaultTimeout(30000);
const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
const core=(method,params={})=>invoke("core_command",{method,params});
const original=await core("ai.state");
const desktop=await invoke("desktop_state");
assert.equal(desktop.version,JSON.parse(await fs.readFile("package.json","utf8")).version);
let testProfile;
try {
 testProfile=await core("ai.create");
 await core("ai.saveProfile",{...testProfile,name:"SENSE ACCEPTANCE",senseEnabled:false});
 await core("ai.select",{id:testProfile.id});
 await page.reload();
 const explore=page.getByRole("button",{name:"Explore ORBIT",exact:true});
 if(await explore.isVisible()) await explore.click();
 await page.getByRole("button",{name:"Sense",exact:true}).click();
 const onboarding=page.getByRole("button",{name:"Continue",exact:true});
 if(await onboarding.isVisible()) await onboarding.click();
 await page.getByLabel("Enable Sense for SENSE ACCEPTANCE",{exact:true}).click();
 await page.getByRole("button",{name:"Choose visible window / display",exact:true}).click();
 await page.locator(".sense-panel select").nth(1).selectOption({label:"powershell — ORBIT Sense acceptance fixture"});
 await page.getByRole("button",{name:"Share selected scope",exact:true}).click();
 await page.getByRole("button",{name:"Stop sharing",exact:true}).waitFor();
 assert.equal(await page.getByText("SENSE ACCEPTANCE can use this shared snapshot",{exact:false}).count(),1);
 await page.getByRole("button",{name:"Read shared window",exact:true}).click();
 await page.getByText("Last updated:",{exact:false}).waitFor();
 await page.getByText("Visible text and accessibility",{exact:false}).click();
 await page.getByText("capital of Canada",{exact:false}).first().waitFor();
 assert.equal(await page.getByRole("button",{name:"Ask SENSE ACCEPTANCE",exact:true}).isDisabled(),true);
 await page.getByLabel("I understand and allow this provider to receive this scope.",{exact:true}).check();
 if(!original.localOnly) assert.equal(await page.getByRole("button",{name:"Ask SENSE ACCEPTANCE",exact:true}).isEnabled(),true);
 await page.screenshot({path:"validation/sense-native-v06.png"});
 await page.getByRole("button",{name:"Stop sharing",exact:true}).click();
 assert.equal(await page.getByRole("button",{name:"Stop sharing",exact:true}).count(),0);
 await assert.rejects(invoke("sense_command",{action:"ask",params:{sessionId:0,question:"stale"}}),/Start sharing|changed/);
 await assert.rejects(invoke("sense_command",{action:"click",params:{}}),/Pilot|Unsupported/);
 await invoke("window_action",{action:"quick"});
 let quick;
 for(let n=0;n<40&&!quick;n++){quick=browser.contexts()[0].pages().find(p=>p.url().includes("quick=1"));if(!quick)await new Promise(r=>setTimeout(r,100));}
 assert.ok(quick,"Quick overlay did not open");
 await quick.getByLabel("Ask ORBIT",{exact:true}).fill("Explain this error.");
 await quick.screenshot({path:"validation/sense-quick-overlay-v06.png"});
 await quick.getByRole("button",{name:"ORBIT Sense · Ask about a window",exact:true}).click();
 await page.getByRole("heading",{name:"SENSE ACCEPTANCE · See and understand",exact:true}).waitFor();
 await page.getByRole("button",{name:"Share selected scope",exact:true}).click();
 await page.getByLabel("Ask about this screen",{exact:true}).waitFor();
 assert.equal(await page.getByLabel("Ask about this screen",{exact:true}).inputValue(),"Explain this error.");
 await page.getByRole("button",{name:"Stop sharing",exact:true}).click();
 await assert.rejects(core("sense.analyze",{}),/Unsupported operation/);
 const windows=await invoke("sense_command",{action:"windows",params:{}});
 const target=windows.windows.find(w=>w.processId===fixture.pid);
 assert.ok(target);
 const start=()=>invoke("sense_command",{action:"start",params:{profileId:testProfile.id,scope:"current-window",targetId:target.id}});
 let active=await start();
 const pending=invoke("sense_command",{action:"capture",params:{sessionId:active.sessionId}});
 const cancelled=pending.then(()=>({ok:true}),error=>({error:String(error)}));
 await new Promise(r=>setTimeout(r,50));
 await invoke("sense_command",{action:"stop",params:{}});
 assert.match((await cancelled).error??"",/stopped|timed out|changed/i);
 active=await start();
 await invoke("sense_command",{action:"capture",params:{sessionId:active.sessionId}});
 await core("ai.localOnly",{enabled:true});
 await assert.rejects(invoke("sense_command",{action:"ask",params:{sessionId:active.sessionId,question:"Explain",acknowledgedDestination:"",includeImage:false}}),/LOCAL ONLY/);
 await core("ai.localOnly",{enabled:original.localOnly});
 await invoke("sense_command",{action:"stop",params:{}});
 await fs.writeFile("validation/sense-native-ui-v06.json",JSON.stringify({
  mode:process.argv.includes("--installed")?"installed Desktop shortcut (CI)":"direct native executable, not installed",
  version:desktop.version,profileOptIn:"PASS",scopeSelection:"PASS",privacyIndicator:"PASS",nativeAccessibility:"PASS",
  remoteDisclosure:"PASS",stopRevokesSession:"PASS",pilotRejected:"PASS",quickSenseEntry:"PASS",quickOverlay:"PASS",inFlightCancellation:"PASS",localOnly:"PASS",
  liveModel:"NOT VERIFIED",voiceRecording:"NOT VERIFIED"
 },null,2));
 console.log("PASS: native Sense opt-in, target selection, real UIA, indicator, disclosure, Stop and Pilot rejection.");
} catch(error) { await page.screenshot({path:"validation/sense-native-failure.png"}); console.log("Sense UI error:",await page.locator(".sense-panel [role=alert]").allTextContents()); throw error; } finally {
 await invoke("sense_command",{action:"stop",params:{}}).catch(()=>{});
 await core("ai.localOnly",{enabled:original.localOnly}).catch(()=>{});
 await core("ai.select",{id:original.selected}).catch(()=>{});
 if(testProfile) await core("ai.delete",{id:testProfile.id}).catch(()=>{});
 await page.reload().catch(()=>{});
 fixture.kill();
 if(process.argv.includes("--exit"))await invoke("window_action",{action:"exit"}).catch(()=>{});
 await browser.close();
}
