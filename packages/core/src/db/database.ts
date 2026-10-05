import pg from "pg";
const { Pool } = pg;
type PoolConfig = pg.PoolConfig;

/**
 * A single pool per process. Repositories take a Database, never a raw
 * connection string — this is the seam where a future Prisma Client swaps
 * in without every call site changing, since Prisma too is "one client,
 * many repositories" underneath.
 */
export class Database {
  readonly pool: pg.Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  static fromEnv(): Database {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. ORBIT needs a Postgres connection string, e.g. " +
          "postgresql://orbit:password@localhost:5432/orbit",
      );
    }
    return new Database({ connectionString: url });
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
