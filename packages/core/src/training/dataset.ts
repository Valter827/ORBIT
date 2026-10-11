import { createHash } from "node:crypto";
import { ExampleSchema, type DatasetExample } from "./types.js";
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const tokens = (s: string) => new Set(normalize(s).split(" ").filter(Boolean));
export function near(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b);
  const common = [...x].filter((t) => y.has(t)).length;
  return common / Math.max(1, x.size + y.size - common);
}
export function validateDataset(input: unknown[], benchmarks: string[] = []) {
  const examples = input.map((x) => ExampleSchema.parse(x));
  const issues: Array<{ id: string; reason: string; other?: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < examples.length; i++) {
    const a = examples[i]!;
    const prompt = a.messages.map((m) => m.content).join("\n");
    if (seen.has(a.id)) issues.push({ id: a.id, reason: "Duplicate ID" });
    seen.add(a.id);
    if (!scoreAnswer(a, a.answer)) issues.push({ id: a.id, reason: "Reference answer fails its own validator" });
    if (/(?:sk-ant-|ghp_[a-zA-Z0-9]{20}|BEGIN .*PRIVATE KEY|[\w.+-]+@[\w.-]+\.[a-z]{2,})/.test(prompt + " " + a.answer))
      issues.push({ id: a.id, reason: "Possible private/credential data" });
    for (let j = 0; j < i; j++) {
      const b = examples[j]!;
      const other = b.messages.map((m) => m.content).join("\n");
      if (normalize(prompt) === normalize(other))
        issues.push({ id: a.id, reason: "Exact prompt overlap", other: b.id });
      else if (near(prompt, other) >= 0.72)
        issues.push({ id: a.id, reason: "Near prompt overlap requires review", other: b.id });
      if (a.group === b.group && a.split !== b.split)
        issues.push({ id: a.id, reason: "Scenario family crosses split", other: b.id });
    }
    if (a.split !== "test")
      for (const b of benchmarks)
        if (normalize(prompt) === normalize(b) || near(prompt, b) >= 0.72)
          issues.push({ id: a.id, reason: "Existing benchmark contamination" });
  }
  const counts = Object.fromEntries(
    ["train", "validation", "test"].map((s) => [s, examples.filter((x) => x.split === s).length]),
  );
  for (const s of ["train", "validation", "test"])
    if (!counts[s]) issues.push({ id: s, reason: "Empty required split" });
  return {
    valid: issues.length === 0,
    issues,
    counts,
    categories: Object.fromEntries(
      [...new Set(examples.map((x) => x.category))].map((c) => [c, examples.filter((x) => x.category === c).length]),
    ),
    languages: Object.fromEntries(["en", "ru", "uk"].map((l) => [l, examples.filter((x) => x.language === l).length])),
    hash: hash(examples),
    examples,
  };
}
export function scoreAnswer(example: DatasetExample, text: string) {
  const { kind, required, forbidden } = example.expected;
  if (!text.trim() || forbidden.some((x) => text.toLowerCase().includes(x.toLowerCase()))) return false;
  if (kind === "exact") return text.trim() === example.answer.trim();
  if (kind === "json") {
    try {
      return JSON.stringify(JSON.parse(text)) === JSON.stringify(JSON.parse(example.answer));
    } catch {
      return false;
    }
  }
  return required.every((x) => text.toLowerCase().includes(x.toLowerCase()));
}
