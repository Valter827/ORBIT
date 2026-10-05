# ORBIT 0.5 — Build Your Own AI
Your AI. Your Rules.

ORBIT 0.5 extends the existing Tauri 2 / React desktop application. The hardened agent engine, permissions, path guard, command risk checks, cancellation, verification, persistent Undo and Credential Manager remain in place.

## Create an assistant
Use Create AI for Identity → Purpose → Personality → Brain → Knowledge → Memory → Skills & Tools → Permissions → Test → Create. Templates and personality sliders produce ordinary instructions, not unsupported model parameters. Advanced instructions remain editable. The current source also allows provider configuration inside the Brain step; that final UI improvement is not in the previously built preview installer.

My AIs supports search, chat, edit, duplicate, export, delete and configuration history. An AI's UUID is separate from its Unicode display name and chosen model. Changing its brain preserves knowledge and private memory. An unavailable or unknown tool-capable model does not silently fall back.

## Knowledge and retrieval
Supported ingestion: UTF-8 TXT, Markdown and common source-code/configuration files. PDF and DOCX are deliberately unsupported. Choose files/folders with the native picker, or add a manual note. Originals are never changed.

Validation → bounded read → secret redaction → hash → overlapping chunks → SQLite index. Symlinks, secret filenames, binary text and generated directories are excluded. Root .gitignore exclusion patterns and user exclusions are applied conservatively; negated patterns do not override exclusions. This is not a complete Git ignore implementation.

Limits are configurable within hard caps: 2 MB/file, 20 MB/import, 500 files/import, 10,000 chunks/AI and 20,000 scanned entries/import. Indexing yields between files and can be cancelled. Changed sources are replaced transactionally; unchanged sources retain their chunks unless the embedding backend changes.

Default retrieval uses real SQLite FTS5/BM25 keyword search, labelled Keyword retrieval. Only up to five relevant passages are sent. Optional local OpenAI-compatible /embeddings uses real numeric vectors and cosine ranking; no pseudo-embeddings or automatic downloads. Unavailable embeddings produce a visible keyword fallback. Re-index after changing the embedding model. Native acceptance used an HTTP fixture, not a genuine embedding model.

Chat shows the active AI, brain, knowledge sources and enabled memory categories. Source buttons open stored passages. Preview uses the selected model and relevant context without tool execution or saving the exchange. These are operational details, not hidden chain-of-thought.

## Memory, skills and workflows
Conversation history, private AI memory, project memory and explicitly shared user memory remain separate. Permanent memory is user-controlled: add a note or review a proposed note from a reply before Remember. Memory can be searched, edited, disabled and deleted. No automatic extraction from every sentence.

Skills are built-in instruction packages, never arbitrary executable plug-ins. Workflows are bounded named lists of steps; select a workflow in Agent Mode to prepare a request. Execution still requires the existing security and approval pipeline. There is no scheduled workflow engine or public marketplace.

## Package format
.orbit-ai is UTF-8 JSON, format=orbit-ai, schemaVersion=2. Fields: profile and knowledge[]. Each knowledge manifest entry contains name, kind, hash, and optional explicitly included redacted text. Original machine-specific source paths, credentials and memory are excluded. Hard package limit: 750 KB.

Version-1 profile JSON remains importable. Imports receive a new internal ID, downgrade grants to Ask/Disabled and turn shared memory off. Unknown fields, executable hooks and source-path instructions are rejected. A manifest-only source is shown as content not included, never as searchable knowledge. Portable snapshots do not re-read external paths.

Data export is separate and explicitly includes the current AI's private memory/conversations, up to 4 MB. It excludes credentials and is not a portable profile import.

## Storage and migration
AI SQLite migrates from user_version 1 to 2 in a transaction. New structured tables: profile_versions, workflows, knowledge_sources, knowledge_chunks and FTS index. Memory gains category, enabled and updated. Profiles retain validated JSON configuration with compatible defaults. Configuration history retains up to 20 previous versions; no credentials are versioned.

Deleting an AI removes its private memory, conversations, workflows and configuration history. Original files are always kept. Indexed knowledge copies can be deleted or retained. The current source adds explicit reattachment of retained copies to another AI; this improvement is not in the preview installer.

## Security and privacy
Knowledge, profiles, memory and model output are untrusted. None can change ORBIT's execution authority. Cloud providers receive prompts plus selected relevant context; a new custom endpoint requires an acknowledgement. Local Only rejects remote provider routes and cloud-labelled local models. ORBIT cannot verify whether an independently configured local server forwards data externally.

## Validation and current build limitation
See ORBIT_V05_REPORT.md. A real 0.5 installer was built and passed installed Windows acceptance. Windows Code Integrity subsequently blocked Rust's ctor_proc_macro DLL and cargo-fmt. The latest source changes have passed TypeScript/core/UI checks but cannot yet be rebuilt into the installer on this machine. The installer and current-source ZIP are intentionally labelled separately.

Model Studio is Coming later. Profiles do not train new foundation models.
