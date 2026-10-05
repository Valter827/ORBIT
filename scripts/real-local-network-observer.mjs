// Acceptance-only network observer: records metadata, never prompts/headers or response text.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
let sequence=0;
const log=value=>fs.appendFileSync(process.env.ORBIT_ACCEPTANCE_TRACE,JSON.stringify({at:Date.now(),pid:process.pid,...value})+"\n");
for(const transport of [http,https]){
 const original=transport.request;
 transport.request=function(...args){
  const raw=args[0];
  const url=raw instanceof URL?raw:typeof raw==="string"?new URL(raw):new URL((transport===https?"https:":"http:")+"//"+(raw.hostname??raw.host??"localhost")+(raw.port?":"+raw.port:"")+(raw.path??"/"));
  const id=++sequence;
  const allowed=["127.0.0.1","[::1]"].includes(url.hostname);
  log({event:"request",id,origin:url.origin,path:url.pathname,allowed});
  if(!allowed)throw new Error("Acceptance observer blocked non-loopback network request.");
  const request=Reflect.apply(original,this,args);
  request.on("response",res=>{
   let bytes=0,chunks=0,frames=0,firstAt=null,lastAt=null;
   res.on("data",chunk=>{bytes+=chunk.length;chunks++;frames+=(chunk.toString("utf8").match(/data: /g)||[]).length;firstAt??=Date.now();lastAt=Date.now();});
   res.on("close",()=>log({event:"responseClosed",id,path:url.pathname,status:res.statusCode,bytes,chunks,sseFrames:frames,firstAt,lastAt,complete:res.complete,aborted:res.aborted}));
  });
  request.on("error",error=>log({event:"requestError",id,name:error.name,code:error.code??null}));
  return request;
 };
}
