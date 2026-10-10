-- ORBIT database schema, applied directly with psql.
--
-- WHY THIS FILE EXISTS: `prisma migrate` and `prisma generate` need to download
-- a query/schema-engine binary from binaries.prisma.sh on first use. That host
-- is not reachable from this environment's network policy (confirmed: even
-- `@prisma/engines`, the official npm wrapper, fails at the same postinstall
-- step). schema.prisma remains the single source of truth for the data model;
-- this file is a hand-derived, structurally faithful translation of it so the
-- database layer can be built and tested against a real Postgres instance
-- instead of an untested schema. When Prisma's CDN is reachable (a normal
-- developer machine, most CI runners), run `prisma migrate dev` instead and
-- retire this file.
--
-- Applied against: PostgreSQL 16.2 + pgvector 0.6.0, both installed and
-- running in this session (`service postgresql start`, `CREATE EXTENSION
-- vector`, `CREATE EXTENSION pg_trgm` — verified with \dx below).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── enums ──────────────────────────────────────────────────────────────

CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE "MemoryKind" AS ENUM ('user', 'project', 'technical', 'task', 'conversation');
CREATE TYPE "TaskStatus" AS ENUM ('planning', 'awaiting_approval', 'running', 'completed', 'failed', 'cancelled', 'denied', 'stopped');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "GrantMode" AS ENUM ('once', 'task', 'always', 'deny');

-- ─── identity ───────────────────────────────────────────────────────────

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "settings" JSONB NOT NULL DEFAULT '{}'
);

-- ─── workspace ──────────────────────────────────────────────────────────

CREATE TABLE "Project" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "rootPath" TEXT NOT NULL,
  "stack" TEXT[] NOT NULL DEFAULT '{}',
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  "lastScanAt" TIMESTAMPTZ,
  "healthScore" JSONB,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("userId", "rootPath")
);
CREATE INDEX "Project_userId_lastScanAt_idx" ON "Project" ("userId", "lastScanAt");

-- ─── conversation ───────────────────────────────────────────────────────

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation" ("userId", "updatedAt" DESC);
CREATE INDEX "Conversation_projectId_idx" ON "Conversation" ("projectId");

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message" ("conversationId", "createdAt");

-- ─── memory ─────────────────────────────────────────────────────────────

CREATE TABLE "Memory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE CASCADE,
  "kind" "MemoryKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "confidence" REAL NOT NULL DEFAULT 0.5,
  "sourceType" TEXT,
  "sourceRef" TEXT,
  "embedding" vector(1536),
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastUsedAt" TIMESTAMPTZ
);
CREATE INDEX "Memory_userId_kind_idx" ON "Memory" ("userId", "kind");
CREATE INDEX "Memory_projectId_kind_idx" ON "Memory" ("projectId", "kind");
CREATE INDEX "Memory_userId_lastUsedAt_idx" ON "Memory" ("userId", "lastUsedAt" DESC);
-- HNSW is pgvector's approximate index; fine at MVP scale, revisit past ~1M rows.
CREATE INDEX "Memory_embedding_hnsw_idx" ON "Memory" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "MemoryRelation" (
  "id" TEXT PRIMARY KEY,
  "fromId" TEXT NOT NULL REFERENCES "Memory"("id") ON DELETE CASCADE,
  "toId" TEXT NOT NULL REFERENCES "Memory"("id") ON DELETE CASCADE,
  "relation" TEXT NOT NULL,
  "weight" REAL NOT NULL DEFAULT 1,
  UNIQUE ("fromId", "toId", "relation")
);
CREATE INDEX "MemoryRelation_toId_idx" ON "MemoryRelation" ("toId");

-- ─── agent ──────────────────────────────────────────────────────────────

