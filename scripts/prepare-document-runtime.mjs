import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

// Keep parser packages intact: PDF.js resolves its worker relative to its own module.
// Copy only the production dependency closure of these parsers, never dev tooling.
export async function prepareDocumentRuntime() {
  const root=path.resolve("node_modules"), target=path.resolve("src-tauri/resources/core/node_modules");
  const visited=new Set();
  async function copy(name, from) {
    const req=createRequire(from);let entry;
    try {entry=req.resolve(name+"/package.json");} catch {entry=req.resolve(name);}
    let dir=path.dirname(entry), pkg;
    while(dir!==path.dirname(dir)) {
      try {const candidate=JSON.parse(await fs.readFile(path.join(dir,"package.json"),"utf8"));if(candidate.name===name){pkg=candidate;break;}}catch{}
      dir=path.dirname(dir);
    }
    if(!pkg)throw new Error("Missing parser package: "+name);
    if(visited.has(dir))return;visited.add(dir);
    const relative=path.relative(root,dir);
    if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("Dependency outside node_modules");
    await fs.cp(dir,path.join(target,relative),{recursive:true});
    for(const dep of Object.keys(pkg.dependencies??{}))await copy(dep,path.join(dir,"package.json"));
    for(const dep of Object.keys(pkg.optionalDependencies??{})){
      // Optional platform packages may legitimately be absent on this host.
      try {req.resolve(dep);}catch{continue;}
      await copy(dep,path.join(dir,"package.json"));
    }
  }
  for(const name of ["pdfjs-dist","mammoth","htmlparser2"])await copy(name,path.resolve("package.json"));
  await fs.writeFile("src-tauri/resources/core/document-runtime.json",JSON.stringify({packages:[...visited].map(dir=>path.relative(root,dir)).sort()},null,2));
}
