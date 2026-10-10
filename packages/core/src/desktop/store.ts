import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { OrbitEvent } from "../agent/events.js";
export class DesktopStore {
  private readonly db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "orbit.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.["user_version"] ?? 0);
    if (version > 1) throw new Error("This database requires a newer ORBIT version.");
    if (version < 1)
      this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE tasks(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,request TEXT NOT NULL,status TEXT NOT NULL,updated INTEGER NOT NULL);
      CREATE TABLE events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX events_task ON events(task_id,id);
      PRAGMA user_version=1; COMMIT;`);
    this.db.prepare("UPDATE tasks SET status='INTERRUPTED' WHERE status='RUNNING'").run();
  }
  record(event: OrbitEvent, workspace: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (event.type === "agent.created")
        this.db
          .prepare("INSERT OR REPLACE INTO tasks VALUES(?,?,?,?,?)")
          .run(
            event.taskId,
            workspace,
            typeof event.data["request"] === "string" ? event.data["request"] : "",
            "RUNNING",
            event.at,
          );
      const status: Record<string, string> = {
        "agent.completed": "COMPLETED",
        "agent.failed": "FAILED",
        "agent.cancelled": "CANCELLED",
        "agent.timed_out": "TIMED_OUT",
      };
      if (status[event.type])
        this.db
          .prepare("UPDATE tasks SET status=?,updated=? WHERE id=?")
          .run(status[event.type]!, event.at, event.taskId);
      this.db.prepare("INSERT INTO events(task_id,payload) VALUES(?,?)").run(event.taskId, JSON.stringify(event));
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  history() {
    return this.db.prepare("SELECT * FROM tasks ORDER BY updated DESC LIMIT 200").all();
  }
  events(taskId: string) {
    return this.db
      .prepare("SELECT payload FROM events WHERE task_id=? ORDER BY id DESC LIMIT 500")
      .all(taskId)
      .reverse()
      .map((r) => JSON.parse(String(r["payload"])) as OrbitEvent);
  }
  markUndone(taskId: string, workspace: string) {
    this.db
      .prepare("UPDATE tasks SET status='UNDONE',updated=? WHERE id=? AND workspace=?")
      .run(Date.now(), taskId, workspace);
  }
  close() {
    this.db.close();
  }
}
