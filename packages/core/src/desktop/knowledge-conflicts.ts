import type { KnowledgeHit } from "./knowledge.js";
import { relevance } from "../ai/intelligence.js";

/** Compare explicit same-subject claims without deciding which source is true. */
export function knowledgeConflicts(query: string, sources: KnowledgeHit[]) {
  const groups = new Map<string, Array<KnowledgeHit & { value: string }>>();
  for (const source of sources)
    for (const line of source.text.split(/\n|(?<=[.!?])\s+/u)) {
      const match = /^\s*([^#\n]{3,120}?)\s+(?:is|uses|=|—|это|використовує|использует)\s+(.{1,160}?)\s*[.!]?$/iu.exec(
        line,
      );
      if (!match || relevance(query, line) <= 0) continue;
      const subject = match[1]!.toLowerCase().replace(/\s+/g, " ").trim();
      const value = match[2]!
        .toLowerCase()
        .replace(/[.!]+$/, "")
        .trim();
      const group = groups.get(subject) ?? [];
      group.push({ ...source, text: line.trim(), value });
      groups.set(subject, group);
    }
  return [...groups.values()]
    .filter((group) => new Set(group.map((s) => s.sourceId)).size > 1 && new Set(group.map((s) => s.value)).size > 1)
    .flat()
    .slice(0, 6)
    .map(({ value: _value, ...source }) => {
      void _value;
      return source;
    });
}
