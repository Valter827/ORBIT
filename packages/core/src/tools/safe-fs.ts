import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkAbort } from "../agent/abort.js";
export const LIMITS = {
  textBytes: 2_000_000,
  diffBytes: 1_000_000,
  searchBytes: 256_000,
  searchResults: 100,
  searchFiles: 5000,
  searchEntries: 20000,
};
export async function readText(target: string, max = LIMITS.textBytes): Promise<{ content: string; mode: number }> {
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Not a regular file");
    if (stat.size > max) throw new Error("File size limit exceeded");
    const data = Buffer.alloc(max + 1);
    let used = 0;
    while (used < data.length) {
      const r = await handle.read(data, used, data.length - used, null);
      if (!r.bytesRead) break;
      used += r.bytesRead;
    }
    if (used > max) throw new Error("File size limit exceeded");
    const bytes = data.subarray(0, used);
    if (bytes.includes(0)) throw new Error("Binary file rejected");
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Non UTF-8 file rejected");
    }
    return { content, mode: stat.mode };
  } finally {
    await handle.close();
  }
}
export async function atomicWrite(target: string, content: string, signal?: AbortSignal, mode?: number): Promise<void> {
  checkAbort(signal);
  const temp = path.join(path.dirname(target), ".orbit-write-" + randomUUID());
  const handle = await fs.open(temp, "wx", mode ?? 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    checkAbort(signal);
    await fs.rename(temp, target);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
export function missing(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}
