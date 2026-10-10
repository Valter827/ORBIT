import type { Database } from "./database.js";
import { newId } from "./id.js";

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  rootPath: string;
  stack: string[];
  fileCount: number;
  lastScanAt: Date | null;
  isDemo: boolean;
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  /** Idempotent: ORBIT is single-user today, so this is the "current user". */
  async ensureLocalUser(displayName: string): Promise<string> {
    const existing = await this.db.pool.query<{ id: string }>(
      `SELECT id FROM "User" WHERE "displayName" = $1 LIMIT 1`,
      [displayName],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const id = newId("user");
    await this.db.pool.query(`INSERT INTO "User" (id, "displayName") VALUES ($1, $2)`, [id, displayName]);
    return id;
  }
}

export class ProjectRepository {
  constructor(private readonly db: Database) {}

  async upsert(input: {
    userId: string;
    name: string;
    rootPath: string;
    stack: string[];
    fileCount: number;
    isDemo?: boolean;
  }): Promise<ProjectRecord> {
    const { rows } = await this.db.pool.query<ProjectRecord>(
      `INSERT INTO "Project" (id, "userId", name, "rootPath", stack, "fileCount", "lastScanAt", "isDemo")
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
       ON CONFLICT ("userId", "rootPath")
       DO UPDATE SET name = $3, stack = $5, "fileCount" = $6, "lastScanAt" = now()
       RETURNING id, "userId", name, "rootPath", stack, "fileCount", "lastScanAt", "isDemo"`,
      [newId("proj"), input.userId, input.name, input.rootPath, input.stack, input.fileCount, input.isDemo ?? false],
    );
    return rows[0]!;
  }

  async listForUser(userId: string): Promise<ProjectRecord[]> {
    const { rows } = await this.db.pool.query<ProjectRecord>(
      `SELECT id, "userId", name, "rootPath", stack, "fileCount", "lastScanAt", "isDemo"
       FROM "Project" WHERE "userId" = $1 ORDER BY "lastScanAt" DESC NULLS LAST`,
      [userId],
    );
    return rows;
  }
}