CREATE TABLE "AgentTask" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "conversationId" TEXT REFERENCES "Conversation"("id") ON DELETE SET NULL,
  "prompt" TEXT NOT NULL,
  "plan" JSONB,
  "status" "TaskStatus" NOT NULL DEFAULT 'planning',
  "stopReason" TEXT,
  "summary" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "undoManifest" JSONB,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finishedAt" TIMESTAMPTZ
);
CREATE INDEX "AgentTask_userId_startedAt_idx" ON "AgentTask" ("userId", "startedAt" DESC);
CREATE INDEX "AgentTask_status_idx" ON "AgentTask" ("status");

CREATE TABLE "AgentStep" (
  "id" TEXT PRIMARY KEY,
  "taskId" TEXT NOT NULL REFERENCES "AgentTask"("id") ON DELETE CASCADE,
  "index" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finishedAt" TIMESTAMPTZ,
  UNIQUE ("taskId", "index", "attempt")
);

-- ─── tools ──────────────────────────────────────────────────────────────

CREATE TABLE "Tool" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "domain" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "baseRisk" "RiskLevel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "ToolExecution" (
  "id" TEXT PRIMARY KEY,
  "toolId" TEXT NOT NULL REFERENCES "Tool"("id"),
  "taskId" TEXT REFERENCES "AgentTask"("id") ON DELETE CASCADE,
  "stepId" TEXT REFERENCES "AgentStep"("id") ON DELETE CASCADE,
  "action" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "risk" "RiskLevel" NOT NULL,
  "ok" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "diff" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "ToolExecution_taskId_createdAt_idx" ON "ToolExecution" ("taskId", "createdAt");
CREATE INDEX "ToolExecution_toolId_createdAt_idx" ON "ToolExecution" ("toolId", "createdAt" DESC);

-- ─── permissions & audit ────────────────────────────────────────────────

CREATE TABLE "Permission" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "taskId" TEXT REFERENCES "AgentTask"("id") ON DELETE CASCADE,
  "domain" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetScope" TEXT NOT NULL DEFAULT '*',
  "mode" "GrantMode" NOT NULL,
  "risk" "RiskLevel" NOT NULL,
  "reason" TEXT NOT NULL,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ
);
CREATE INDEX "Permission_userId_domain_action_idx" ON "Permission" ("userId", "domain", "action");
CREATE INDEX "Permission_expiresAt_idx" ON "Permission" ("expiresAt");

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "event" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "target" TEXT,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog" ("userId", "createdAt" DESC);
CREATE INDEX "AuditLog_event_createdAt_idx" ON "AuditLog" ("event", "createdAt" DESC);

-- ─── skills, integrations, context ──────────────────────────────────────

CREATE TABLE "Skill" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "builtIn" BOOLEAN NOT NULL DEFAULT true,
  "systemPrompt" TEXT NOT NULL
);

CREATE TABLE "_SkillTools" (
  "A" TEXT NOT NULL REFERENCES "Skill"("id") ON DELETE CASCADE,
  "B" TEXT NOT NULL REFERENCES "Tool"("id") ON DELETE CASCADE,
  PRIMARY KEY ("A", "B")
);

CREATE TABLE "GitHubConnection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "login" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT '{}',
  "keychainRef" TEXT NOT NULL,
  "connectedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastVerifiedAt" TIMESTAMPTZ
);

CREATE TABLE "BrowserSession" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "allowlist" TEXT[] NOT NULL DEFAULT '{}',
  "headless" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "endedAt" TIMESTAMPTZ
);

CREATE TABLE "ContextSnapshot" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE CASCADE,
  "taskId" TEXT UNIQUE REFERENCES "AgentTask"("id") ON DELETE CASCADE,
  "payload" JSONB NOT NULL,
  "provenance" JSONB NOT NULL DEFAULT '{}',
  "approxChars" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "ContextSnapshot_projectId_createdAt_idx" ON "ContextSnapshot" ("projectId", "createdAt" DESC);

CREATE TABLE "UsageRecord" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "taskKind" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "costUsd" NUMERIC(10, 6) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "UsageRecord_userId_createdAt_idx" ON "UsageRecord" ("userId", "createdAt" DESC);
CREATE INDEX "UsageRecord_userId_provider_createdAt_idx" ON "UsageRecord" ("userId", "provider", "createdAt");
