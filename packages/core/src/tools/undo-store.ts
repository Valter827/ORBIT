import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import type { PathGuard } from "../security/path-guard.js";
import { atomicWrite } from "./safe-fs.js";
export interface Backup {
  path: string;
  previousContent: string | null;
  existedBefore: boolean;
  at: number;
  mode?: number;
}
interface Transaction {
  id: string;
  taskId: string;
  operation: string;
  at: number;
  states: Backup[];
  hashes: Array<string | null>;
}
export class UndoStore {
  readonly directory: string;
  constructor(directory?: string) {
    this.directory = directory ?? fs.mkdtempSync(path.join(os.tmpdir(), "orbit-undo-"));
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.directory).isSymbolicLink()) throw new Error("Undo directory cannot be a link");
  }
  private filename(taskId: string): string {
    return path.join(this.directory, createHash("sha256").update(taskId).digest("hex") + ".json");
  }
  private load(taskId: string): Transaction[] {
    try {
      return JSON.parse(fs.readFileSync(this.filename(taskId), "utf8")) as Transaction[];
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") return [];
      throw e;
    }
  }
  record(taskId: string, backup: Backup): void {
    this.transaction(taskId, "legacy", [backup]);
  }
  transaction(taskId: string, operation: string, states: Backup[]): void {
    const all = this.load(taskId);
    all.push({
      id: randomUUID(),
      taskId,
      operation,
      at: Date.now(),
      states,
      hashes: states.map((s) =>
        s.previousContent === null ? null : createHash("sha256").update(s.previousContent).digest("hex"),
      ),
    });
    const target = this.filename(taskId),
      temp = target + "." + randomUUID() + ".tmp";
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(all));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
  }
  manifestFor(taskId: string): readonly Backup[] {
    return this.load(taskId).flatMap((t) => t.states);
  }
  planUndo(taskId: string): Array<{ path: string; restoreContent: string | null; mode?: number }> {
    const first = new Map<string, Backup>();
    for (const b of this.manifestFor(taskId)) if (!first.has(b.path)) first.set(b.path, b);
    return [...first.values()].reverse().map((b) => ({
      path: b.path,
      restoreContent: b.existedBefore ? b.previousContent : null,
      ...(b.mode === undefined ? {} : { mode: b.mode }),
    }));
  }
  async restore(taskId: string, guard: PathGuard): Promise<void> {
    // Preflight every destination before making the first restoration.
    const plans = await Promise.all(
      this.planUndo(taskId).map(async (p) => ({ ...p, target: await guard.validate(p.path, "write") })),
    );
    for (const p of plans) {
      const target = await guard.validate(p.path, "write");
      if (p.restoreContent === null)
        await fs.promises.unlink(target).catch((e: unknown) => {
          if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
        });
      else {
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await atomicWrite(target, p.restoreContent, undefined, p.mode);
      }
    }
    this.clearTask(taskId);
  }
  clearTask(taskId: string): void {
    fs.rmSync(this.filename(taskId), { force: true });
  }
}
