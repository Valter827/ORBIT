import { searchKnowledge, type KnowledgeSearchOptions } from "./knowledge-search.js";
import { structuredChunks, stablePassageId, type Passage } from "./knowledge-structure.js";
import { migrateKnowledge, KnowledgeSpaces, knowledgeAccessSQL } from "./knowledge-spaces.js";
import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PathGuard } from "../security/path-guard.js";
import { readText } from "../tools/safe-fs.js";
import { redact } from "../security/redactor.js";
import { checkSignal, request, jsonBody } from "../ai/transport.js";
import { endpointFetch, validateEndpoint } from "../ai/endpoints.js";

export const KnowledgeLimits = z
  .object({
    fileBytes: z.number().int().min(1024).max(2_000_000).default(500_000),
    totalBytes: z.number().int().min(1024).max(20_000_000).default(5_000_000),
    files: z.number().int().min(1).max(500).default(100),
    chunks: z.number().int().min(1).max(10000).default(2000),
    exclude: z.array(z.string().min(1).max(200)).max(50).default([]),
  })
  .strict();
export interface EmbeddingBackend {
  readonly identity: string;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}
export class LocalEmbeddings implements EmbeddingBackend {
  readonly identity: string;
  constructor(
    readonly endpoint: string,
    readonly model: string,
  ) {
    validateEndpoint(endpoint, true);
    if (!model.trim() || model.length > 200) throw new Error("Choose an embedding model.");
    this.identity = endpoint + "#" + model;
  }
  async embed(texts: string[], signal?: AbortSignal) {
    const url = new URL("embeddings", this.endpoint.endsWith("/") ? this.endpoint : this.endpoint + "/");
    const response = await request(
      url.toString(),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
      },
      endpointFetch(new URL(this.endpoint), true),
    );
    const parsed = z
      .object({
        data: z.array(
          z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()).min(1).max(8192) }),
        ),
      })
      .parse(await jsonBody(response));
    const vectors = parsed.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== vectors[0]!.length))
      throw new Error("Embedding response dimensions do not match.");
    return vectors;
  }
}
export type KnowledgeHit = {
  id: string;
  sourceId: string;
  name: string;
  ordinal: number;
  text: string;
  score: number;
  section?: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  page?: number | null;
};
export type Retrieval = { strategy: "keyword" | "semantic" | "hybrid"; sources: KnowledgeHit[]; warning?: string };
const supported = new Set([
  ".txt",
  ".csv",
  ".pdf",
  ".docx",
  ".ini",
  ".conf",
  ".md",
  ".markdown",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".css",
  ".html",
  ".sql",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".sh",
  ".ps1",
]);
const blocked = new Set([
  ".git",
  ".cache",
  "coverage",
  "node_modules",
  "dist",
  "build",
  "target",
  ".ssh",
  ".aws",
  ".orbit",
  ".codex",
  ".idea",
]);
const secretName = (name: string) =>
  /^\.env(?:\.|$)|^(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)|\.(?:pem|key|pfx|p12|kdbx)$/i.test(name) ||
  [".npmrc", ".pypirc"].includes(name.toLowerCase());
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function ignored(relative: string, patterns: string[]) {
  const name = relative.replace(/\\/g, "/");
  return patterns.some((raw) => {
    const value = raw.trim();
    if (!value || value.startsWith("#") || value.startsWith("!")) return false;
    const pattern = value.replace(/^\//, "").replace(/\/$/, "");
    const expression = pattern
      .split("*")
      .map((v) => v.replace(/[.+?^$(){}|[\]\\]/g, "\\$&"))
      .join(".*");
    const rx = new RegExp("(^|/)" + expression + "($|/)", "i");
    return rx.test(name);
  });
}
export class KnowledgeLibrary {
  private embedding: EmbeddingBackend | undefined;
  private job:
    | {
        running: boolean;
        processed: number;
        indexed: number;
        unchanged: number;
        skipped: number;
        errors: string[];
        controller: AbortController;
        done?: Promise<void> | undefined;
      }
    | undefined;
  readonly spaces: KnowledgeSpaces;
  constructor(private readonly db: DatabaseSync) {
    migrateKnowledge(db);
    this.spaces = new KnowledgeSpaces(db);
    db.prepare("UPDATE knowledge_jobs SET state='Paused' WHERE state IN ('Queued','Indexing')").run();
  }
  setEmbedding(backend: EmbeddingBackend | undefined) {
    if (this.job?.running) throw new Error("Wait for indexing to finish.");
    this.embedding = backend;
  }
  status() {
    if (!this.job) return null;
    const { controller: _controller, done: _done, ...status } = this.job;
    void _controller;
    void _done;
    return status;
  }
  busy() {
    return !!this.job?.running;
  }
  cancel() {
    this.job?.controller.abort();
  }
  async close() {
    this.cancel();
    await this.job?.done;
  }
  list(profile: string) {
    return this.db
      .prepare(
        `SELECT id,profile,name,kind,bytes,hash,updated,modified,index_version,status,warning,source_path AS sourcePath,(SELECT COUNT(*) FROM knowledge_chunks WHERE source=s.id) AS chunkCount,(SELECT json_group_array(space) FROM knowledge_membership WHERE source=s.id) AS spaces FROM knowledge_sources s WHERE ${knowledgeAccessSQL} ORDER BY updated DESC`,
      )
      .all(profile, profile);
  }
  count(profile: string) {
    return this.list(profile).length;
  }
  remove(profile: string, id: string) {
    if (!this.db.prepare("SELECT id FROM knowledge_sources WHERE id=? AND profile=?").get(id, profile))
      throw new Error("Only the document owner may remove it.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "DELETE FROM knowledge_chunks WHERE source IN (SELECT id FROM knowledge_sources WHERE id=? AND profile=?)",
        )
        .run(id, profile);
      this.db.prepare("DELETE FROM knowledge_sources WHERE id=? AND profile=?").run(id, profile);
      this.db.prepare("DELETE FROM knowledge_membership WHERE source=?").run(id);
      this.pruneEmbeddingCache();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async put(
    profile: string,
    name: string,
    text: string,
    sourcePath = "",
    kind = "note",
    signal?: AbortSignal,
    limits = KnowledgeLimits.parse({}),
    structure?: Passage[],
  ) {
    checkSignal(signal);
    if (Buffer.byteLength(text) > limits.fileBytes) throw new Error("Knowledge file exceeds the size limit.");
    const safe = redact(text),
      digest = hash(structure ? JSON.stringify(structure) : text);
    const old = sourcePath
      ? this.db
          .prepare("SELECT id,hash,status,index_version FROM knowledge_sources WHERE profile=? AND source_path=?")
          .get(profile, sourcePath)
      : this.db
          .prepare(
            "SELECT id,hash,status,index_version FROM knowledge_sources WHERE profile=? AND name=? AND source_path=?",
          )
          .get(profile, name, sourcePath);
    if (
      old?.["hash"] === digest &&
      old["index_version"] === 2 &&
      old["status"] === "indexed" &&
      (!this.embedding ||
        Number(
          this.db
            .prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE source=? AND backend<>?")
            .get(String(old["id"]), this.embedding.identity)?.["n"] ?? 0,
        ) === 0)
    )
      return { id: String(old["id"]), unchanged: true };
    const passages = structure ?? structuredChunks(name, safe.text),
      parts = passages.map((p) => p.text),
      id = old ? String(old["id"]) : randomUUID();
    const existing = Number(
      this.db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE profile=? AND source<>?").get(profile, id)?.[
        "n"
      ] ?? 0,
    );
    if (existing + parts.length > limits.chunks)
      throw new Error("Knowledge chunk limit exceeded. Remove sources or increase the limit.");
    let vectors: number[][] = [],
      backend = "",
      warning = safe.redactions.length ? "Sensitive content excluded." : "";
    if (this.embedding && parts.length) {
      try {
        for (let i = 0; i < parts.length; i += 8) {
          checkSignal(signal);
          const batch = parts.slice(i, i + 8);
          for (const text of batch) {
            const cached = this.db
              .prepare("SELECT vector FROM knowledge_embedding_cache WHERE backend=? AND hash=? AND version=2")
              .get(this.embedding.identity, hash(text));
            vectors.push(
              cached
                ? z.array(z.number().finite()).parse(JSON.parse(String(cached["vector"])))
                : (await this.embedding.embed([text], signal ?? AbortSignal.timeout(45000)))[0]!,
            );
          }
        }
        backend = this.embedding.identity;
      } catch (e) {
        checkSignal(signal);
        vectors = [];
        warning += (warning ? " " : "") + "Embedding unavailable; keyword search is active.";
        void e;
      }
    }
    checkSignal(signal);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO knowledge_sources(id,profile,name,kind,source_path,bytes,hash,updated,status,warning) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(id, profile, name, kind, sourcePath, Buffer.byteLength(text), digest, Date.now(), "indexed", warning);
      this.db.prepare("DELETE FROM knowledge_chunks WHERE source=?").run(id);
      this.db.prepare("UPDATE knowledge_sources SET index_version=2 WHERE id=?").run(id);
      const insert = this.db.prepare(
        "INSERT INTO knowledge_chunks(id,source,profile,ordinal,text,embedding,backend,section,symbol,line_start,line_end,page) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      const occurrences = new Map<string, number>();
      passages.forEach((p, i) => {
        const key = hash(JSON.stringify([p.section, p.symbol, p.text])),
          occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        insert.run(
          stablePassageId(id, p, occurrence),
          id,
          profile,
          i,
          p.text,
          vectors[i] ? JSON.stringify(vectors[i]) : null,
          backend,
          p.section,
          p.symbol,
          p.lineStart,
          p.lineEnd,
          p.page,
        );
        if (vectors[i])
          this.db
            .prepare("INSERT OR REPLACE INTO knowledge_embedding_cache VALUES(?,?,2,?)")
            .run(backend, hash(p.text), JSON.stringify(vectors[i]));
      });
      this.pruneEmbeddingCache();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { id, unchanged: false };
  }
  private pruneEmbeddingCache() {
    this.db
      .prepare(
        "DELETE FROM knowledge_embedding_cache WHERE NOT EXISTS(SELECT 1 FROM knowledge_chunks c WHERE c.backend=knowledge_embedding_cache.backend AND c.embedding=knowledge_embedding_cache.vector)",
      )
      .run();
  }
  preview(profile: string, id: string) {
    const source = this.db
      .prepare(`SELECT id,name,kind,warning FROM knowledge_sources s WHERE id=? AND ${knowledgeAccessSQL}`)
      .get(id, profile, profile);
    if (!source) throw new Error("Knowledge source is outside this AI scope.");
    return {
      ...source,
      chunks: this.db
        .prepare(
          "SELECT id,ordinal,text,section,symbol,line_start AS lineStart,line_end AS lineEnd,page FROM knowledge_chunks WHERE source=? ORDER BY ordinal LIMIT 100",
        )
        .all(id),
    };
  }
  async retrieve(profile: string, query: string, signal?: AbortSignal, options: KnowledgeSearchOptions = {}) {
    return searchKnowledge(this.db, profile, query, this.embedding, signal, options);
  }
  ingest(profile: string, selected: string[], limitValue: unknown, spaces: string[] = [], resumeId?: string) {
    this.spaces.authorize(profile, spaces, true);
    if (this.busy()) throw new Error("Knowledge indexing is already running.");
    const limits = KnowledgeLimits.parse(limitValue),
      controller = new AbortController();
    const job = {
      running: true,
      processed: 0,
      indexed: 0,
      unchanged: 0,
      skipped: 0,
      errors: [] as string[],
      controller,
      done: undefined as Promise<void> | undefined,
    };
    const jobId = resumeId ?? randomUUID();
    this.db
      .prepare("INSERT OR REPLACE INTO knowledge_jobs VALUES(?,?,?,?,?,?,?)")
      .run(
        jobId,
        profile,
        JSON.stringify(selected),
        JSON.stringify(limits),
        JSON.stringify(spaces),
        "Queued",
        Date.now(),
      );
    this.job = job;
    job.done = (async () => {
      this.db.prepare("UPDATE knowledge_jobs SET state='Indexing',updated=? WHERE id=?").run(Date.now(), jobId);
      let files = 0,
        total = 0,
        entries = 0;
      try {
        for (const selectedPath of selected) {
          checkSignal(controller.signal);
          const selectedStat = await fs.lstat(selectedPath).catch(async (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") await this.removeMissing(profile, selectedPath);
            throw error;
          });
          if (selectedStat.isSymbolicLink()) throw new Error("Symbolic link sources are not supported.");
          const root = selectedStat.isDirectory() ? selectedPath : path.dirname(selectedPath),
            guard = new PathGuard({ roots: [root] });
          const gitignore = await readText(path.join(root, ".gitignore"), 32000)
            .then((r) => r.content.split(/\r?\n/))
            .catch(() => [] as string[]);
          const visit = async (file: string): Promise<void> => {
            checkSignal(controller.signal);
            if (++entries > 20000) throw new Error("Folder scan limit exceeded.");
            const name = path.basename(file),
              relative = path.relative(root, file);
            if (
              (name.startsWith(".") && relative !== "") ||
              blocked.has(name.toLowerCase()) ||
              secretName(name) ||
              ignored(relative, [...gitignore, ...limits.exclude])
            ) {
              job.skipped++;
              return;
            }
            const stat = await fs.lstat(file);
            if (stat.isSymbolicLink()) {
              job.skipped++;
              return;
            }
            if (stat.isDirectory()) {
              for await (const entry of await fs.opendir(file)) await visit(path.join(file, entry.name));
              return;
            }
            if (!stat.isFile() || !supported.has(path.extname(name).toLowerCase())) {
              job.skipped++;
              return;
            }
            if (++files > limits.files) throw new Error("Import file count limit exceeded.");
            if (stat.size > limits.fileBytes || total + stat.size > limits.totalBytes) {
              job.skipped++;
              job.errors.push(name + ": size limit exceeded");
              return;
            }
            total += stat.size;
            job.processed++;
            try {
              const canonical = await guard.validate(file, "read");
              const structured = [".pdf", ".docx"].includes(path.extname(canonical).toLowerCase())
                ? await (
                    await import("./knowledge-parse.js")
                  ).parseDocumentIsolated(canonical, limits.fileBytes, controller.signal)
                : undefined;
              const text = structured ? { content: structured.text } : await readText(canonical, limits.fileBytes);
              checkSignal(controller.signal);
              const updated = await this.put(
                profile,
                relative || name,
                text.content,
                canonical,
                "file",
                controller.signal,
                limits,
                structured?.passages,
              );
              this.db
                .prepare("UPDATE knowledge_sources SET modified=?,bytes=? WHERE id=?")
                .run(stat.mtimeMs, stat.size, updated.id);
              if (structured?.warning)
                this.db
                  .prepare("UPDATE knowledge_sources SET warning=? WHERE id=?")
                  .run(structured.warning, updated.id);
              if (spaces.length) this.spaces.assign(profile, updated.id, spaces);
              if (updated.unchanged) job.unchanged++;
              else job.indexed++;
            } catch (e) {
              checkSignal(controller.signal);
              this.db
                .prepare(
                  "UPDATE knowledge_sources SET status='failed',warning='Re-index failed; previous content is not used until a successful retry.' WHERE profile=? AND source_path=?",
                )
                .run(profile, file);
              job.errors.push(
                name + ": " + (e instanceof Error ? redact(e.message).text : "File could not be indexed"),
              );
            }
            await new Promise<void>((r) => setImmediate(r));
          };
          await visit(selectedPath);
          await this.removeMissing(profile, selectedPath);
          if (selectedStat.isDirectory())
            this.db
              .prepare("INSERT OR REPLACE INTO knowledge_links VALUES(?,?,?)")
              .run(profile, selectedPath, JSON.stringify(spaces));
        }
      } catch (e) {
        job.errors.push(
          controller.signal.aborted
            ? "Indexing cancelled."
            : e instanceof Error
              ? redact(e.message).text
              : "Indexing failed.",
        );
      } finally {
        job.running = false;
        this.db
          .prepare("UPDATE knowledge_jobs SET state=?,updated=? WHERE id=?")
          .run(controller.signal.aborted ? "Paused" : job.errors.length ? "Failed" : "Ready", Date.now(), jobId);
      }
    })();
    return this.status();
  }
  jobs(profile: string) {
    return this.db
      .prepare("SELECT id,state,updated FROM knowledge_jobs WHERE profile=? ORDER BY updated DESC LIMIT 50")
      .all(profile);
  }
  resume(profile: string, id: string) {
    const row = this.db
      .prepare("SELECT * FROM knowledge_jobs WHERE id=? AND profile=? AND state IN ('Paused','Failed')")
      .get(id, profile);
    if (!row) throw new Error("No recoverable indexing job.");
    const paths = z.array(z.string()).parse(JSON.parse(String(row["paths"]))),
      spaces = z.array(z.string()).parse(JSON.parse(String(row["spaces"])));
    return this.ingest(profile, paths, JSON.parse(String(row["limits"])), spaces, id);
  }
  private async removeMissing(profile: string, selected: string) {
    // Stored source paths are canonical; normalize existing ancestors even
    // when the selected document itself has already been deleted.
    const canonical = async (file: string): Promise<string> => {
      try {
        return await fs.realpath(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path.dirname(file) === file) throw error;
        return path.join(await canonical(path.dirname(file)), path.basename(file));
      }
    };
    const root = await canonical(path.resolve(selected));
    for (const row of this.db
      .prepare("SELECT id,source_path FROM knowledge_sources WHERE profile=? AND source_path<>''")
      .all(profile)) {
      const file = path.resolve(String(row["source_path"])),
        relative = path.relative(root, file);
      if (file !== root && (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)))
        continue;
      try {
        await fs.lstat(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") this.remove(profile, String(row["id"]));
        else throw error;
      }
    }
  }
  reindex(profile: string, id: string, limits: unknown) {
    const row = this.db.prepare("SELECT source_path FROM knowledge_sources WHERE id=? AND profile=?").get(id, profile);
    if (!row) throw new Error("Knowledge source not found.");
    if (!row["source_path"])
      throw new Error("Imported snapshots and notes have no external file. Replace the note to update it.");
    const spaces = this.db
      .prepare("SELECT space FROM knowledge_membership WHERE source=?")
      .all(id)
      .map((r) => String(r["space"]));
    return this.ingest(profile, [String(row["source_path"])], limits, spaces);
  }
  manifest(profile: string, source: { name: string; kind: string; hash: string }) {
    this.db
      .prepare(
        "INSERT INTO knowledge_sources(id,profile,name,kind,source_path,bytes,hash,updated,status,warning) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        profile,
        source.name,
        source.kind,
        "",
        0,
        source.hash,
        Date.now(),
        "content not included",
        "Re-add the original source to use this knowledge.",
      );
  }
  portable(profile: string, includeContent: boolean) {
    return this.list(profile).map((r) => ({
      name: String(r["name"]),
      kind: String(r["kind"]),
      hash: String(r["hash"]),
      ...(includeContent
        ? {
            text: this.db
              .prepare("SELECT text FROM knowledge_chunks WHERE source=? ORDER BY ordinal")
              .all(String(r["id"]))
              .map((c, i) => String(c["text"]).slice(Number(r["index_version"]) === 1 && i ? 200 : 0))
              .join(Number(r["index_version"]) === 1 ? "" : "\n"),
          }
        : {}),
    }));
  }
}
