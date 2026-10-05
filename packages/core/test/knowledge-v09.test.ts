import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AIHub } from "../src/desktop/ai-hub.js";
import { createProfile } from "../src/ai/profiles.js";
import { structuredChunks } from "../src/desktop/knowledge-structure.js";
import JSZip from "jszip";
import { parseDocument } from "../src/desktop/knowledge-documents.js";
import { KnowledgeLibrary } from "../src/desktop/knowledge.js";
import { knowledgeConflicts } from "../src/desktop/knowledge-conflicts.js";

async function setup(t: test.TestContext) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-knowledge09-"));
  const hub = new AIHub(base, () => {}),
    a = createProfile("A"),
    b = createProfile("B");
  hub.store.saveProfile(a);
  hub.store.saveProfile(b);
  t.after(async () => {
    await hub.shutdown();
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, hub, a, b };
}
async function indexed(hub: AIHub) {
  while (hub.knowledge.busy()) await new Promise((r) => setTimeout(r, 5));
}

test("Interrupted indexing remains Paused until an explicit authorized resume", async (t) => {
  const { base, hub, a } = await setup(t),
    file = path.join(base, "recover.md");
  await fs.writeFile(file, "RecoveryHeliosUnique");
  const id = "a390446f-99dc-4674-ae1d-5b29b7b5a9df";
  hub.store.db
    .prepare("INSERT INTO knowledge_jobs VALUES(?,?,?,?,?,?,?)")
    .run(id, a.id, JSON.stringify([file]), "{}", "[]", "Indexing", Date.now());
  const recovered = new KnowledgeLibrary(hub.store.db);
  assert.equal(recovered.jobs(a.id)[0]?.["state"], "Paused");
  assert.equal((await recovered.retrieve(a.id, "RecoveryHeliosUnique")).sources.length, 0);
  recovered.resume(a.id, id);
  while (recovered.busy()) await new Promise((r) => setTimeout(r, 5));
  assert.equal(recovered.jobs(a.id)[0]?.["state"], "Ready");
  assert.equal((await recovered.retrieve(a.id, "RecoveryHeliosUnique")).sources.length, 1);
});

test("Near duplicate removal retains explicit conflicting values with source binding", async (t) => {
  const { hub, a } = await setup(t),
    common =
      "architecture storage decision deployment reliable system service application module release project ".repeat(3);
  await hub.knowledge.put(a.id, "old.md", common + "\nThe project database is PostgreSQL.");
  await hub.knowledge.put(a.id, "new.md", common + "\nThe project database is SQLite.");
  const result = await hub.knowledge.retrieve(a.id, "What is the project database?");
  assert.equal(result.sources.length, 2);
  const conflicts = knowledgeConflicts("What is the project database?", result.sources);
  assert.equal(conflicts.length, 2);
  assert.ok(conflicts.every((s) => s.text.startsWith("The project database is")));
});

