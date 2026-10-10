const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name="orbit-token"]').content;
let taskId=null;
const labels={
 "agent.created":"Task created","agent.started":"Task started","agent.completed":"Completed","agent.failed":"Failed","agent.cancelled":"Cancelled","agent.timed_out":"Time limit reached",
 "plan.created":"Plan ready","plan.approved":"Plan approved","plan.rejected":"Plan rejected",
 "step.started":"Step started","step.completed":"Step completed","step.failed":"Step failed",
 "tool.requested":"Action requested","tool.started":"Action started","tool.completed":"Action completed","tool.failed":"Action failed",
 "permission.required":"Permission required","permission.granted":"Permission granted","permission.denied":"Permission denied",
 "diff.created":"Changes proposed","diff.approved":"Changes approved","diff.rejected":"Changes rejected",
 "verification.started":"Checking the result","verification.passed":"Verification passed","verification.failed":"Verification failed"
};
function describeEvent(data){
 const out=data.output;
 if(out&&typeof out==="object")return [out.command,out.path,out.stdout,out.stderr].filter(v=>typeof v==="string"&&v).join("\n").slice(0,6000);
 return [data.plan,data.diff,data.description,data.message,data.error,data.path,data.request&&typeof data.request==="string"?data.request:null].filter(v=>typeof v==="string"&&v).join("\n").slice(0,6000);
}

async function post(url,data={}){const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","x-orbit-token":token},body:JSON.stringify(data)});const out=await r.json();if(!r.ok)throw new Error(out.error);return out;}
function showError(e){$("status").textContent=e.message;}
$("start").onclick=async()=>{try{$("timeline").replaceChildren();$("extras").replaceChildren();const r=await post("/api/task",{request:$("request").value});taskId=r.taskId;$("status").textContent="Agent running";}catch(e){showError(e);}};
$("stop").onclick=()=>post("/api/stop").catch(showError);
$("undo").onclick=async()=>{try{const id=$("undoId").value.trim()||taskId;await post("/api/undo",{taskId:id});$("status").textContent="Undo restored the original files.";}catch(e){showError(e);}};
$("configure").onclick=()=>{if(window.orbitDesktop){window.orbitDesktop.openSettings().catch(showError);return;}$("status").textContent="Set ANTHROPIC_API_KEY in the server environment, then restart npm start. The key is never entered into this page.";};
function event(e){
  const row=document.createElement("div");row.className="tl-row in";
  const text=document.createElement("div");text.textContent=(labels[e.type]??"Update")+" · "+new Date(e.at).toLocaleTimeString();
  const detail=document.createElement("pre");detail.style.whiteSpace="pre-wrap";detail.style.overflowWrap="anywhere";detail.textContent=describeEvent(e.data);
  row.append(text);if(detail.textContent)row.append(detail);$("timeline").append(row);taskId=e.taskId;$("undoId").value=taskId;
  if(["agent.completed","agent.failed","agent.cancelled","agent.timed_out"].includes(e.type)){$("status").textContent=(labels[e.type]??e.type)+": "+(e.data.message||"");$("extras").replaceChildren();}
}
function prompt(p){
  const card=document.createElement("section");card.className="card";card.dataset.id=p.id;
  const title=document.createElement("h3");title.textContent=p.kind==="plan"?"Approve plan":p.kind==="diff"?"Review diff":"Permission required";
  const content=document.createElement("pre");content.style.whiteSpace="pre-wrap";content.style.overflowWrap="anywhere";
  content.textContent=p.data.diff??p.data.plan??p.data.description;
  card.append(title,content);
  const choices=p.kind==="permission"?[["once","Allow once"],["task","Allow for task"],["deny","Deny"]]:[["approve",p.kind==="diff"?"Apply":"Approve plan"],["reject","Reject"]];
  for(const [answer,label]of choices){const b=document.createElement("button");b.className="btn";b.textContent=label;b.onclick=async()=>{try{await post("/api/answer",{id:p.id,answer});card.remove();}catch(e){showError(e);}};card.append(b);}
  if(!document.querySelector('[data-id="'+p.id+'"]'))$("extras").append(card);
}
const stream=new EventSource("/api/events");
stream.onmessage=e=>event(JSON.parse(e.data));
stream.addEventListener("pending",e=>prompt(JSON.parse(e.data)));
stream.onerror=()=>{$("status").textContent="Connection interrupted; reconnecting…";};
async function refresh(){const r=await fetch("/api/status");const s=await r.json();$("workspace").textContent=s.workspace;$("configure").hidden=s.configured&&!window.orbitDesktop;if(window.orbitDesktop)$("configure").textContent="Settings";
  $("status").textContent=s.configured?"Ready":"AI provider not configured.";
  taskId=s.current?.id??null;if(taskId)$("undoId").value=taskId;
  $("timeline").replaceChildren();for(const e of s.events)event(e);for(const p of s.pending)prompt(p);
}
stream.onopen=()=>refresh().catch(showError);
document.addEventListener("keydown",e=>{if(e.ctrlKey&&e.code==="Space"){e.preventDefault();$("request").focus();}});
