import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuditEntry, AuditSink } from "./sink.js";
import { redactDeep } from "../security/redactor.js";
export class FileAuditSink implements AuditSink {
  private pending: Promise<void> = Promise.resolve();
  constructor(readonly filename: string) {}
  record(entry: AuditEntry): Promise<void> {
    const next = this.pending.then(async () => {
      await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
      const handle = await fs.open(this.filename, "a", 0o600);
      try {
        await handle.writeFile(JSON.stringify(redactDeep(entry).value) + "\n");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    this.pending = next;
    return next;
  }
}
