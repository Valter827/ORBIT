# ORBIT 0.10.2.1 COSMO DATASET v1.1 & ALPHA TRAINING REPORT

Report date: 2026-10-12 (Europe/Kiev). Experiment: `cosmo-v11-20261011T171503-4d7608ae`.

**Final decision: INCONCLUSIVE. Candidate: NOT TRAINED / NOT PROMOTED. COSMO Brain Alpha: NOT CREATED.**

Dataset preparation and its mechanical checks completed. Real baseline and new training are blocked by Windows Application Control. The prior 0.10.2 pilot's success is historical evidence only; it is not substituted for this experiment.

## Acceptance status

| Requirement | Result |
|---|---|
| Continue exclusively from specified source ZIP | PASS — SHA256 verified |
| Preserve v1.0 and old pilot | PASS — 38 file/adapter hash checks |
| Dataset v1.1 | PASS — 300 train / 70 validation / 70 held-out |
| Eval suite | cosmo-alpha-eval-v1.1, frozen before baseline |
| Exact deduplication / authored family separation | PASS |
| Old held-out exclusion | PASS — no old example used as new training data |
| Rubric reference/negative audit | 440 reference checks; 830 negative/separation checks |
| CPU validator regression tests | 8/8 PASS |
| Real pinned original weights | SHA256 verified; no new model download |
| CUDA / RTX 5060 detection | PASS |
| Full 512-token backward probe | Completed; headroom exhausted |
| Full 768-token backward probe | Completed; headroom exhausted; not selected |
| 1024-token probe | NOT RUN — cancelled before model load for safety |
| Baseline v1.1 BEFORE | BLOCKED — 0/140 generations completed |
| New optimizer steps | NOT RUN — 0 |
| New adapter save/reload / inference | NOT RUN |
| Held-out AFTER | NOT RUN |
| Medium / candidate stages | NOT RUN |
| Release gate for Alpha | BLOCKED |
| Existing COSMO roles | Unchanged |
| Native Windows installer | NOT PRODUCED for this preparation release |

## Confirmed external blocker

Windows Code Integrity event 3077 blocks:

`D:\Orbit\AI\Training\venv-0102\Lib\site-packages\numpy\random\_common.cp312-win_amd64.pyd`

Policy: `VerifiedAndReputableDesktop`. Status: `0xc0e90002`.
File SHA256: `712a7bb4b2d3e56548cdf255eb4e6c1ca0737d7d81d76f09bdccebb0703ae572` (the machine-readable receipt contains the exact unspaced hash).

The underlying error is: `DLL load failed while importing _common: Политика управления приложениями заблокировала этот файл.` PyTorch's optional NumPy import catches it and later surfaces the misleading `cannot import name NP_SUPPORTED_MODULES` error. A read-only trace exposed the original failure, and the Code Integrity event independently confirmed it. Torch CUDA detection alone still succeeds.

The 512/768 probes ran on October 11. The resumed baseline failed on October 12 at module import, before model generation. A sandboxed attempt had stalled; a normal-user process outside the tool sandbox exposed the policy failure. No Windows administrator elevation, ACL change, policy change, renamed binary, alternate package workaround, or global dependency modification was performed. No attempts to bypass this block are part of the source.

**Action required to continue:** provide an execution environment approved by the Windows security policy (or have the device/security administrator resolve this specific blocked dependency through their normal approval process). Do not disable Application Control. Once imports are legitimately allowed, rerun the read-only diagnostic, verify the frozen dataset/base identities, and resume the existing experiment. If the training stack changes, record a new environment snapshot and rerun baseline BEFORE optimization.

## Data and comparison coverage

Dataset SHA256 (canonical authored rows): `26a2a994975fa9b8c141f06b47359fc7a31879a1091e9a22e5e10ded11869fd0`.
Family count: 215. Maximum complete training/eval example length: 268 pinned-tokenizer tokens. Language metadata: 350 UK, 60 EN, 30 RU. See the dataset card for the mixed-language code caveat.

| Category | Train | Validation | Independent held-out task IDs | Base BEFORE | Adapter AFTER |
|---|---:|---:|---:|---|---|
| reasoning | 20 | 5 | 5 | NOT RUN | NOT RUN |
| code | 20 | 5 | 5 | NOT RUN | NOT RUN |
| memory | 20 | 5 | 5 | NOT RUN | NOT RUN |
| knowledge | 20 | 5 | 5 | NOT RUN | NOT RUN |
| context | 20 | 5 | 5 | NOT RUN | NOT RUN |
| ukrainian | 40 | 5 | 5 | NOT RUN | NOT RUN |
| russian | 20 | 5 | 5 | NOT RUN | NOT RUN |
| english | 20 | 5 | 5 | NOT RUN | NOT RUN |
| json | 20 | 5 | 5 | NOT RUN | NOT RUN |
| hallucination | 20 | 5 | 5 | NOT RUN | NOT RUN |
| sources | 20 | 5 | 5 | NOT RUN | NOT RUN |
| tools | 20 | 5 | 5 | NOT RUN | NOT RUN |
| security | 20 | 5 | 5 | NOT RUN | NOT RUN |
| style | 20 | 5 | 5 | NOT RUN | NOT RUN |
| Vision | 0 | 0 | 0 | NOT VERIFIED | NOT VERIFIED |
| TTFT | — | — | — | NOT MEASURED | NOT MEASURED |
| Decode tokens/sec | — | — | — | NOT MEASURED | NOT MEASURED |
| Inference VRAM/RAM | — | — | — | NOT MEASURED | NOT MEASURED |

