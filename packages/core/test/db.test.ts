import test from "node:test";
import assert from "node:assert/strict";
import { Database } from "../src/db/database.js";
import { PostgresAuditSink } from "../src/db/audit-repository.js";
import { MemoryRepository } from "../src/db/memory-repository.js";
import { UserRepository, ProjectRepository } from "../src/db/project-repository.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// These tests hit a real Postgres instance. If none is configured, skip
// rather than fake success — a green checkmark that never touched a
// database would be exactly the "fake functionality" this project forbids.
const describeOrSkip = DATABASE_URL ? test : test.skip;

function unitVector(seed: number, dim = 1536): number[] {
  const v = new Array<number>(dim).fill(0);
  v[seed % dim] = 1;
  return v;
}

/** Every run gets fresh users, so leftover rows from a previous run (this
 *  suite does not truncate between runs, deliberately — it exercises a real,
 *  persistent database) can never be mistaken for this run's data. */
const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

describeOrSkip("database connection is real and reachable", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    assert.equal(await db.ping(), true);
  } finally {
    await db.close();
  }
});

describeOrSkip("audit sink writes to Postgres and reads back what it wrote", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const userId = await users.ensureLocalUser(`integration-test-user-${runId}`);
    const audit = new PostgresAuditSink(db);

    await audit.record({
      userId,
      event: "tool.write",
      actor: "orbit",
      target: "src/auth/session.ts",
      detail: { risk: "MEDIUM" },
      at: Date.now(),
    });

    const recent = await audit.recent(userId, 5);
    assert.ok(recent.some((e) => e.event === "tool.write" && e.target === "src/auth/session.ts"));
  } finally {
    await db.close();
  }
});

describeOrSkip("ensureLocalUser is idempotent", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const a = await users.ensureLocalUser(`idempotent-test-user-${runId}`);
    const b = await users.ensureLocalUser(`idempotent-test-user-${runId}`);
    assert.equal(a, b);
  } finally {
    await db.close();
  }
});

describeOrSkip("project upsert does not duplicate on the same root path", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const projects = new ProjectRepository(db);
    const userId = await users.ensureLocalUser(`project-test-user-${runId}`);

    const first = await projects.upsert({
      userId,
      name: "DevMemory",
      rootPath: "/tmp/devmemory",
      stack: ["TypeScript"],
      fileCount: 10,
    });
    const second = await projects.upsert({
      userId,
      name: "DevMemory",
      rootPath: "/tmp/devmemory",
      stack: ["TypeScript", "Prisma"],
      fileCount: 12,
    });

    assert.equal(first.id, second.id);
    const list = await projects.listForUser(userId);
    assert.equal(list.filter((p) => p.rootPath === "/tmp/devmemory").length, 1);
    assert.deepEqual(second.stack.sort(), ["Prisma", "TypeScript"]);
  } finally {
    await db.close();
  }
});

describeOrSkip("pgvector actually ranks by similarity, not insertion order", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const memory = new MemoryRepository(db);
    const userId = await users.ensureLocalUser(`vector-test-user-${runId}`);

    // Insert the "far" vector first, "near" vector second — if the index
    // just returned insertion order this test would fail.
    await memory.remember({
      userId,
      kind: "technical",
      title: "Far",
      body: "unrelated fact",
      embedding: unitVector(500),
    });
    const nearId = await memory.remember({
      userId,
      kind: "technical",
      title: "Near",
      body: "the actual answer",
      embedding: unitVector(1),
    });
    await memory.remember({
      userId,
      kind: "technical",
      title: "Also far",
      body: "also unrelated",
      embedding: unitVector(900),
    });

    const results = await memory.recall(userId, unitVector(1), 2);
    assert.equal(results[0]!.id, nearId);
    assert.equal(results[0]!.title, "Near");
    assert.ok(results[0]!.distance < results[1]!.distance);
  } finally {
    await db.pool.query(`DELETE FROM "Memory" WHERE "userId" IN (SELECT id FROM "User" WHERE "displayName" = $1)`, [
      `vector-test-user-${runId}`,
    ]);
    await db.close();
  }
});

describeOrSkip("memory recall is scoped to the requesting user", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const memory = new MemoryRepository(db);
    const userA = await users.ensureLocalUser(`scope-test-user-a-${runId}`);
    const userB = await users.ensureLocalUser(`scope-test-user-b-${runId}`);

    await memory.remember({
      userId: userB,
      kind: "technical",
      title: "B's secret",
      body: "should not leak to A",
      embedding: unitVector(1),
    });
    const results = await memory.recall(userA, unitVector(1), 5);
    assert.ok(!results.some((r) => r.title === "B's secret"));
  } finally {
    await db.close();
  }
});

describeOrSkip("a malformed embedding dimension is rejected before it reaches the database", async () => {
  const db = new Database({ connectionString: DATABASE_URL });
  try {
    const users = new UserRepository(db);
    const memory = new MemoryRepository(db);
    const userId = await users.ensureLocalUser(`dim-test-user-${runId}`);
    await assert.rejects(() =>
      memory.remember({ userId, kind: "technical", title: "bad", body: "bad", embedding: [1, 2, 3] }),
    );
  } finally {
    await db.close();
  }
});
