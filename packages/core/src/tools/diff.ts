/** Linear-space/time prefix/suffix diff. The changed middle is replaced as a block.
 * Deliberately non-minimal: predictable bounds matter more than shortest edits. */
export interface DiffLine {
  kind: "context" | "add" | "del";
  text: string;
}
export function diffLines(before: string, after: string): DiffLine[] {
  if (Buffer.byteLength(before) + Buffer.byteLength(after) > 4_000_000) throw new Error("Diff size limit exceeded");
  const split = (s: string) => (s ? s.replace(/\n$/, "").split("\n") : []);
  const a = split(before),
    b = split(after);
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "context", text: a[i]! });
  for (let i = start; i < a.length - end; i++) out.push({ kind: "del", text: a[i]! });
  for (let i = start; i < b.length - end; i++) out.push({ kind: "add", text: b[i]! });
  for (let i = a.length - end; i < a.length; i++) out.push({ kind: "context", text: a[i]! });
  if (start === a.length && start === b.length && before.endsWith("\n") !== after.endsWith("\n"))
    out.push({ kind: after.endsWith("\n") ? "add" : "del", text: "[final newline]" });
  return out;
}
export function formatUnifiedish(lines: DiffLine[]): string {
  return lines.map((l) => (l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  ") + l.text).join("\n");
}
export function stats(lines: DiffLine[]): { insertions: number; deletions: number } {
  return {
    insertions: lines.filter((l) => l.kind === "add").length,
    deletions: lines.filter((l) => l.kind === "del").length,
  };
}
