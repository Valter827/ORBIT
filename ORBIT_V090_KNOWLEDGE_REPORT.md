# ORBIT 0.9 KNOWLEDGE 2.0 REPORT

Version: **0.9.0**. COSMO remains **1.0**. Date: 2026-10-05.

Knowledge implementation and real local acceptance are delivered in source form. **The Windows EXE delivery goal is not completed:** Application Control blocked the final fresh Rust build. No older binary is presented as 0.9.

| Area | Status |
| --- | --- |
| Knowledge Spaces | PASS |
| AI Space Permissions | PASS |
| Project Knowledge | PASS |
| PDF | PARTIAL — real text/page extraction; no OCR/layout guarantee |
| DOCX | PARTIAL — headings, paragraphs, table text; layout partial |
| Markdown | PASS |
| Code-aware Indexing | PASS — heuristic symbols and source lines |
| Folder Ingestion | PASS — real core; native picker blocked |
| Incremental Indexing | PASS |
| File Watcher | NOT IMPLEMENTED |
| Deletion Cleanup | PASS |
| Duplicate Detection | PASS |
| Keyword Search | PASS |
| Real Embeddings | PASS — embeddinggemma:300m |
| Hybrid Retrieval | PASS |
| Reranking | PASS |
| Query Rewriting | PASS — bounded deterministic cases |
| Multi-document Answers | PASS |
| Source Citations 2.0 | PASS — actual retrieved spans and locations |
| Source Preview | PASS — production browser UI |
| Knowledge Conflict Handling | PASS — tested exact-subject disagreements; general detection is limited |
| Large Knowledge | PASS — 10,000-chunk lexical benchmark |
| Knowledge Isolation | PASS |
| Memory 2.0 Regression | PASS |
| Intelligence Regression | PASS — core/browser scenarios; native Sense BLOCKED |
| Security Regression | PASS — automated boundaries; native credential check NOT VERIFIED |
| Windows Build | BLOCKED |
| ORBIT.exe | NOT PRODUCED |
| Native EXE Acceptance | BLOCKED |
| Installer | NOT PRODUCED |
| Native Installer Acceptance | BLOCKED |
| Desktop Shortcut | NOT VERIFIED |
| Start Menu | NOT VERIFIED |
| Portable Build | NOT PRODUCED |
| Portable Acceptance | NOT PRODUCED |
| Signing | UNSIGNED — no trusted signing identity |

## Tests and real evidence

npm test: **284 PASS / 0 FAIL / 11 SKIP**. Release pipeline: **3 PASS / 0 FAIL / 0 SKIP**. npm ci, typecheck, lint, format:check and frontend:build passed. npm reported zero dependency vulnerabilities. Existing optional lifecycle-script warnings were not bypassed.

- [Real Knowledge acceptance](validation/knowledge-real-acceptance.json): all nine scenarios passed with actual Ollama/gemma3:4b, including a unique fact, two-source answer, code symbol/location, duplicate suppression/rerank, update/delete, isolation, restart, document disagreement and real embeddinggemma paraphrase retrieval. The deterministic conflict guard preserves exact source claims after generation/verification; it is not a second model pretending to verify truth.
- [Folder definition-of-done scenario](validation/knowledge-folder-acceptance.json): imported a controlled ORBIT folder containing the actual chooseModel implementation excerpt and its documentation, asked in Russian where Smart Brain is implemented, retrieved code plus documentation, then refreshed a changed file. The unrelated source timestamp remained unchanged and OLD_VALUE disappeared from retrieval.
- [Memory regression](validation/knowledge-memory-regression.json): all ten real local scenarios passed, including explicit saving, conflict/supersession, project continuity, AI isolation, forgetting/restart and automatic-category controls.
- [UI acceptance](validation/knowledge-ui-acceptance.json): production frontend/core with real Ollama; chat focus/input, rendering, Settings, dialogs, Web consent/citation, Memory and Knowledge Spaces/search/preview passed. Layout checked at 1100, 1440 and 1920 px. This is explicitly a browser transport harness, not native EXE acceptance.
- [Intelligence regression](validation/knowledge-intelligence-regression-acceptance.json): Fast, Balanced Knowledge, Memory/current-input precedence, Deep evidence handling, Verify, restart, real streaming, real request cancellation and Local Only passed. Smart Brain kept the completion-capable model; embedding-only models are now excluded by discovered capability metadata. Sense native acceptance is BLOCKED; unit security regressions passed. Local Agent remains UNSUPPORTED for gemma3 tool calling.
- [Packaged parser](validation/knowledge-packaged-parser.json): real PDF text/page extraction from production parser resources copied outside the repository. This verifies a packaged core component, not portable ORBIT.exe.
- [Performance](validation/knowledge-performance.json): 200 generated documents, **10,000 chunks**, indexing **760.54 ms**, 20 exact lexical queries **0.43–1.48 ms**, SQLite **6,103,040 bytes**, observed RSS about **61.4 → 71.2 MB**. This is a controlled short-text benchmark; large semantic/PDF performance is not established.