Each held-out task is scheduled twice (140 generations); repeats do not increase independent sample size. There is no before/after score or quality delta to report for v1.1. The old 6/28 → 6/28 is from different tasks/validators and cannot be treated as this baseline.

Semantic correctness and format/protocol compliance have separate outputs. Correct fenced JSON can pass semantics and fail protocol. Missing Memory facts, confusable identifiers, extra fields and fabricated citations are checked explicitly. The rubrics were authored before inference and were not relaxed in response to model scores.

Limitations: examples are controlled synthetic tasks, not independently human-annotated data. The audit reports 76 high lexical-similarity cross-split pairs, mainly shared structured-output contracts and short language instructions. Family labels and exact deduplication do not prove absence of all semantic overlap. Grounding recognizers support fixed allowed answers, so some valid paraphrases may be false negatives. Memory/Knowledge use supplied context, not production retrieval. Tool formatting does not verify execution; vision is untested. These limitations restrict any future Alpha claim.

## Measured fit and bounded plan

| Sequence | Allocated peak VRAM | Reserved peak VRAM | Peak process RAM | Forward/backward duration | Free VRAM afterward |
|---|---:|---:|---:|---:|---:|
| 512 | 6.01 GiB | 6.67 GiB | 5.49 GiB | 16.91 s | 0 bytes |
| 768 | 6.85 GiB | 7.92 GiB | 5.48 GiB | 28.33 s | 0 bytes |

Probes did eight gradient-accumulation backward passes at the full requested length, with **zero optimizer steps** and no saved probe adapters. These are PyTorch allocation/reservation and process working-set metrics, not a claim that all GPU allocations stayed in dedicated VRAM. Windows WDDM memory behavior and zero headroom make larger lengths inappropriate. The actual dataset is at most 268 tokens; the conservative configured ceiling remains 512. Future runner code stops escalating probes below 256 MiB free; the historical raw receipts are preserved separately.

Pinned base: google/gemma-3-4b-it, revision `093f9f388b31de276ce2de164bdc2081324b9767`. Configuration: NF4 double quantization, BF16, rank 8, alpha 16, dropout 0.05, micro-batch 1, gradient accumulation 8, seed 42, language q_proj/v_proj only. Every stage starts from the original base, not the old adapter.

The preregistered schedule is sanity 32 optimizer steps, medium 96 only if validation improves, candidate 192 only if validation supports another stage. Validation semantic and joint gains must each be at least 3 tasks over base, without Memory/Knowledge/security regression; escalation beyond medium also needs at least 2 additional validation joint gains. Held-out does not decide escalation. Every trained stage would receive a fresh-process reload and full identical AFTER evaluation.

Promotion requires a meaningful paired gain exceeding uncertainty, no important category regression, strong critical-category performance and acceptable latency. Production retrieval/tool/vision/runtime verification remains separate. No large or blind training run was started.

## Storage, artifacts and reproduction

Everything newly created for this release is under D:\Orbit. Existing isolated dependencies and original weights remain in D:\Orbit\AI. The original Python interpreter path is an existing runtime dependency; it was not replaced or installed globally. No authentication token was read into logs or copied to artifacts.

Source archive includes the preparation scripts, worker changes, frozen dataset files, dataset card, and this report. Evidence archive contains the experiment plan, raw/aborted process logs, fit receipts, blocker diagnostics, test output and integrity hashes. Dataset ZIP includes provenance, partitions, rubrics, audit and checksums. No new adapter ZIP exists because no new adapter was trained. Original Gemma weights, the old adapter, environment packages, authentication caches and user application databases are excluded.

The existing application's package version stays 0.10.2; `training/RELEASE-0.10.2.1.json` identifies this preparation release. This is not a newly verified desktop installer. No v0.10.3 work was started.

After the external block is resolved, the controlled command is:

```powershell
& D:\Orbit\AI\Training\venv-0102\Scripts\python.exe training/run_v11.py --resume D:\Orbit\AI\Training\cosmo-v11-20261011T171503-4d7608ae
```

Run from the new source workspace. The resume path verifies the frozen plan, dataset, base and worker snapshots; incomplete logs are retained. Current security policy must allow the dependencies; this command does not alter it.
