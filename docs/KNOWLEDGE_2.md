# Knowledge 2.0 — ORBIT 0.9.0

Knowledge contains document evidence. Memory contains preferences, decisions, goals and project continuity. Importing documents does not create Personal Memory automatically. COSMO remains 1.0.

## Spaces and access
Open Knowledge and create a named Space. Choose its optional project path to associate it with the current project. Select one or more Spaces before adding files, a folder or a note. With no Space selected, a new source remains private to that AI. Existing legacy sources migrate to private owner Spaces without being shared with other AIs.

Manage access lists the AIs allowed to retrieve that Space. Grants are explicit; access revocation also blocks source previews. Shared readers cannot remove or reassign the owner's source. Document spaces can be changed by the owner. Project association improves relevance only after access checks; it never grants access.

## Adding information
Add files uses the existing desktop file picker; Add folder / project uses its folder picker. The core scanner supports UTF-8 TXT, Markdown, CSV, JSON, common configuration and source-code files. JSON/CSV/configuration are indexed as readable text, not executed.

PDF text extraction preserves page numbers. Scanned PDFs requiring OCR, complex reading order and exact layout are not supported. DOCX preserves heading context, paragraphs and table text; exact table layout/cell coordinates are not guaranteed. The real parser tests use controlled PDF/DOCX documents. Their production parser also passed a PDF test outside the repository. Native 0.9 picker acceptance is BLOCKED by the Windows build restriction described below.

Markdown chunks retain heading hierarchy and code-fence text. Code symbol detection recognizes common function/class/interface declarations heuristically; it is not a full AST parser. Citations expose sections, symbols, pages or line ranges where available. DOCX/PDF do not fabricate source line numbers.

## Indexing, limits and recovery
The scanner excludes hidden paths, generated folders, secret-named files, binary text inputs and symlinks/junctions. Root .gitignore and additional exclusion patterns are applied conservatively; negated patterns do not override safety exclusions. Existing redaction runs before embedding or storing extracted text. Secret detection is conservative and not a guarantee against every possible sensitive value.

Default limits: 100 files per import, 500 KB per file, 5 MB per import and 2,000 chunks per AI. Advanced settings permit bounded increases up to 500 files, 2 MB per file, 20 MB per import and 10,000 chunks. PDF/DOCX run in a worker with a 20-second timeout and a 256 MB old-generation memory limit. DOCX archive expansion and PDF page/text counts are bounded.

Jobs persist as Queued, Indexing, Ready, Failed or Paused. Interrupted jobs become Paused on restart; Resume indexing rechecks Space authorization. One file failure is reported without discarding other documents. Failed re-indexed content is excluded until a successful retry. Replacement of a document's chunks is transactional.

Re-index a document, or choose the same folder again to refresh it. Unchanged content keeps its chunks and does not regenerate cached embeddings. Missing files are removed on refresh; moved files are indexed at their new location and obsolete entries removed. There is no background file watcher in this release. Stable chunk IDs are derived from document identity, section/symbol/page, content and occurrence.

## Search and answers
Filter by Space, file extension and indexed date. Search results show the retrieved excerpt and its location. Preview retrieved passage opens that excerpt directly; Open passages shows a bounded document preview. There is no claimed external editor integration.

SQLite FTS is always available. With an independently configured local embedding model, lexical and semantic candidates are merged, reranked deterministically and deduplicated. Ranking uses lexical relevance, semantic similarity, location metadata and current-project association, not a truth score. Exact-subject conflicting assertions are retained and shown as differing source claims; general contradiction detection remains imperfect.

Fast skips semantic retrieval and selects at most two chunks / 1,600 characters. Other modes select at most six / 8,000 characters, with the existing Intelligence context budget imposing a further limit. Candidate and rerank counts are bounded. Query expansion currently has narrow deterministic Smart Brain and GitHub authentication cases; there are no uncontrolled model/retrieval loops.

## Local embeddings
The approved real model is embeddinggemma:300m, approximately 622 MB, downloaded through the official Ollama catalog. Chat continues to use gemma3:4b. In Advanced knowledge settings use endpoint http://127.0.0.1:11434/v1/ and embedding model embeddinggemma:300m, then re-index sources that need vectors. The model is separate from the installer and source ZIP. It is not silently downloaded by ORBIT.

Embeddings are cached by backend identity, model, content hash and index version. A bounded failure falls back to keyword search with a visible warning. Local Only prohibits remote chat fallback. Selected remote chat providers can still receive retrieved excerpts when Local Only is off; Knowledge itself does not override that policy.

Real paraphrase retrieval passed using embeddinggemma. The 10,000-chunk performance measurement is a controlled lexical-search benchmark, not a claim about equally fast large semantic/PDF workloads.

Sources: [Ollama model](https://ollama.com/library/embeddinggemma), [Google model documentation](https://ai.google.dev/gemma/docs/embeddinggemma), [Gemma terms](https://ai.google.dev/gemma/terms). Parsing libraries: [PDF.js](https://github.com/mozilla/pdf.js), [Mammoth](https://github.com/mwilliamson/mammoth.js). Their licenses remain in packaged dependencies.

## Privacy, removal and backup
Knowledge is stored in the existing local SQLite application database. Imported documents remain untrusted evidence and cannot grant tools, filesystem access, credentials or Sense access. Original files are never deleted by removing a Knowledge source or Space.

Deleting a Space requires confirmation; documents belonging to another Space remain indexed. Other orphaned index entries are removed. Selected AI export retains its existing explicit include-content option; default profile export includes metadata only. A dedicated Space metadata export and native drag-and-drop are not implemented.

Windows application data remains in the normal application-data directory for app.orbit.personal-agent, not beside ORBIT.exe. Back up the application data or use the existing explicit data export; do not distribute private SQLite databases with release artifacts.

## Windows delivery status
The final 0.9 build is BLOCKED by Windows Application Control error 4551 while loading a Rust build dependency. No policy was changed or bypassed. No 0.9 EXE, installer or portable ZIP was produced. The older 0.8 installer is not a 0.9 build. Native window/picker/Sense, shortcut, Start Menu and uninstall acceptance remain unverified or blocked. Windows UI automation also failed to initialize in this environment.

See [the full report](../ORBIT_V090_KNOWLEDGE_REPORT.md) for evidence and exact status.
