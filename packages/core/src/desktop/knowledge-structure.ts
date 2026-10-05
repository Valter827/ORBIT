import path from "node:path";
import { createHash } from "node:crypto";

export interface Passage {
  text: string;
  section: string;
  symbol: string;
  lineStart: number;
  lineEnd: number;
  page: number | null;
}

/** Bounded, line-preserving segmentation. Symbol detection is heuristic, not an AST. */
export function structuredChunks(name: string, text: string): Passage[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const markdown = /\.(md|markdown)$/i.test(name);
  const code = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h)$/i.test(path.extname(name));
  const result: Passage[] = [];
  let section = "",
    symbol = "",
    start = 1,
    buffer: string[] = [],
    length = 0,
    fence = false;
  const headings: string[] = [];
  const flush = (end: number) => {
    const value = buffer.join("\n");
    if (value.trim()) result.push({ text: value, section, symbol, lineStart: start, lineEnd: end, page: null });
    buffer = [];
    length = 0;
    start = end + 1;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = markdown && !fence ? /^(#{1,6})\s+(.+)$/.exec(line) : null;
    const definition = code
      ? /^\s*(?:export\s+)?(?:default\s+)?(?:pub\s+)?(?:async\s+)?(?:function|class|interface|type|def|fn|func)\s+([\p{L}\p{N}_$]+)/u.exec(
          line,
        )
      : null;
    if (heading || definition) {
      flush(i);
      if (heading) {
        headings.length = heading[1]!.length - 1;
        headings.push(heading[2]!);
        section = headings.filter(Boolean).join(" / ");
      }
      if (definition) symbol = definition[1]!;
    }
    if (length + line.length > 1600 && buffer.length) flush(i);
    // Very long minified lines remain bounded, with the original line location retained.
    for (let offset = 0; offset < Math.max(1, line.length); offset += 1600) {
      if (offset) flush(i + 1);
      if (!buffer.length) start = i + 1;
      buffer.push(line.slice(offset, offset + 1600));
      length += Math.min(1600, line.length - offset) + 1;
    }
    if (markdown && /^\s*(```|~~~)/.test(line)) fence = !fence;
  }
  flush(lines.length);
  return result;
}

export function stablePassageId(document: string, passage: Passage, occurrence: number) {
  return createHash("sha256")
    .update(JSON.stringify([document, passage.section, passage.symbol, passage.page, passage.text, occurrence]))
    .digest("hex");
}

/** Query expansion is local and bounded; original words are always retained. */
export function knowledgeQueries(query: string, deep = false): string[] {
  const queries = [query];
  if (/github/i.test(query) && /вход|авториза|login|auth|вхід/i.test(query))
    queries.push("GitHub OAuth callback authentication login");
  if (/smart\s*brain/i.test(query) && /где|де|where|реализ|працю|работ/i.test(query))
    queries.push("chooseModel Smart Brain intelligence routing");
  return queries.slice(0, deep ? 3 : 2);
}
