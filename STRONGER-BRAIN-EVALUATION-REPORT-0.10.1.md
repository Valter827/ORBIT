# ORBIT 0.10.1 STRONGER BRAIN EVALUATION REPORT

Evaluation completed 2026-10-10 on Ryzen 5 7500F, RTX 5060 (8 GB), 31.7 GiB RAM, Windows x64, Ollama 0.35.1. All inference used real installed models. No mock results are included below.

## Completion and identical main suite

Each model completed all 106 checks (53 prompts repeated twice), suite orbit-brain-eval-0.10.1-3, temperature 0, 1024-token output budget, 60-second case deadline, runtime-default thinking. Completed does not mean every answer passed. Validators and settings were unchanged between models.

| Metric | Gemma 3 4B baseline | Qwen 3.5 9B Q4_K_M | Ministral 3 8B | DeepSeek R1 8B |
|---|---:|---:|---:|---:|
| Completion | 106/106 | 106/106 | 106/106 | 106/106 |
| PASS | 63 | 84 | 57 | 81 |
| FAIL | 43 | 22 | 49 | 25 |
| TIMEOUT / OOM / UNSUPPORTED (main cases) | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Weighted core score | 67.42% | 79.24% | 64.22% | 83.99% |
| Reasoning | 10/26 | 18/26 | 10/26 | 21/26 |
| Code semantics | 1/10 | 10/10 | 7/10 | 8/10 |
| Context adherence | 6/6 | 4/6 | 6/6 | 6/6 |
| Russian | 6/10 | 10/10 | 4/10 | 6/10 |
| Ukrainian | 6/10 | 6/10 | 4/10 | 6/10 |
| English | 4/10 | 6/10 | 4/10 | 4/10 |
| Unconstrained JSON | 0/2 | 2/2 | 0/2 | 2/2 |
| Hallucination checks | 4/4 | 4/4 | 4/4 | 4/4 |
| Controlled RAG prompts | 4/4 | 4/4 | 4/4 | 4/4 |
| Actual Memory retrieved / inserted / adhered | 4/4 / 4/4 / 4/4 | 4/4 / 4/4 / 4/4 | 4/4 / 4/4 / 4/4 | 4/4 / 4/4 / 2/4 |
| Actual Knowledge with source | PASS | FAIL: empty final | PASS | PASS |
| Restart/history | PASS | PASS | PASS | PASS |
| Prompt injection | 2/2 | 2/2 | 0/2 | 2/2 |
| Web evidence prompts | 2/2 | 2/2 | 2/2 | 0/2 |
| Short synthetic long-context retrieval | 2/2 | 2/2 | 2/2 | 2/2 |

This is a bounded local test set, not a universal leaderboard. Long-context checks do not establish maximum context capacity. Memory retrieval success is separate from final answer correctness. Qwen added unsupported commentary in Memory; Ministral produced awkward language and an unsolicited suggestion about a Windows blocker; no security change was executed.

## Supplemental real inference and generated code

All four completed 10/10 supplemental cases, suite orbit-brain-supplement-0.10.1-1. Native Ollama chat used temperature 0, num_ctx 4096, num_predict 1024, 120-second deadline. These results are separate from the main score.

| Metric | Gemma | Qwen | Ministral | DeepSeek |
|---|---:|---:|---:|---:|
| Generated JS/TS/Python/Rust edge tests | 32/32 | 8/32 | 32/32 | 24/32 |
| Missing code final answers | none | JS, TS, Rust | none | TS |
| Pixel vision | 2/2 | 2/2 | 2/2 | UNSUPPORTED (2 cases) |
| Public NASA evidence with URL | PASS | PASS | PASS | PASS |
| Natural summaries EN/RU/UK | see review | empty/PASS/empty | unsupported additions; UK invented dates | all three preserve facts |

Generated arithmetic functions were reviewed before compilation and execution. Eight edge cases per language covered empty, odd/even, negative, zero, mixed, large integers and symmetric ranges. This narrow exercise does not establish broad software-engineering ability. Markdown fences violated the requested raw-code format for Gemma, Ministral and DeepSeek; compilation stripped those fences and does not erase the format violation. Qwen's available Python function followed raw-code format.

The first Gemma Rust execution exceeded its 5-second deadline; the original attempt is preserved. The same reviewed code and deadline passed on repetition. This is a recorded harness timeout, not an omitted failure or an OOM. No Windows policy was bypassed.

Natural-language review: Gemma EN added future updates/review activity; RU preserved the facts; UK used awkward wording and an unspecified 'next' Friday. Qwen EN/UK had no final answer within budget, RU preserved the facts. Ministral EN added unsupported team/planning details, RU changed 'not decided' to 'not announced' and added future clarification, UK invented a department and June dates. DeepSeek preserved the three facts in three sentences in all languages. No subjective numerical fluency score is invented.

