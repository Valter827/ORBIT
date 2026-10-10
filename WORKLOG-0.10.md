# ORBIT 0.10 implementation and acceptance work log

Release gate: **NOT COMPLETE**. This log is a checkpoint, not a native acceptance claim.

Source provenance: only `ORBIT-0.9.5-visual-source-20261008.zip`, SHA256 `2AB813B67F23DABBE66842313C752CE0617B32202F9B021731530D8280A7B77A`, was extracted for this release. Evidence ZIPs were not used as source. Base source commit: `16610b78b1699e291dd1c65220d7262f7e4b088c`. Version is 0.10.0; assistant identity remains COSMO 1.0.

Implemented: native Ollama inventory discovery and bounded CLI diagnostics; explicit runtime states and refresh; custom numeric-loopback endpoint discovery; Model Studio sidebar/settings entry; hardware/VRAM detection and labeled fit estimates; model details; persistent empirical capabilities and versioned real benchmarks; actual streaming/token counts/cancellation/schema/vision probes; separate embedding evaluation; role preferences, measured Auto ranking, bounded fallback; local generation controls; explicit Ollama unload; schema migration 4; Memory context insertion diagnostics; future fine-tuning design without training or private-data export.

Completed evidence on this PC:

- Full `check:release`: typecheck, lint, formatting, core tests, release-pipeline tests, visual-security tests and production frontend build PASS. Core suite at that checkpoint: 314 PASS, 0 FAIL, 11 SKIP (325 total). Two subsequent routing/fit unit cases also passed in the targeted 8-case Model Studio suite.
- Real Ollama was installed but stopped; the existing official installation was started. Existing models: gemma3:4b and embeddinggemma:300m. No new weights downloaded.
- Latest baseline-3: 29/36 deterministic checks passed across two repetitions. Wrong answers remain recorded. Arithmetic 0/2, code 1/2, unconstrained JSON 0/2, language 10/12; remaining categories passed. Strict JSON-schema protocol, chat, real streaming, image path and transport cancellation passed. Tools remain UNKNOWN, so Local Agent is not accepted.
- Real embedding vectors: 768 dimensions; multilingual relevance exceeded unrelated control.
- Isolated Memory diagnostic after continuity prompt clarification: retrieved 4/4, inserted 4/4, final distinct facts 4/4. Earlier run showed final 3/4 despite retrieval/insertion 4/4; this led to preserving the separate planned-stage/version fact in the prompt. No private memories were used.
- Real Memory regression 10/10; real Knowledge regression 9/9.
- Local Only network observer: 70 requests, 0 remote; an actual interrupted response stream was observed.
- Browser + production core + real Ollama Model Studio acceptance passed: navigation, benchmark, Auto/Manual, dark/light at 1100 and 1440 pixels, no page errors. Ten screenshots saved. This is NOT native Tauri acceptance.
- Local Windows build BLOCKED: Rust reported E0463 loading `cssparser_macros`; Windows Code Integrity events 3077/3033 at 2026-10-08 19:40 Kyiv explicitly rejected that proc-macro DLL. Security policy was not changed or bypassed.

Still required before the final report:

- Finish current Internet/YouTube regression and review its failures honestly.
- Fresh Windows CI build and artifact/hash/version verification; actual EXE acceptance where the interactive environment permits. Signing remains UNSIGNED because no trusted signing credential is available.
- Final real embedding benchmark through Model Studio, explicit unload/reload, real CLI diagnostic, screenshot coverage for missing-model/offline/comparison states, and final release evidence matrix.
- Review remaining specification details, especially comparison compatibility/variance, profile portability semantics, resource/keep-alive limitations and error classification. Do not overstate completion of these from existing chat success.
- Package source/evidence separately, excluding runtime caches, models, credentials, user databases and temporary acceptance state; record exact source commit and hashes. No 0.10 installer has yet been delivered.

Relevant evidence is under ignored `validation/`: `model-studio-real-010.json`, `studio-local-only-network-010.jsonl`, `studio-ui-010.json`, `knowledge-memory-regression.json`, `knowledge-real-acceptance.json`, `checks.json`, `windows-build-010.log`.