test("Knowledge spaces enforce access for search and previews, including revocation", async (t) => {
  const { hub, a, b } = await setup(t),
    k = hub.knowledge;
  const space = k.spaces.create(a.id, { name: "ORBIT", project: "project-a" });
  const doc = await k.put(a.id, "architecture.md", "# Queue\nThe cobalt module uses Helios queue.");
  k.spaces.assign(a.id, doc.id, [space.id]);
  assert.equal((await k.retrieve(b.id, "Helios")).sources.length, 0);
  assert.throws(() => k.preview(b.id, doc.id), /scope/);
  assert.throws(() => k.spaces.access(b.id, space.id, [b.id]), /scope/);
  k.spaces.access(a.id, space.id, [b.id]);
  assert.equal((await k.retrieve(b.id, "Helios")).sources.length, 1);
  assert.ok(k.preview(b.id, doc.id).chunks.length);
  assert.throws(() => k.remove(b.id, doc.id), /owner/);
  k.spaces.access(a.id, space.id, []);
  assert.equal((await k.retrieve(b.id, "Helios")).sources.length, 0);
});
test("Structured Markdown and code keep sections, symbols and exact line ranges", () => {
  const md = structuredChunks("guide.md", "# Main\nFirst\n## Queue\nHelios jobs\n```ts\n# not a header\n```\n");
  assert.equal(md[1]?.section, "Main / Queue");
  assert.equal(md[1]?.lineStart, 3);
  const code = structuredChunks(
    "risk.ts",
    "// risk\nexport function calculateOrbitRisk() {\n return 7;\n}\nexport interface Job {id:string}",
  );
  assert.equal(code[1]?.symbol, "calculateOrbitRisk");
  assert.equal(code[1]?.lineStart, 2);
  assert.equal(code[1]?.lineEnd, 4);
  assert.ok(structuredChunks("long.txt", "x".repeat(5000)).every((p) => p.text.length <= 1600));
});
test("Stable chunk IDs survive unrelated section changes and renamed files do not duplicate", async (t) => {
  const { hub, a } = await setup(t),
    k = hub.knowledge;
  const first = await k.put(a.id, "one.md", "# A\nStable Helios\n# B\nOLD_VALUE", "C:/controlled/one.md");
  const stable = k.preview(a.id, first.id).chunks[0]!["id"];
  const next = await k.put(a.id, "renamed-display.md", "# A\nStable Helios\n# B\nNEW_VALUE", "C:/controlled/one.md");
  assert.equal(first.id, next.id);
  assert.equal(k.count(a.id), 1);
  assert.equal(k.preview(a.id, first.id).chunks[0]!["id"], stable);
  assert.equal((await k.retrieve(a.id, "OLD_VALUE")).sources.length, 0);
  assert.ok((await k.retrieve(a.id, "NEW_VALUE")).sources.length);
});
test("Folder refresh removes deleted content, respects hidden/secret/generated exclusions", async (t) => {
  const { base, hub, a } = await setup(t),
    root = path.join(base, "files");
  await fs.mkdir(root);
  const doc = path.join(root, "note.md");
  await fs.writeFile(doc, "UniqueHeliosDeletion");
  await fs.writeFile(path.join(root, ".private.txt"), "HiddenValue");
  await fs.writeFile(path.join(root, ".env"), "PASSWORD=secretvalue");
  hub.knowledge.ingest(a.id, [root], {});
  await indexed(hub);
  assert.equal(hub.knowledge.count(a.id), 1);
  await fs.unlink(doc);
  hub.knowledge.ingest(a.id, [root], {});
  await indexed(hub);
  assert.equal((await hub.knowledge.retrieve(a.id, "UniqueHeliosDeletion")).sources.length, 0);
  assert.equal(hub.knowledge.jobs(a.id)[0]?.["state"], "Ready");
});
test("Embedding cache and hybrid retrieval use both lexical and semantic candidates", async (t) => {
  const { hub, a, b } = await setup(t),
    k = hub.knowledge;
  let calls = 0;
  k.setEmbedding({
    identity: "test-embedding",
    embed: async (texts) => {
      calls += texts.length;
      return texts.map((text) => (text.includes("distractor") ? [0, 1] : [1, 0]));
    },
  });
  await k.put(a.id, "a.md", "Helios bounded background queue");
  const after = calls;
  await k.put(a.id, "duplicate.md", "Helios bounded background queue");
  assert.equal(calls, after);
  await k.put(b.id, "private.md", "Helios private secret project");
  const result = await k.retrieve(a.id, "bounded queue");
  assert.equal(result.strategy, "hybrid");
  assert.equal(result.sources.length, 1);
  assert.ok(!result.sources.some((s) => s.name === "private.md"));
  assert.ok(result.diagnostics.reranked <= 20);
});
test("Deleting a space deletes orphan index only and preserves other memberships", async (t) => {
  const { hub, a } = await setup(t),
    k = hub.knowledge,
    s1 = k.spaces.create(a.id, { name: "One" }),
    s2 = k.spaces.create(a.id, { name: "Two" });
  const doc = await k.put(a.id, "fact.md", "Helios current fact");
  k.spaces.assign(a.id, doc.id, [s1.id, s2.id]);
  assert.throws(() => k.spaces.remove(a.id, s1.id, false), /Confirm/);
  k.spaces.remove(a.id, s1.id, true);
  assert.equal((await k.retrieve(a.id, "Helios")).sources.length, 1);
  k.spaces.remove(a.id, s2.id, true);
  assert.equal((await k.retrieve(a.id, "Helios")).sources.length, 0);
});

test("Real DOCX parsing preserves headings and table text without external resources", async (t) => {
  const { base, hub, a } = await setup(t);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Architecture</w:t></w:r></w:p><w:p><w:r><w:t>The cobalt module uses the Helios queue.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Queue</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Helios</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  );
  const file = path.join(base, "architecture.docx");
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  const parsed = await parseDocument(file, 500000);
  assert.match(parsed.text, /Helios/);
  assert.ok(parsed.passages.some((p) => p.section === "Architecture"));
  hub.knowledge.ingest(a.id, [file], {});
  await indexed(hub);
  assert.equal(hub.knowledge.status()?.errors.length, 0);
  assert.ok((await hub.knowledge.retrieve(a.id, "Helios")).sources.some((s) => s.section === "Architecture"));
});

test("Real PDF text parsing preserves page citation and indexes extracted content", async (t) => {
  const { base, hub, a } = await setup(t);
  const text = "BT /F1 12 Tf 72 700 Td (ORBIT PDF Helios queue on page one.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const file = path.join(base, "architecture.pdf");
  await fs.writeFile(file, pdf);
  const parsed = await parseDocument(file, 500000);
  assert.match(parsed.text, /Helios/);
  assert.equal(parsed.passages[0]?.page, 1);
  hub.knowledge.ingest(a.id, [file], {});
  await indexed(hub);
  assert.equal(hub.knowledge.status()?.errors.length, 0);
  assert.equal((await hub.knowledge.retrieve(a.id, "Helios")).sources[0]?.page, 1);
});
