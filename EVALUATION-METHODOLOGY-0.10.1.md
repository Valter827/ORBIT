# ORBIT 0.10.1 evaluation decision rules

The main suite remains orbit-brain-eval-0.10.1-3, two repetitions, 106 checks, temperature 0, 1024-token completion budget and 60-second per-case deadline. No prompts, validators or score weights change during the candidate batch. Runtime-default thinking is retained and final-output starvation is a practical failure under these settings, not proof that a model cannot reason.

Supplement orbit-brain-supplement-0.10.1-1 runs identical four-language code generation, equivalent natural-language summaries, public NASA evidence and two pixel-input vision tasks for every model including baseline. Its native-chat configuration (4096 context, 1024 output tokens, temperature 0, 120-second deadline) is stored separately; no supplemental percentage is substituted for the main suite score. Generated code is reviewed before compilation/execution. Unsupported images and unavailable compilers are explicit, not zeros invented as measurements.

Outcome classification: PASS means the unchanged validator passed; TIMEOUT requires timeout/abort evidence; OOM requires an actual allocation/OOM error; UNSUPPORTED requires runtime/capability rejection; other wrong/missing/truncated answers are FAIL with the reason. Missing measurements remain NOT TESTED/UNKNOWN. A completed execution can contain failed cases. Host free RAM and runtime resident/VRAM bytes are reported separately; no fabricated process RSS. Token rates may count internal reasoning tokens and must not be described as visible-answer throughput. No private reasoning text is saved.

Role decisions occur only after all candidate evaluations have terminal results:

- Core: prioritize weighted core quality, with actual Memory/Knowledge final adherence and completed ordinary-chat execution as eligibility evidence; speed is a tie-breaker, not the primary score.
- Swift: require usable chat/streaming and ordinary task quality, then choose the lowest measured warm visible-answer latency among eligible candidates; no latency winner from an all-null TTFT series.
- Logic: highest reasoning final-answer pass rate in the identical main suite; report truncation/timeouts and latency trade-offs. A tied score uses measured response latency.
- Forge: prioritize compiled/generated-code deterministic tests and edge cases; then code-semantics results, then latency. Compiler policy blocks stay separate from model failures. Conclusions are bounded to these tasks, not a general coding leaderboard.
- Sight: require verified image input and supplemental visual correctness; compare visual pass count, then core quality, then known latency. Never assign a non-vision runtime.
- Recall: retain verified embeddinggemma:300m because no replacement embedding model was approved or compared.

A role remains unassigned if no candidate has evidence supporting it. Ties and limited coverage must be disclosed. Recommendations preserve exact model ID, digest, runtime, source, license and benchmark references. Model roles do not imply ORBIT-created weights. Future fine-tune base remains NONE if evidence is insufficient.
