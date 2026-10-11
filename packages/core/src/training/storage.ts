import fs from "node:fs";
import path from "node:path";
import { StorageSchema, type TrainingStorage } from "./types.js";
export function inside(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
}
export function checkedPath(raw: string) {
  if (!path.isAbsolute(raw) || raw.includes("\0") || raw.startsWith("\\\\") || raw.startsWith("//"))
    throw Error("Use a local absolute storage path.");
  const resolved = path.resolve(raw);
  if (resolved === path.parse(resolved).root) throw Error("A drive root cannot be training storage.");
  let p = resolved;
  while (true) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw Error("Storage must not traverse symbolic links or junctions.");
    const next = path.dirname(p);
    if (next === p) break;
    p = next;
  }
  return resolved;
}
export function validateStorage(value: unknown, privateRoot: string): TrainingStorage {
  const parsed = StorageSchema.parse(value);
  const result = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, checkedPath(v)])) as TrainingStorage;
  const roots = [result.models, result.training, result.datasets, result.adapters];
  for (const root of roots) {
    if (inside(root, privateRoot) || inside(privateRoot, root))
      throw Error("Training storage must be separate from private ORBIT application data.");
  }
  for (let i = 0; i < roots.length; i++)
    for (let j = 0; j < i; j++)
      if (inside(roots[i]!, roots[j]!) || inside(roots[j]!, roots[i]!))
        throw Error("Model, training, dataset and adapter folders must be separate.");
  if (
    !fs.existsSync(result.python) ||
    !fs.statSync(result.python).isFile() ||
    !/^python(?:3(?:\.\d+)?)?(?:\.exe)?$/i.test(path.basename(result.python))
  )
    throw Error("Select an existing isolated Python interpreter.");
  return result;
}
export function prepareOwned(root: string) {
  checkedPath(root);
  const marker = path.join(root, ".orbit-training-storage");
  if (fs.existsSync(root) && fs.readdirSync(root).length && !fs.existsSync(marker))
    throw Error("Choose an empty folder or an existing ORBIT training folder.");
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, "ORBIT Training Lab 1\n", { flag: "wx" });
}
export function freeSpace(root: string) {
  let p = root;
  while (!fs.existsSync(p)) {
    const next = path.dirname(p);
    if (next === p) return null;
    p = next;
  }
  try {
    const s = fs.statfsSync(p);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}