NASA source: https://science.nasa.gov/mars/facts/ . Only short public evidence was used; no user documents were collected.

## Latency and resources

| Measurement | Gemma | Qwen | Ministral | DeepSeek |
|---|---:|---:|---:|---:|
| Cold model load ms | 2075.48 | 7983.91 | 6225.37 | 10157.36 |
| Median warm visible TTFT ms (3 calls) | 44.10 | UNKNOWN | 25.55 | UNKNOWN |
| Median decode tokens/sec | 100.03 | 44.56 | 61.06 | 73.38 |
| Runtime resident bytes | 2875520450 | 6234423947 | 5987977132 | 5578204118 |
| Runtime VRAM bytes | 2875520450 | 5458865683 | 5500378807 | 5578204118 |
| Process RSS | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

Qwen and DeepSeek produced no visible final answer in all three 256-token performance calls: TTFT is null, not zero. Decode rates may include internal reasoning tokens and are not visible-answer throughput. Host free RAM is recorded separately in raw evidence and is not model RSS. Qwen supplemental execution encountered severe host memory pressure (about 724 MB free), was interrupted, then resumed with the same suite/settings and completed; no actual OOM error was observed. No private reasoning text was saved.

## Capability and security limits

Real image input succeeded for Gemma, Qwen and Ministral; DeepSeek vision is unsupported. Qwen and Ministral passed four tool-protocol quality checks; no tool was executed by those checks, so Local Agent is NOT VERIFIED. Gemma tool support is UNKNOWN and DeepSeek tool support UNSUPPORTED. Structured/schema and cancellation probe details remain in the raw model records; missing/ambiguous probe results are not fabricated passes. A strict short 'OK' probe can fail despite usable chat, and bounded thinking can starve final output. Corrected explicit no-thinking probes are separate diagnostics and do not replace primary scores.

Local Only remained enabled in the real role-application UI acceptance, all six exact model identities persisted after reload, and no browser console errors occurred. This browser test substitutes the Tauri IPC bridge and is NOT native Windows acceptance.

## Measured role assignments

| Role | Exact underlying model | Evidence and limitation |
|---|---|---|
| COSMO Swift | ministral-3:8b | Lowest measured warm visible TTFT, 25.55 ms; language/injection weaknesses remain. Gemma decodes faster and uses less memory. |
| COSMO Core | gemma3:4b | Highest core score among candidates passing actual Memory 4/4 and Knowledge. Qwen fails Knowledge; DeepSeek final Memory is 2/4. Baseline/fallback preserved. |
| COSMO Logic | deepseek-r1:8b | Highest reasoning result, 21/26; budget starvation and Memory limitations remain. |
| COSMO Forge | ministral-3:8b | 32/32 compiled edge tests, tied with Gemma; code-semantics tie-break is 7/10 versus 1/10. Narrow task coverage and fence violations remain. |
| COSMO Sight | qwen3.5:9b-q4_K_M | All vision candidates scored 2/2; predefined core-quality tie-break favors Qwen. Slow thinking and RAM pressure remain. |
| COSMO Recall | embeddinggemma:300m | Real 768-dimensional multilingual embeddings; relevant cosine 0.8116 versus irrelevant 0.2531. No replacement embedding model compared. |

Model Studio contains an explicit measured-role preset guarded by exact hardware, Ollama version, model digest and local capability checks. Applied successfully to an isolated acceptance profile; this does not claim the old installed app's profile was changed. Advanced Details retains underlying identity/provenance. These are third-party weights, not ORBIT-trained models. Future fine-tune base: NONE, evidence insufficient. No Voice, Pilot or training added.

## Release gate

Benchmark and role assignment: COMPLETE. Local check:release: PASS (338 core tests, 327 passed, 11 skipped; typecheck, lint, format, release/security tests and frontend build passed). Real role UI acceptance: PASS, browser only. Native Windows AI acceptance: NOT VERIFIED. Trusted signing: UNAVAILABLE (no certificate). Production Release Gate remains BLOCKED until native acceptance and trusted-delivery requirements are met. Windows CI/artifact results and SHA256 values are recorded in the final delivery manifest, produced after this completed evaluation.

Raw evidence: validation/main-comparison-complete.json, brain-eval-0101-*.json, brain-supplement-0101/, evaluated-role-assignments.json, roles-ui-0101.json. Earlier partial/incomplete diagnostics remain labelled as such and are not used as completed model scores.
