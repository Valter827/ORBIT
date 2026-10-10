import type { Database } from "./database.js";
import type { AuditEntry, AuditSink } from "../audit/sink.js";
import { newId } from "./id.js";

/**
 * The real audit trail. Same `AuditSink` contract the agent core already
 * depends on (see packages/core/src/audit/sink.ts) — nothing above this
 * layer needs to know whether entries land in memory or in Postgres.
 */
export class PostgresAuditSink implements AuditSink {
  constructor(private readonly db: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.pool.query(
      `INSERT INTO "AuditLog" (id, "userId", event, actor, target, detail, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
      [newId("audit"), entry.userId, entry.event, entry.actor, entry.target ?? null, entry.detail ?? {}, entry.at],
    );
  }

  async recent(userId: string, limit = 50): Promise<AuditEntry[]> {
    const { rows } = await this.db.pool.query<{
      userid: string;
      event: string;
      actor: "orbit" | "user";
      target: string | null;
      detail: Record<string, unknown>;
      createdat: Date;
    }>(
      `SELECT "userId" as userid, event, actor, target, detail, "createdAt" as createdat
       FROM "AuditLog" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      userId: r.userid,
      event: r.event,
      actor: r.actor,
      ...(r.target !== null ? { target: r.target } : {}),
      detail: r.detail,
      at: r.createdat.getTime(),
    }));
  }
}
