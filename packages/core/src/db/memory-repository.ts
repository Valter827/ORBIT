import type { Database } from "./database.js";
import { newId } from "./id.js";

export type MemoryKind = "user" | "project" | "technical" | "task" | "conversation";

export interface MemoryRecord {
  userId: string;
  projectId?: string | null;
  kind: MemoryKind;
  title: string;
  body: string;
  embedding: number[];
  sourceType?: string;
  sourceRef?: string;
}

export interface MemoryMatch {
  id: string;
  title: string;
  body: string;
  kind: MemoryKind;
  /** Cosine distance: 0 = identical, 2 = opposite. Lower is more relevant. */
  distance: number;
}

const EMBEDDING_DIM = 1536;

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Expected an embedding of length ${EMBEDDING_DIM}, got ${embedding.length}.`);
  }
  return `[${embedding.join(",")}]`;
}

/**
 * This is the real pipeline described in ARCHITECTURE.md's memory section:
 * an embedding goes in, pgvector's HNSW index (see prisma/sql/001_init.sql)
 * serves the nearest-neighbour query. No provider adapter exists yet to
 * *compute* embeddings from text — see ai/router.ts — so callers pass a
 * precomputed vector. Once an embedding model is wired up, only the caller
 * changes; this repository and the index underneath it already work.
 */
export class MemoryRepository {
  constructor(private readonly db: Database) {}

  async remember(record: MemoryRecord): Promise<string> {
    const id = newId("mem");
    await this.db.pool.query(
      `INSERT INTO "Memory"
         (id, "userId", "projectId", kind, title, body, embedding, "sourceType", "sourceRef", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, now(), now())`,
      [
        id,
        record.userId,
        record.projectId ?? null,
        record.kind,
        record.title,
        record.body,
        toVectorLiteral(record.embedding),
        record.sourceType ?? null,
        record.sourceRef ?? null,
      ],
    );
    return id;
  }

  async recall(userId: string, queryEmbedding: number[], limit = 5): Promise<MemoryMatch[]> {
    const { rows } = await this.db.pool.query<{
      id: string;
      title: string;
      body: string;
      kind: MemoryKind;
      distance: number;
    }>(
      `SELECT id, title, body, kind, embedding <=> $2::vector AS distance
       FROM "Memory"
       WHERE "userId" = $1
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [userId, toVectorLiteral(queryEmbedding), limit],
    );
    return rows;
  }

  async touch(id: string): Promise<void> {
    await this.db.pool.query(`UPDATE "Memory" SET "lastUsedAt" = now() WHERE id = $1`, [id]);
  }

  async count(userId: string): Promise<number> {
    const { rows } = await this.db.pool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM "Memory" WHERE "userId" = $1`,
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
