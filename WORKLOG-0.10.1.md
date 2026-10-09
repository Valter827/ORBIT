# ORBIT 0.10.1 — Stronger Brain Evaluation checkpoint

Status: IN PROGRESS. No winning model or complete release is claimed.

Source-only provenance: ORBIT-0.10-source-20261008.zip, SHA256 7A32BCF19908D212E602FB684395AEE493B699F7CF0F1DCAF99A899D3071F544. Extracted into a fresh directory; base commit 90cec2a3ed050c121f3d549d559ff1b963d83706. Evidence ZIP was not used as source.

Implemented so far:

- Version 0.10.1, COSMO remains 1.0.
- Swift/Core/Logic/Forge/Sight/Recall aliases separated from exact provider/model IDs; normal Chat hides vendor IDs, technical details retain identity, family, runtime, quantization, source, license and digest. Missing provenance stays UNKNOWN. Catalog source is assigned only when exact digest matches the dated official manifest.
- Six role preferences, manual role selector, Deep→Logic; existing capability/privacy filtering remains authoritative.
- Dated multi-family official Ollama manifest snapshot (2026-10-09), real sizes and digests, reasons for consideration/exclusion. Existing explicit consent and disk-space guards apply to added candidates. No new weights downloaded.
- Expanded deterministic evaluation, 12 additional reasoning tasks, JS/TS/Python/Rust output semantics, context priority/eight facts, conflicting sources, language subsets, separate JSON schema and vision probes. Current suite orbit-brain-eval-0.10.1-3.
- Transparent category weights, no score with missing categories; scores filtered by current suite, digest identity and actual hardware. Comparison table shows category counts and rejects stale current digests/hardware.
- Actual cold start plus three warm requests: runtime load duration, first visible token, decode token rate, resident/VRAM and host free RAM. No reasoning traces retained. Three consecutive runtime errors stop evaluation.
- Supported tool protocols get four extra choice/arguments/no-call/unavailable-tool checks; UNRELIABLE cannot be replaced by older compatibility-only results.
- Isolated per-model real acceptance script covers Memory retrieved/inserted/final facts separately, real Knowledge retrieval/answer sources, persistence and embeddings.

Validation:

- npm ci completed. Existing audit reports three moderate vulnerabilities; no forced unrelated dependency upgrade.
- Latest completed check:release PASS: typecheck, lint, format, core (323 PASS / 0 FAIL / 11 SKIP), release tests (4), visual security (3), frontend build. Re-run after subsequent edits before delivery.
- Preliminary suite-2 real gemma3 baseline: 63/106 deterministic checks; Memory 4/4 retrieved, 4/4 inserted, 4/4 final. Cold load 2079.57 ms; three warm TTFT samples 33.05/39.66/35.33 ms on a short fixed performance prompt. These are measurements, not a claim of strong general quality. Suite-3 must replace suite-2 in final comparison.
- First startup attempt ran before Ollama was ready; preserved as incomplete evidence and excluded from comparison. Explicit ready/digest validation added to acceptance script.
- Browser UI acceptance completed with real Ollama: navigation, real benchmark, manual/auto, dark/light responsive layouts, recovery and embedding checks PASS; zero console errors. Light 1100px screenshot inspected. Repeat after comparison-guard update also PASS; comparison screenshot inspected. Native build/launch policy remains unchanged; previous 0.10 EXE was blocked by Application Control. No native PASS claimed.

Download approval remains pending for each of these named models (user was asked through the asynchronous question): qwen3.5:9b-q4_K_M (6,550,825,550 bytes), ministral-3:8b (6,022,236,616), deepseek-r1:8b (5,225,376,047). About 17.8 GB total before runtime storage overhead. D:\Orbit writes are denied by the filesystem even with escalation; C: had about 25 GB free. Do not interpret a generic continue as approval of these downloads. Preserve installed gemma3:4b and embeddinggemma:300m.

Still required:

- Finish UI verification and fix any failures; rerun final-suite baseline and compare approved candidates sequentially on this hardware.
- Expand code-generation evaluation with safe deterministic test execution where available; current output-semantics tests are not compilation acceptance.
- Broader natural-language quality grading, per-model controlled public evidence, and actual Memory/Knowledge completeness must remain separate from narrow deterministic checks.
- Finish automatic measured role recommendations, session stickiness/load-cost handling, resource-aware swap behavior and provenance UI coverage. No automatic winner selection yet.
- Full Memory 10/10, Knowledge 9/9, Internet/YouTube/privacy/Local Only regressions, fresh Windows CI artifacts, separate source/evidence archives and final required report. Never include weights or private state.
- No foundation training, Voice, Pilot, unsafe code execution, or Windows policy bypass.

Official discovery references (retrieved 2026-10-09):

- https://ollama.com/library/qwen3.5:9b-q4_K_M
- https://ollama.com/library/ministral-3:8b
- https://ollama.com/library/deepseek-r1:8b (DeepSeek-R1-0528-Qwen3-8B; Qwen-derived base explicitly disclosed)
- https://ollama.com/library/qwen2.5-coder:7b (coding alternative deferred for storage; not rejected on reputation)
- https://ollama.com/library/devstral (24B / 14 GB excluded from primary 7B–9B round)
- https://huggingface.co/microsoft/Phi-4-mini-instruct (MIT, small-family alternative)
- https://huggingface.co/google/gemma-4-E4B-it (Apache-2.0, multimodal alternative)
- https://ollama.com/library/llama3.1:8b (additional family considered; first round limited by disk/candidate count, quality not measured)
- https://docs.ollama.com/api/generate and https://docs.ollama.com/api/ps (runtime telemetry definitions)

Source/archive dates and this checkpoint are not evidence of completed model comparisons. Future fine-tune foundation recommendation: NONE until comparative evidence exists.

Continuation checkpoint 2026-10-09:
- Final current suite-3 gemma3:4b run completed: 63/106 checks passed. Runtime, embeddings, Memory 4/4 retrieval/insertion/final facts, Knowledge Nereon/Vela plus attached source, and history/results restart PASS. Tools remain UNKNOWN; no Local Agent PASS.
- Shared comparison guard rejects incomplete/old suites, stale digests, different hardware/configurations/task sets, missing hardware and empty cases. Identical configuration key order does not matter. Unit coverage added.
- Fixed license typing after the official catalog metadata update. Full check:release PASS (323 core + 4 release + 3 security, 11 skipped). A sandbox run failed on OS temp-path/symlink restrictions; the authorized unrestricted rerun passed, without changing Windows policy.
- Evidence is validation/brain-eval-0101-gemma3-4b.json and validation/checks.json. These isolated synthetic acceptance conversations contain no user's private conversations.
- Still no new model download and no strongest-model verdict. Windows binaries for 0.10.1 are not yet produced.