Real embeddings use the explicitly approved [embeddinggemma:300m](https://ollama.com/library/embeddinggemma), approximately 622 MB, from the official Ollama registry. Its vectors were actually generated and queried. The first cold-start attempt fell back to keywords and failed acceptance; a bounded 45-second embedding timeout addressed startup, and the recorded final run passed. Chat and embedding models remain independent. Model files are not in the delivery ZIP.

## Architecture and safety

Existing Knowledge is extended rather than replaced: private legacy migration, explicit Space grants, optional project relevance, atomic per-document replacement, durable paused/recoverable jobs, indexed lexical candidates, optional vector candidates and bounded deterministic reranking. Stable IDs retain unchanged sections. PDF/DOCX parsers have size/page/archive limits and run in a worker with memory and time limits.

Original files are untouched by index removal. Existing Path Guard, secret redaction, profile isolation, Local Only, Memory, Sense permission boundaries and tool authorization remain in place. Retrieved documents are data, not authority. No Pilot or unrestricted control was added.

Limits: no file watcher, native drag-and-drop, dedicated Space metadata export or external editor integration. Root ignore patterns are conservative; nested .gitignore semantics and full language ASTs are not implemented. PDF OCR/complex layout and exact DOCX table mapping are not claimed. Query rewriting and conflict detection are bounded heuristics, not universal semantic understanding. General answers still depend on model/source quality.

The 514.47 KB frontend chunk advisory was reviewed. No risky route rewrite was made solely to remove a non-fatal size warning.

## Windows build and artifact integrity

[Build log](validation/knowledge-windows-build.log): Windows refused cssparser_macros-38970708382d7324.dll with **Application Control error 4551** while compiling the 0.9 Rust build script. Existing release EXE artifacts were moved into a timestamped pre-build archive before compilation, so a stale executable cannot masquerade as a fresh release.

No security policy was disabled, binaries renamed to evade policy, or trusted publisher status claimed. The Windows UI automation kernel separately failed to initialize twice with sandbox setup refresh errors. Consequently no native input/focus, picker, credential, Sense, installer, shortcut, Start Menu, uninstall or portable acceptance is claimed.

Installed EXE: **No installed 0.9 executable verified.**
Portable EXE: **NOT PRODUCED.**
Installer: **NOT PRODUCED.**
SHA-256 for ORBIT.exe / installer / portable: **NOT PRODUCED — no final 0.9 binaries exist.**

The 0.8 artifacts delivered earlier remain an older release. Creating an EXE or portable wrapper from them would not meet this request.

[Machine-readable delivery status](validation/knowledge-delivery-status.json) records the blockers. Source/evidence archive hashes are provided separately in ORBIT-0.9.0-SHA256.json.

## Documentation and remaining work

[Knowledge 2.0 guide](docs/KNOWLEDGE_2.md) documents Spaces, permissions, formats, folders, jobs, embeddings, budgets, previews, privacy and removal.

To finish Windows delivery, the unchanged final source needs a Windows build environment where organizational policy permits the Rust build dependencies. After a successful fresh build, produce installer and portable resources from that same EXE, then complete the native acceptance scenarios. This report does not mark the overall release definition of done as completed.
