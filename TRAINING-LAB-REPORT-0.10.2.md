# ORBIT 0.10.2 COSMO BRAIN TRAINING LAB REPORT

Version: 0.10.2
COSMO: 1.0

Training Lab UI and core gates: PASS in browser/core acceptance. Full release acceptance: BLOCKED pending real training prerequisites.
Training Backend: implemented offline isolated Python CUDA / Transformers + PEFT worker; actual GPU training NOT VERIFIED.
Local Training: NOT PERFORMED. Missing approved isolated CUDA stack and original training weights; hardware fit is not yet measured. This is not a proven hardware impossibility.
Base Selection: PASS for a bounded pilot, not approval for model distribution.
Selected Base: google/gemma-3-4b-it, revision 093f9f388b31de276ce2de164bdc2081324b9767.
Base License: Gemma Terms, subject to restrictions/notices.
Training Allowed: YES under applicable terms and gated repository access.
Dataset: cosmo-dataset-v1.0.
Dataset Train Count: 28.
Validation Count: 14.
Held-out Test Count: 14.
Leak Detection: PASS for exact/near-token/family checks, including existing 0.10.1 benchmark inputs. Not a guarantee against every semantic overlap.
Dataset Provenance: PASS; controlled ORBIT-authored synthetic scenarios, no private user data.
Pilot Training: NOT PERFORMED.
Full Training: NOT PERFORMED.
Training Method: planned QLoRA NF4, rank 8, alpha 16, dropout .05, micro-batch 1, gradient accumulation 8, sequence 512, seed 42, eight pilot optimizer steps.
Training Duration: NOT MEASURED.
Peak VRAM: UNKNOWN.
Peak RAM: UNKNOWN.
Adapter: NONE.
Adapter Size: NOT APPLICABLE.
Deployment: NOT PERFORMED.

## Before / after

The Base column below contains historical **0.10.1 Ollama Gemma** context only. It is NOT the pinned original Safetensors baseline and cannot be used as a paired training comparison. Fresh before/after measurements will be required after approved provisioning.

| Metric | Historical Gemma Ollama | COSMO Brain Alpha |
|---|---:|---:|
| Reasoning | 10/26 | NOT TESTED |
| Code semantics / compiled edge tests | 1/10 / 32/32 | NOT TESTED |
| Memory adherence | 4/4 | NOT TESTED |
| Knowledge | PASS | NOT TESTED |
| Context adherence | 6/6 | NOT TESTED |
| Russian | 6/10 | NOT TESTED |
| Ukrainian | 6/10 | NOT TESTED |
| English | 4/10 | NOT TESTED |
| Unconstrained JSON | 0/2 | NOT TESTED |
| Hallucination checks | 4/4 | NOT TESTED |
| Source conflict held-out | NOT TESTED | NOT TESTED |
| Tools | UNKNOWN | NOT TESTED |
| Vision | 2/2 | NOT TESTED |
| Warm visible TTFT | 44.10 ms | NOT TESTED |
| Decode tokens/sec | 100.03 | NOT TESTED |
| Runtime VRAM | 2,875,520,450 bytes | UNKNOWN |

COSMO Brain Alpha: **NOT CREATED / NOT PROMOTED**. No real adapter exists; no training score or improvement is invented. Current 14-item held-out pilot set is also too small for general promotion. Pause/resume, cloud backends, distillation, adapter import and automatic Ollama deployment remain explicitly unsupported.

Existing roles preserved: Swift=ministral-3:8b, Core=gemma3:4b, Logic=deepseek-r1:8b, Forge=ministral-3:8b, Sight=qwen3.5:9b-q4_K_M, Recall=embeddinggemma:300m. No user profile is silently migrated to a new model.

## Regression evidence

- npm ci: PASS, original locked app dependencies only.
- check:release: PASS (346 tests; 335 PASS, 11 skipped), plus typecheck/lint/format/release/security/frontend checks.
- Training Lab browser/core acceptance: PASS; storage, hidden held-out answers, honest missing-dependency/base failure, restart persistence, no fabricated adapter, existing role preservation.
- Real Memory on pinned Gemma: 10/10 PASS.
- Real Knowledge: 9/9 PASS.
- Real Internet/YouTube: 13/13 PASS including real transcript/timestamps and Local Only.
- Initial runtime-unavailable and legacy auto-routing failures retained separately.
- Native UI: NOT VERIFIED.

Windows build and final archive hashes will be recorded in the delivery manifest. Signing remains UNSIGNED; no security policy is bypassed. The full v0.10.2 release gate cannot pass until the required real pilot and before/after training acceptance are completed. A missing prerequisite is not reported as a successful training experiment.
