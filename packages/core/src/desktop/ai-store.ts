import { migrateModelStudio } from "../ai/model-studio.js";
import { PersonalMemory, migrateMemory, detectMemory, Candidate, memoryKey, safeMemory } from "./personal-memory.js";
import { COSMO_ID, createCosmo } from "../ai/cosmo.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AIProfile, ProfileSchema, createProfile } from "../ai/profiles.js";
import { redactDeep } from "../security/redactor.js";
import type { AIMessage } from "../ai/router.js";
export class AIStore {
  readonly db: DatabaseSync;
  readonly personal: PersonalMemory;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "ai.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.["user_version"] ?? 0);
    if (version > 4) throw new Error("AI database needs a newer ORBIT.");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,profile TEXT NOT NULL,project TEXT NOT NULL,title TEXT NOT NULL,updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,conversation TEXT NOT NULL,payload TEXT NOT NULL,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS memory(id TEXT PRIMARY KEY,owner TEXT NOT NULL,project TEXT NOT NULL,scope TEXT NOT NULL,source TEXT NOT NULL,content TEXT NOT NULL,at INTEGER NOT NULL);",
    );

    if (version < 2) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(`
          CREATE TABLE profile_versions(id INTEGER PRIMARY KEY,profile TEXT NOT NULL,payload TEXT NOT NULL,at INTEGER NOT NULL);
          CREATE TABLE workflows(id TEXT PRIMARY KEY,profile TEXT NOT NULL,name TEXT NOT NULL,steps TEXT NOT NULL);
          CREATE TABLE knowledge_sources(id TEXT PRIMARY KEY,profile TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,source_path TEXT NOT NULL,bytes INTEGER NOT NULL,hash TEXT NOT NULL,updated INTEGER NOT NULL,status TEXT NOT NULL,warning TEXT NOT NULL);
          CREATE INDEX knowledge_owner ON knowledge_sources(profile);
          CREATE TABLE knowledge_chunks(id TEXT PRIMARY KEY,source TEXT NOT NULL,profile TEXT NOT NULL,ordinal INTEGER NOT NULL,text TEXT NOT NULL,embedding TEXT,backend TEXT NOT NULL);
          CREATE INDEX chunks_owner ON knowledge_chunks(profile,source);
          CREATE VIRTUAL TABLE knowledge_fts USING fts5(text,content='knowledge_chunks',content_rowid='rowid',tokenize='unicode61');
          CREATE TRIGGER knowledge_insert AFTER INSERT ON knowledge_chunks BEGIN INSERT INTO knowledge_fts(rowid,text) VALUES(new.rowid,new.text); END;
          CREATE TRIGGER knowledge_delete AFTER DELETE ON knowledge_chunks BEGIN INSERT INTO knowledge_fts(knowledge_fts,rowid,text) VALUES('delete',old.rowid,old.text); END;
          ALTER TABLE memory ADD COLUMN category TEXT NOT NULL DEFAULT 'Facts';
          ALTER TABLE memory ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE memory ADD COLUMN updated INTEGER NOT NULL DEFAULT 0;
          UPDATE memory SET updated=at;
          PRAGMA user_version=2;
        `);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
    migrateMemory(this.db);
    migrateModelStudio(this.db);
    this.personal = new PersonalMemory(this.db);
    const existingProfiles = this.profiles();
    if (!existingProfiles.some((p) => p.id === COSMO_ID)) this.saveProfile(createCosmo());
    if (!existingProfiles.length) this.setPreference("selected", COSMO_ID);
    if (!existingProfiles.length)
      for (const [name, purpose] of [
        ["ORBIT", "General assistant"],
        ["CODER", "Programming assistant"],
        ["REVIEWER", "Code review assistant"],
        ["STUDY", "Learning assistant"],
      ]) {
        const p = createProfile(name);
        p.description = purpose!;
        if (name === "ORBIT") p.capabilities = ["read", "search", "tests", "write", "terminal"];
        this.saveProfile(p);
      }
  }
  profiles(): AIProfile[] {
    return this.db
      .prepare("SELECT payload FROM profiles ORDER BY rowid")
      .all()
      .map((r) => ProfileSchema.parse(JSON.parse(String(r["payload"]))));
  }
  profile(id: string) {
    const p = this.profiles().find((p) => p.id === id);
    if (!p) throw new Error("AI profile not found.");
    return p;
  }
  saveProfile(value: unknown) {
    const p = ProfileSchema.parse(redactDeep(value).value);
    if (p.id === COSMO_ID) p.builtin = { id: "cosmo", version: "1.0" };
    else if (p.builtin) throw new Error("Built-in identity is reserved.");
    const payload = JSON.stringify(p);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db.prepare("SELECT payload FROM profiles WHERE id=?").get(p.id);
      if (previous && previous["payload"] !== payload)
        this.db
          .prepare("INSERT INTO profile_versions(profile,payload,at) VALUES(?,?,?)")
          .run(p.id, String(previous["payload"]), Date.now());
      this.db.prepare("INSERT OR REPLACE INTO profiles VALUES(?,?)").run(p.id, payload);
      this.db
        .prepare(
          "DELETE FROM profile_versions WHERE profile=? AND id NOT IN (SELECT id FROM profile_versions WHERE profile=? ORDER BY id DESC LIMIT 20)",
        )
        .run(p.id, p.id);
      this.db.prepare("DELETE FROM workflows WHERE profile=?").run(p.id);
      for (const workflow of p.workflows)
        this.db
          .prepare("INSERT INTO workflows VALUES(?,?,?,?)")
          .run(p.id + ":" + workflow.id, p.id, workflow.name, JSON.stringify(workflow.steps));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return p;
  }
  deleteProfile(id: string) {
    if (this.profiles().length <= 1) throw new Error("Keep at least one AI profile.");
    if (id === COSMO_ID) throw new Error("COSMO is built in. Duplicate it to create a separate AI.");
    this.clearConversations(id);
    this.db.prepare("DELETE FROM memory WHERE owner=?").run(id);
    this.db.prepare("DELETE FROM memory_proposals WHERE owner=?").run(id);
    this.db.prepare("DELETE FROM workflows WHERE profile=?").run(id);
    this.db.prepare("DELETE FROM profile_versions WHERE profile=?").run(id);
    this.db.prepare("DELETE FROM profiles WHERE id=?").run(id);
  }
  preference(key: string, fallback = "") {
    return String(this.db.prepare("SELECT value FROM preferences WHERE key=?").get(key)?.["value"] ?? fallback);
  }
  setPreference(key: string, value: string) {
    this.db.prepare("INSERT OR REPLACE INTO preferences VALUES(?,?)").run(key, value);
  }
  conversations(profile: string, project: string) {
    return this.db
      .prepare("SELECT * FROM conversations WHERE profile=? AND project=? ORDER BY updated DESC LIMIT 100")
      .all(profile, project);
  }
  newConversation(profile: string, project: string, title: string, id: string = randomUUID()) {
    this.db
      .prepare("INSERT INTO conversations VALUES(?,?,?,?,?)")
      .run(id, profile, project, title.slice(0, 80), Date.now());
    return id;
  }
  messages(id: string, profile: string, project: string): AIMessage[] {
    const c = this.db
      .prepare("SELECT id FROM conversations WHERE id=? AND profile=? AND project=?")
      .get(id, profile, project);
    if (!c) throw new Error("Conversation is outside this AI/project scope.");
    return this.db
      .prepare("SELECT payload FROM messages WHERE conversation=? ORDER BY id DESC LIMIT 100")
      .all(id)
      .reverse()
      .map((r) => JSON.parse(String(r["payload"])) as AIMessage);
  }
  saveTurn(id: string, user: AIMessage, assistant: AIMessage, regenerate: boolean) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (regenerate) this.removeLastTurn(id);
      this.addMessage(id, user);
      this.addMessage(id, assistant);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  removeLastTurn(id: string) {
    this.db
      .prepare(
        "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE conversation=? ORDER BY id DESC LIMIT 2)",
      )
      .run(id);
  }
  addMessage(id: string, m: AIMessage) {
    this.db
      .prepare("INSERT INTO messages(conversation,payload,at) VALUES(?,?,?)")
      .run(id, JSON.stringify(redactDeep(m).value), Date.now());
    this.db.prepare("UPDATE conversations SET updated=? WHERE id=?").run(Date.now(), id);
  }
  memory(profile: AIProfile, project: string) {
    const owners = profile.memory.shared ? [profile.id, "shared"] : [profile.id];
    return this.db
      .prepare(
        "SELECT * FROM memory WHERE enabled=1 AND status='active' AND (valid_until IS NULL OR valid_until>unixepoch()*1000) AND (owner=? OR owner=?) AND ((scope='project' AND project=?) OR scope='user') ORDER BY at DESC LIMIT 50",
      )
      .all(owners[0]!, owners[1] ?? owners[0]!, project)
      .filter((r) => (r["scope"] === "project" ? profile.memory.project : profile.memory.user));
  }
  addMemory(profile: AIProfile, project: string, scope: "project" | "user", content: string, shared: boolean) {
    if (shared && !profile.memory.shared) throw new Error("Shared memory is disabled for this AI.");
    if (scope === "project" && !project) throw new Error("Select a project for project memory.");
    const candidate = detectMemory(content, project) ?? Candidate.parse({ type: "fact", content, scope });
    candidate.scope = scope;
    candidate.normalizedKey = memoryKey(content, candidate.type);
    return this.personal.save(profile, project, candidate, { shared, source: "ManualEntry" });
  }

  deleteMemory(profile: AIProfile, id: string) {
    this.db
      .prepare("DELETE FROM memory WHERE id=? AND (owner=? OR (owner='shared' AND ?=1))")
      .run(id, profile.id, profile.memory.shared ? 1 : 0);
  }

  versions(profile: string) {
    return this.db.prepare("SELECT id,at FROM profile_versions WHERE profile=? ORDER BY id DESC LIMIT 20").all(profile);
  }
  restore(profile: string, version: number) {
    const row = this.db.prepare("SELECT payload FROM profile_versions WHERE id=? AND profile=?").get(version, profile);
    if (!row) throw new Error("Profile version not found.");
    return this.saveProfile(JSON.parse(String(row["payload"])));
  }
  clearConversations(profile: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM messages WHERE conversation IN (SELECT id FROM conversations WHERE profile=?)")
        .run(profile);
      this.db.prepare("DELETE FROM memory WHERE owner=? AND scope='conversation'").run(profile);
      this.db.prepare("DELETE FROM memory_proposals WHERE owner=?").run(profile);
      this.db.prepare("DELETE FROM conversations WHERE profile=?").run(profile);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  memoryRecords(profile: AIProfile, project: string, query = "") {
    return this.db
      .prepare(
        "SELECT * FROM memory WHERE (owner=? OR (owner='shared' AND ?=1)) AND (scope='user' OR project=?) AND content LIKE ? ORDER BY updated DESC LIMIT 200",
      )
      .all(profile.id, profile.memory.shared ? 1 : 0, project, "%" + query.replace(/[%_]/g, "") + "%");
  }
  updateMemory(profile: AIProfile, id: string, content: string, enabled: boolean, category: string) {
    if (!safeMemory(content)) throw new Error("Sensitive values cannot be stored as memory.");
    const changed = this.db
      .prepare(
        "UPDATE memory SET content=?,enabled=?,category=?,updated=? WHERE id=? AND (owner=? OR (owner='shared' AND ?=1))",
      )
      .run(
        redactDeep(content).value,
        enabled ? 1 : 0,
        category,
        Date.now(),
        id,
        profile.id,
        profile.memory.shared ? 1 : 0,
      );
    if (!changed.changes) throw new Error("Memory is outside this AI scope.");
  }
  close() {
    this.db.close();
  }
}
