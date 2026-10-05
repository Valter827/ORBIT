import { knowledgeConflicts } from "./knowledge-conflicts.js";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { queryTerms, relevance } from "../ai/intelligence.js";
import { checkSignal } from "../ai/transport.js";
import { knowledgeAccessSQL } from "./knowledge-spaces.js";
import { knowledgeQueries } from "./knowledge-structure.js";
import type { EmbeddingBackend, KnowledgeHit } from "./knowledge.js";

export type KnowledgeSearchOptions = { mode?: string; project?: string; space?: string; type?: string; since?: number };
type ScoredHit = KnowledgeHit & { signals: { lexical: number; semantic: number; metadata: number; project: number } };
export async function searchKnowledge(
  db: DatabaseSync,
  profile: string,
  query: string,
  backend?: EmbeddingBackend,
  signal?: AbortSignal,
  options: KnowledgeSearchOptions = {},
) {
  checkSignal(signal);
  const fast = options.mode === "fast",
    queries = fast ? [query] : knowledgeQueries(query, options.mode === "deep");
  const candidates = new Map<string, ScoredHit>();
  const fields =
    "c.id,c.source AS sourceId,s.name,c.ordinal,c.text,c.section,c.symbol,c.line_start,c.line_end,c.page,s.updated";
  const filters = `${knowledgeAccessSQL} AND s.status='indexed' AND (?='' OR EXISTS(SELECT 1 FROM knowledge_membership km WHERE km.source=s.id AND km.space=?)) AND (?='' OR lower(s.name) LIKE ?) AND s.updated>=?`;
  const params = [
    profile,
    profile,
    options.space ?? "",
    options.space ?? "",
    options.type ?? "",
    "%." + (options.type ?? "").toLowerCase(),
    options.since ?? 0,
  ];
  const add = (row: Record<string, SQLOutputValue>, semantic = 0) => {
    const id = String(row["id"]),
      text = String(row["text"]),
      name = String(row["name"]);
    const metadata = Math.max(
      ...queries.map((q) => relevance(q, name + " " + String(row["section"]) + " " + String(row["symbol"]))),
    );
    const lexical = Math.max(...queries.map((q) => relevance(q, text)));
    const project =
      options.project &&
      db
        .prepare(
          "SELECT 1 FROM knowledge_membership m JOIN knowledge_spaces s ON s.id=m.space JOIN knowledge_access a ON a.space=s.id WHERE m.source=? AND s.project=? AND a.profile=?",
        )
        .get(String(row["sourceId"]), options.project, profile)
        ? 0.2
        : 0;
    const signals = {
      lexical,
      semantic: Math.max(candidates.get(id)?.signals.semantic ?? 0, semantic),
      metadata,
      project,
    };
    candidates.set(id, {
      id,
      sourceId: String(row["sourceId"]),
      name,
      ordinal: Number(row["ordinal"]),
      text,
      section: String(row["section"]),
      symbol: String(row["symbol"]),
      lineStart: Number(row["line_start"]),
      lineEnd: Number(row["line_end"]),
      page: row["page"] === null ? null : Number(row["page"]),
      signals,
      score: lexical + metadata * 0.5 + signals.semantic * 2 + (lexical || semantic ? project : 0),
    });
  };
  for (const q of queries) {
    const terms = queryTerms(q).slice(0, 24);
    if (!terms.length) continue;
    const match = terms.map((t) => '"' + t.replace(/"/g, '""') + '"').join(" OR ");
    for (const row of db
      .prepare(
        `SELECT ${fields},bm25(knowledge_fts) AS rank FROM knowledge_fts JOIN knowledge_chunks c ON c.rowid=knowledge_fts.rowid JOIN knowledge_sources s ON s.id=c.source WHERE knowledge_fts MATCH ? AND ${filters} ORDER BY rank LIMIT 100`,
      )
      .all(match, ...params))
      add(row);
  }
  let semanticUsed = false,
    warning: string | undefined;
  if (backend && !fast) {
    try {
      const vectors = await backend.embed([query.slice(0, 5000)], signal ?? AbortSignal.timeout(45000));
      checkSignal(signal);
      const vector = vectors[0]!;
      const norm = (v: number[]) => Math.sqrt(v.reduce((sum, n) => sum + n * n, 0));
      const ranked: Array<{ row: Record<string, SQLOutputValue>; score: number }> = [];
      for (const row of db
        .prepare(
          `SELECT ${fields},c.embedding FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source WHERE ${filters} AND c.backend=? LIMIT 10000`,
        )
        .all(...params, backend.identity)) {
        const parsed: unknown = JSON.parse(String(row["embedding"]));
        if (
          !Array.isArray(parsed) ||
          parsed.length !== vector.length ||
          !parsed.every((n) => typeof n === "number" && Number.isFinite(n))
        )
          continue;
        const numbers = parsed as number[];
        const score = numbers.reduce((sum, n, i) => sum + n * vector[i]!, 0) / (norm(numbers) * norm(vector) || 1);
        if (score >= 0.35) ranked.push({ row, score });
      }
      for (const r of ranked.sort((a, b) => b.score - a.score).slice(0, 100)) add(r.row, r.score);
      semanticUsed = ranked.length > 0;
      if (!semanticUsed) warning = "No matching embedding index; keyword search used.";
    } catch {
      checkSignal(signal);
      warning = "Embedding service unavailable; keyword search used.";
    }
  }
  // Reranking changes relevance only, never permissions or source truth.
  const pool = [...candidates.values()]
    .filter((c) => c.signals.lexical > 0 || c.signals.semantic >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, fast ? 8 : 20);
  const selected: ScoredHit[] = [],
    counts = new Map<string, number>();
  let chars = fast ? 1600 : 8000;
  const normalized = (text: string) => new Set(queryTerms(text));
  for (const item of pool) {
    const words = normalized(item.text);
    if (
      selected.some((s) => {
        if (knowledgeConflicts(query, [s, item]).length) return false;
        const previous = normalized(s.text);
        const intersection = [...words].filter((w) => previous.has(w)).length;
        return intersection / Math.max(1, words.size + previous.size - intersection) > 0.9;
      })
    )
      continue;
    if ((counts.get(item.sourceId) ?? 0) >= 2 || item.text.length > chars) continue;
    selected.push(item);
    counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
    chars -= item.text.length;
    if (selected.length >= (fast ? 2 : 6)) break;
  }
  return {
    strategy: semanticUsed ? ("hybrid" as const) : ("keyword" as const),
    sources: selected,
    diagnostics: { queries, candidates: candidates.size, reranked: pool.length },
    ...(warning ? { warning } : {}),
  };
}
