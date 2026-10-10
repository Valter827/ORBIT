/**
 * Every tool execution, permission decision, and agent transition is written
 * here. This is the interface the Prisma `AuditLog` model implements once the
 * database is wired up (STEP 5 in the project plan); until then, an in-memory
 * sink lets the rest of the system depend on the real contract instead of a
 * stub that silently drops entries.
 */

export interface AuditEntry {
  userId: string;
  event: string;
  actor: "orbit" | "user";
  target?: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface AuditSink {
  record(entry: AuditEntry): Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  list(): readonly AuditEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
