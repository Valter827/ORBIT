import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export function migrateKnowledge(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS knowledge_schema(version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge_spaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner TEXT NOT NULL,project TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge_access(space TEXT NOT NULL,profile TEXT NOT NULL,PRIMARY KEY(space,profile));
      CREATE INDEX IF NOT EXISTS knowledge_access_profile ON knowledge_access(profile,space);
      CREATE TABLE IF NOT EXISTS knowledge_membership(source TEXT NOT NULL,space TEXT NOT NULL,PRIMARY KEY(source,space));
      CREATE INDEX IF NOT EXISTS knowledge_membership_space ON knowledge_membership(space,source);
      CREATE TABLE IF NOT EXISTS knowledge_embedding_cache(backend TEXT NOT NULL,hash TEXT NOT NULL,version INTEGER NOT NULL,vector TEXT NOT NULL,PRIMARY KEY(backend,hash,version));
      CREATE TABLE IF NOT EXISTS knowledge_jobs(id TEXT PRIMARY KEY,profile TEXT NOT NULL,paths TEXT NOT NULL,limits TEXT NOT NULL,spaces TEXT NOT NULL,state TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge_links(profile TEXT NOT NULL,path TEXT NOT NULL,spaces TEXT NOT NULL,PRIMARY KEY(profile,path));`);
    const columns = new Set(
      db
        .prepare("PRAGMA table_info(knowledge_chunks)")
        .all()
        .map((r) => String(r["name"])),
    );
    for (const [name, type] of Object.entries({
      section: "TEXT NOT NULL DEFAULT ''",
      symbol: "TEXT NOT NULL DEFAULT ''",
      line_start: "INTEGER NOT NULL DEFAULT 0",
      line_end: "INTEGER NOT NULL DEFAULT 0",
      page: "INTEGER",
    }))
      if (!columns.has(name)) db.exec(`ALTER TABLE knowledge_chunks ADD COLUMN ${name} ${type}`);
    const sourceColumns = new Set(
      db
        .prepare("PRAGMA table_info(knowledge_sources)")
        .all()
        .map((r) => String(r["name"])),
    );
    for (const [name, type] of Object.entries({
      modified: "INTEGER NOT NULL DEFAULT 0",
      index_version: "INTEGER NOT NULL DEFAULT 1",
    }))
      if (!sourceColumns.has(name)) db.exec(`ALTER TABLE knowledge_sources ADD COLUMN ${name} ${type}`);
    // Each legacy owner gets a private space. No access is granted to other profiles.
    if (!db.prepare("SELECT version FROM knowledge_schema").get()) {
      for (const row of db.prepare("SELECT DISTINCT profile FROM knowledge_sources").all()) {
        const profile = String(row["profile"]),
          id = randomUUID();
        db.prepare("INSERT INTO knowledge_spaces VALUES(?,?,?,?,?)").run(id, "My knowledge", profile, "", Date.now());
        db.prepare("INSERT INTO knowledge_access VALUES(?,?)").run(id, profile);
        db.prepare("INSERT INTO knowledge_membership SELECT id,? FROM knowledge_sources WHERE profile=?").run(
          id,
          profile,
        );
      }
      db.prepare("INSERT INTO knowledge_schema VALUES(2)").run();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// A source with explicit membership is visible only through an allowed space.
// Unassigned legacy/imported sources retain their original private owner scope.
export const knowledgeAccessSQL = `(EXISTS(SELECT 1 FROM knowledge_membership km JOIN knowledge_access ka ON ka.space=km.space WHERE km.source=s.id AND ka.profile=?) OR (s.profile=? AND NOT EXISTS(SELECT 1 FROM knowledge_membership km WHERE km.source=s.id)))`;

export class KnowledgeSpaces {
  constructor(private readonly db: DatabaseSync) {}
  list(profile: string) {
    return this.db
      .prepare(
        `SELECT s.*,
      (SELECT COUNT(*) FROM knowledge_membership m WHERE m.space=s.id) AS files,
      (SELECT COUNT(*) FROM knowledge_chunks c JOIN knowledge_membership m ON m.source=c.source WHERE m.space=s.id) AS chunks
      FROM knowledge_spaces s JOIN knowledge_access a ON a.space=s.id WHERE a.profile=? ORDER BY s.name`,
      )
      .all(profile)
      .map((s) => ({
        ...s,
        access: this.db
          .prepare("SELECT profile FROM knowledge_access WHERE space=?")
          .all(String(s["id"]))
          .map((r) => String(r["profile"])),
      }));
  }
  create(owner: string, value: unknown) {
    const input = z
      .object({ name: z.string().trim().min(1).max(120), project: z.string().max(2000).default("") })
      .strict()
      .parse(value);
    const id = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO knowledge_spaces VALUES(?,?,?,?,?)")
        .run(id, input.name, owner, input.project, Date.now());
      this.db.prepare("INSERT INTO knowledge_access VALUES(?,?)").run(id, owner);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id };
  }
  authorize(profile: string, ids: string[], manage = false) {
    if (ids.length > 30) throw new Error("Too many Knowledge Spaces.");
    for (const id of ids) {
      const row = this.db
        .prepare(
          "SELECT s.owner FROM knowledge_spaces s JOIN knowledge_access a ON a.space=s.id WHERE s.id=? AND a.profile=?",
        )
        .get(id, profile);
      if (!row || (manage && row["owner"] !== profile)) throw new Error("Knowledge Space is outside this AI scope.");
    }
  }
  access(owner: string, id: string, profiles: string[]) {
    this.authorize(owner, [id], true);
    for (const profile of profiles)
      if (!this.db.prepare("SELECT id FROM profiles WHERE id=?").get(profile)) throw new Error("AI profile not found.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM knowledge_embedding_cache WHERE NOT EXISTS(SELECT 1 FROM knowledge_chunks c WHERE c.backend=knowledge_embedding_cache.backend AND c.embedding=knowledge_embedding_cache.vector)",
        )
        .run();
      this.db.prepare("DELETE FROM knowledge_access WHERE space=?").run(id);
      for (const profile of new Set([owner, ...profiles]))
        this.db.prepare("INSERT INTO knowledge_access VALUES(?,?)").run(id, profile);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ok: true };
  }
  assign(profile: string, source: string, ids: string[]) {
    if (!this.db.prepare("SELECT id FROM knowledge_sources WHERE id=? AND profile=?").get(source, profile))
      throw new Error("Only the document owner may change its spaces.");
    this.authorize(profile, ids, true);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM knowledge_membership WHERE source=?").run(source);
      for (const id of new Set(ids)) this.db.prepare("INSERT INTO knowledge_membership VALUES(?,?)").run(source, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ok: true };
  }
  remove(owner: string, id: string, confirmed: boolean) {
    if (!confirmed) throw new Error("Confirm removal of the Knowledge index. Original files remain untouched.");
    this.authorize(owner, [id], true);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const sources = this.db.prepare("SELECT source FROM knowledge_membership WHERE space=?").all(id);
      this.db.prepare("DELETE FROM knowledge_membership WHERE space=?").run(id);
      for (const row of sources) {
        const source = String(row["source"]);
        if (!this.db.prepare("SELECT 1 FROM knowledge_membership WHERE source=?").get(source)) {
          this.db.prepare("DELETE FROM knowledge_chunks WHERE source=?").run(source);
          this.db.prepare("DELETE FROM knowledge_sources WHERE id=?").run(source);
        }
      }
      this.db.prepare("DELETE FROM knowledge_access WHERE space=?").run(id);
      this.db.prepare("DELETE FROM knowledge_spaces WHERE id=?").run(id);
      // Prevent removed-space links/jobs from resurrecting its index after restart.
      this.db
        .prepare("DELETE FROM knowledge_links WHERE EXISTS(SELECT 1 FROM json_each(spaces) WHERE value=?)")
        .run(id);
      this.db.prepare("DELETE FROM knowledge_jobs WHERE EXISTS(SELECT 1 FROM json_each(spaces) WHERE value=?)").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ok: true };
  }
}
