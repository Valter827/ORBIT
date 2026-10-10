# ORBIT 0.8 PERSONAL MEMORY 2.0 REPORT

Date: 2026-10-05. ORBIT 0.8.0; COSMO 1.0.

## Results

PASS denotes the implemented behavior covered by the recorded tests, not unrestricted guarantees about model answers.

| Area | Result |
| --- | --- |
| Memory Migration | PASS |
| Memory Candidate Detection | PASS |
| Explicit Remember | PASS |
| Noise Rejection | PASS |
| Memory Types | PASS |
| Memory Proposals | PASS |
| Conflict Detection | PASS |
| Supersession | PASS |
| Temporal Memory | PASS |
| Current Input Precedence | PASS |
| Memory Importance | PASS |
| Pinning | PASS |
| Memory Retrieval | PASS |
| Retrieval Budget | PASS |
| Project Memory | PASS |
| Project Continuity | PASS |
| Goals | PASS |
| Tasks | PASS |
| AI Isolation | PASS |
| Shared Memory | PASS |
| Memory Timeline | PASS |
| Memory Search UI | PASS |
| Why Remembered | PASS |
| Edit | PASS |
| Forget | PASS |
| Memory Review | PASS |
| Duplicate Handling | PASS |
| Sensitive Data Exclusion | PASS |
| Memory Export | PASS |
| Real COSMO Memory | PASS |
| Restart Persistence | PASS |
| Intelligence Regression | PASS |
| Security Regression | PASS |
| Semantic Memory Search | NOT VERIFIED with a real embedding model |
| Memory Import | NOT IMPLEMENTED (optional) |
| Tests | 274 PASS / 0 FAIL / 11 SKIP |
| Windows Build | PASS |
| Installer | PASS — unsigned test artifact produced |

## Real local evidence

All ten scenarios in [real memory acceptance](validation/memory-real-acceptance.json) passed against real Ollama and gemma3:4b: explicit preference confirmation, follow-up recall, current-input precedence and conflict update, separate backend/web preferences, project continuity after restart, AI isolation, forgetting after restart, noise rejection, provenance, and independent automatic-category settings.

The project-continuity test uses controlled public test facts, including a synthetic blocker. Those facts are not a statement about the current release. No fixture provider replaces the model in real acceptance. Sensitive detector tests are performed without sending secrets to the model.

[UI acceptance](validation/memory-ui-acceptance.json) covers actual local model inference, proposal confirmation, the Memory indicator, timeline, pinning, provenance, export, forgetting, responsive layouts, dialogs, and the Web consent/citation flow. The browser harness bridges the desktop transport to the real core; it is not native-shell acceptance.

[Regression acceptance](validation/memory-regression-acceptance.json) covers Fast/Balanced/Deep behavior, Knowledge, current-input precedence, verification UX, restart/history, real streaming and cancellation, real Windows Sense helper text extraction, unrelated-screen exclusion, and Local Only. The recorded Local Only run has 36 requests and zero non-loopback destinations. Native Rust Sense broker acceptance remains NOT VERIFIED. Local Agent is UNSUPPORTED for this model's discovered tool-calling capabilities; chat success does not establish agent support.

## Implementation and checks

Six typed memory categories, strict proposals, selective automatic saving, AI/project/conversation/shared scopes, conflict review and supersession, supported temporal validity, bounded indexed retrieval, relevant pinning, task state, timeline/review, source metadata, edit/forget and separate JSON export are implemented. Legacy migration preserves ownership, content, timestamps and existing profile controls. Shared memory and automatic permanent saving remain opt-in. Memory is untrusted context, not action authorization or external factual evidence.

Unit tests include migration, scope boundaries, conflicts, expiry, retrieval limits, source rejection, sensitive data checks, export defaults, task state, and semantic-backend integration using a test backend. Real memory retrieval used SQLite FTS/keyword fallback. Local semantic retrieval is implemented with bounded candidate/embedding limits but its real embedding-model acceptance is NOT VERIFIED. Import and automatic consolidation are not implemented.

npm ci, npm test, typecheck, lint, format:check and frontend:build passed. See validation/memory-*.log. Eleven skipped tests are not counted as passes. The frontend emits a non-fatal bundle-size warning.

## Windows delivery

The final build completed successfully on 2026-10-05 and produced ORBIT_0.8.0_x64-setup.exe with the final core changes. The first invocation encountered an internal Tauri CLI panic; a normal retry with Rust backtrace diagnostics succeeded. See validation/memory-windows-build.log and validation/release-v0.8.0.json.

No Application Control policy was disabled or bypassed. No signing certificate/service is available: any produced installer is an UNSIGNED TEST BUILD, not a trusted signed release. Installing, launching and accepting the final native installer have not been performed; native acceptance is NOT VERIFIED.

## Files and privacy

Source and evidence ZIPs exclude node_modules, local databases, model files, credentials and application state. Evidence contains controlled test conversations. Broad Ollama server logs are excluded. See the accompanying SHA-256 manifest for delivered archive/installer hashes.

[Memory user guide](docs/PERSONAL_MEMORY.md)
