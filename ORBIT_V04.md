# ORBIT 0.4 — AI providers and profiles

ORBIT keeps execution authority in its existing agent engine. AI output, profile prompts, selected files and memory are untrusted input.

## Using AI
Settings → AI supports Anthropic, numeric loopback runtimes and explicitly acknowledged remote OpenAI-compatible endpoints. Refresh models, select a discovered model and test the connection. Requests to a paid provider can incur provider charges. Pricing is unknown unless supplied; token usage is reported only when returned by the provider.

AI Studio provides an eight-step profile editor, presets, duplicate/delete, export and reviewed import. Imported grants are downgraded to Ask and shared memory is disabled. Keys belong to Windows Credential Manager, not profile JSON. A profile is a configuration of an existing model, not a trained foundation model.

Chat streams replies, supports stop, regeneration, copying, scoped history and explicitly selected files. Agent Mode uses the existing plan, validation, approvals, execution, verification and persistent Undo pipeline. Unknown tool support prevents Agent Mode. A configured verification command and terminal permissions remain necessary for executable verification.

Local Only blocks remote provider requests and cloud-labelled models exposed by local runtimes. Users must confirm the local runtime performs inference locally; ORBIT cannot prevent an independently configured runtime from forwarding requests. Endpoint detection does not download models.

Private conversation and memory records are scoped to AI and project. Shared memory requires opt-in; exporting a profile excludes conversations, memory and credentials. Disabling conversation persistence retains only in-process chat history until exit. Deleting a profile retains existing historical records.

## Verification
Run npm test, npm run typecheck, npm run lint, npm run format:check, npm run build:desktop.
The Windows acceptance script scripts/windows-v04-smoke.mjs requires the installed application launched with a test-only WebView2 debugging port 9224. It runs against an explicitly labelled HTTP fixture, not a local LLM.
Live tests are opt-in: set ORBIT_LIVE_AI_TESTS=1 and ANTHROPIC_API_KEY in the test environment. Optional ORBIT_LIVE_MODEL must match a discovered model. These tests make real provider requests; absent credentials skip them. A live agent change-and-Undo scenario remains a separate acceptance requirement.

## Future training architecture — not implemented
A future pipeline may import a licensed dataset, validate and redact records, create immutable train/evaluation splits, run an isolated LoRA or QLoRA job, evaluate against a held-out suite, register an adapter version with provenance and resource requirements, and expose it through a supported local runtime. Dataset ingestion and training require separate resource and privacy controls. Profile permissions must never become training-job or runtime privileges. Versioned evaluation reports and an explicit rollback path are prerequisites for publishing a trained variant.

See ORBIT_V04_REPORT.md for release-specific PASS and NOT VERIFIED results.
