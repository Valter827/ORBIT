# ORBIT 0.7 INTELLIGENCE REPORT

Version: 0.7.0. COSMO remains 1.0. Report date: 2026-10-04.

Core and browser acceptance completed with actual Ollama + gemma3:4b. Windows installer was not produced. Native Tauri shell acceptance for this release remains unverified.

| Area | Result |
| --- | --- |
| Request Analyzer | PASS |
| Context Planner | PASS |
| Smart Brain | PASS |
| Brain Auto | PASS |
| Model Capability Registry | PASS |
| Fast Mode | PASS |
| Balanced Mode | PASS |
| Deep Mode | PASS |
| Long Context | PASS |
| Knowledge Routing | PASS |
| Memory Routing | PASS |
| Sense Routing | PASS |
| Answer Verification | PASS |
| Source Attribution | PASS |
| Contradiction Handling | PASS |
| Verify Answer UX | PASS |
| Local Only | PASS |
| Privacy Regression | PASS |
| Security Regression | PASS |
| Real gemma3:4b | PASS |
| Real Verified Factual Answer | PASS |
| Cancellation | PASS |
| Chat-first UI Regression | PASS |
| Capability Probing | PARTIAL — actual chat/streaming and text Sense exercised; discovery metadata is not an executed tool/vision/structured-output probe |
| Web Research | NOT IMPLEMENTED |
| Local Agent (gemma3:4b) | UNSUPPORTED — runtime does not confirm tools |
| Tests | 242 PASS / 0 FAIL / 11 SKIP; 4 additional Markdown PASS |
| Windows Build | BLOCKED — Windows Application Control, OS error 4551 |
| Installer | NOT PRODUCED |

## Implemented behavior

- Deterministic Russian/English request analysis, selective Knowledge/Memory and explicit-only Sense. Greetings do not retrieve private memory or Knowledge.
- Auto routes only discovered configured candidates, requires confirmed vision/tools where needed, respects Local Only including cloud-backed local runtime models. Local providers are enabled by default; cloud automatic use and remote provider classes are disabled by default. Manual model choices disable Auto.
- Persistent profile settings: Fast / Balanced / Deep, Auto, allowed providers, speed/balanced/quality preference and context budget. Existing chat-first layout and eleven settings sections remain.
- Context allocation reserves output and safety space. Old complete turns are replaced by a bounded extractive summary of earlier user goals/facts; latest input takes priority. Summary remains conversation metadata, not permanent Memory. Tool pairs are kept whole or rejected if incomplete.
- Retrieval filters stop words, maps a small set of Russian/English terms, ranks candidates, removes exact duplicates and weak matches, and limits per-source repetition. Existing optional semantic retrieval remains; this release does not claim a new hybrid embedding system.
- Verify rechecks the completed answer against scoped retrieved evidence without another inference call. Deep performs one model call and a bounded deterministic source check. Source buttons open actual excerpts. Response metadata survives restart.
- Stop aborts the shared generation pipeline. Real network evidence confirms an aborted Ollama response and no verification after cancellation.

## Verification scope and limits

PASS above denotes the tested implemented behavior, not a general guarantee of factual correctness. Verification is conservative and extractive: an exact matching source excerpt can be marked Verified; other evidence-backed replacements are Partially verified; missing evidence is Could not verify. Model agreement alone never counts as proof. Source truthfulness itself is not independently audited. Simple conflicting assertions are disclosed rather than arbitrarily resolved; arbitrary semantic contradictions are not fully understood.

Long-conversation summaries are bounded excerpts selected with deterministic heuristics, not semantic summaries of every old decision. Oversized indivisible current requests still fail clearly. Selected files use marked excerpts. Auto has no quality ranking inferred from marketing names; available provider tier/capability metadata bounds its choice. Additional capability probes and web search are not implemented.

The real hottest-planet draft was already correct on the final run. Evidence-backed final output retained Venus and omitted the unrelated silver-planet note. Correction of an intentionally wrong Mercury draft is covered separately by a deterministic test, not represented as a naturally occurring live-model failure.

NASA evidence was explicitly added to the isolated acceptance Knowledge library, from https://science.nasa.gov/solar-system/temperatures-across-our-solar-system/ . This is not a claim of built-in web research.

## Real local evidence

Runtime: 0.35.1. Model: gemma3:4b. Actual installed model list and capability metadata are saved in validation/intelligence-acceptance.json. No mocked model replaced this acceptance.

Fast: 2.85 ms planning, 226 ms generation.
Balanced Knowledge: 11.31 ms planning/retrieval, 342 ms generation.
Deep factual: 3.47 ms planning, 623 ms generation, 1.02 ms deterministic verification.

These are individual observed warm-model runs, not benchmark guarantees. Model loading was slower at startup.

Memory answered JavaScript from saved test memory, then TypeScript from current input. Sense returned C) Paris from actual Windows accessibility text in a dedicated public test window. This run does not claim image understanding. Unrelated Sense queries were rejected before inference. Local Only recorded only loopback inference requests. Mode, Auto, conversation history and response metadata persisted across core restart.

## Commands and artifacts

- npm ci: PASS, 0 vulnerabilities reported.
- npm test: PASS (242 passed, 11 skipped).
- npm run typecheck: PASS.
- npm run lint: PASS.
- npm run format:check: PASS.
- npm run frontend:build: PASS.
- node --test scripts/markdown-rendering.test.mjs: PASS (4).
- node scripts/intelligence-real-acceptance.mjs gemma3:4b: PASS.
- node scripts/intelligence-ui-acceptance.mjs gemma3:4b: PASS.
- npm run build:desktop: initial stale dependency error E0463; after standard release-cache cleanup, Windows blocked thiserror build-script-build with OS error 4551. No security policy was changed, no binaries were renamed, and no bypass was attempted.

Evidence: validation/intelligence-acceptance.json, validation/intelligence-ui-acceptance.json, validation/intelligence-network-1791091741746.jsonl, validation/intelligence-tests.log, validation/intelligence-windows-build-clean.log. Screenshots: validation/intelligence-chat-1100.png, intelligence-chat-1440.png, intelligence-chat-1920.png, intelligence-sense.png and intelligence-ui-*.png.

All acceptance conversations and memory were created in isolated test data directories. Production user chats, private screen content and secrets were not included in the exported evidence.
