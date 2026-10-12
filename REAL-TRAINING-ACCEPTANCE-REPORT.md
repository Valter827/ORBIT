# ORBIT 0.10.2 REAL TRAINING ACCEPTANCE REPORT

Experiment: cosmo-pilot-20261011163734062-14a0fa61
Exact base: google/gemma-3-4b-it, revision 093f9f388b31de276ce2de164bdc2081324b9767.
Dataset: cosmo-dataset-v1.0, 28 train / 14 validation / 14 held-out; two identical deterministic repetitions per held-out item. Responses are graded by the existing unchanged validators; repeats are not independent items.
Dataset hash: 5eb138a6bb34170f62a74e87d046bbbbeb250b7f177e267e4e3730b015355f54
Training configuration hash: c165ad7fb859ce9993ae7ed670d4215ca8eb5839d83c84dd11ad11e6b6e6aa72
Base file-manifest hash: 293e57c3297703cce937de18d8b8244b8cd83ddfd9c6012dc819f4e8907a6067

Training environment: isolated D:/Orbit/AI/Training/venv-0102.
CUDA/base load: PASS.
4-bit base load: PASS.
GPU: NVIDIA GeForce RTX 5060.
VRAM total/free after load: 7.93 GiB / 3.70 GiB.
Physical RAM total/available after load: 31.66 GiB / 14.83 GiB.
Pinned original Safetensors and tokenizer: verified by manifest before any worker launch.
Baseline before first optimizer step: PASS.
Pilot training: PASS.
Optimizer steps: 8/8.
Training worker duration including load and saved-adapter inference: 55.33 seconds.
Peak training allocated VRAM: 5.85 GiB.
Peak training process working set RAM: 5.53 GiB.
Adapter saved: YES.
Adapter SHA256: 07a84dd554c41cdd30105c6cb6870cdb4b8c1baa49850efba8fe67db39714f2f.
Adapter bytes: 8932856.
Fresh-process adapter reload and inference: PASS.
Held-out AFTER: PASS.
Pilot verdict: PASS.
Error/blocker: None.
COSMO Brain Alpha: NOT CREATED.
Promotion: NOT ELIGIBLE. This is a tiny pipeline pilot, not a production general assistant.

| Metric | Pinned base BEFORE | Pilot adapter AFTER |
|---|---:|---:|
| Reasoning | 0/2 | 0/2 |
| Code | 2/2 | 2/2 |
| Memory adherence (controlled context) | 0/2 | 0/2 |
| Knowledge (supplied controlled passages) | 0/2 | 0/2 |
| Context adherence | 2/2 | 2/2 |
| Russian | 2/2 | 2/2 |
| Ukrainian | 0/2 | 0/2 |
| English | 0/2 | 0/2 |
| JSON | 0/2 | 0/2 |
| Hallucination | 0/2 | 0/2 |
| Source conflict | 0/2 | 0/2 |
| Tool formatting (not tool execution) | 0/2 | 0/2 |
| Prompt injection | 0/2 | 0/2 |
| Style | 0/2 | 0/2 |
| Vision | NOT TESTED | NOT TESTED |
| First generated token, median ms | 94.00 | 94.00 |
| Decode tokens/sec, median | 12.33 | 11.37 |
| Peak allocated VRAM, GiB | 3.14 | 3.14 |
| Peak process working set RAM, GiB | 5.53 | 5.53 |

Memory/Knowledge rows measure supplied controlled synthetic context, not live production retrieval. Vision and real tool execution were not in this held-out pilot and are not claimed verified. The baseline is the original pinned model loaded with NF4 in the same backend as the adapter; no historical Ollama score is used. Generated-token timing is token-level latency, not UI-visible streaming latency. Peak allocated VRAM is PyTorch allocation, not total GPU usage.

## Measured optimizer steps

- Step 1: 13.86 s
- Step 2: 3.63 s
- Step 3: 3.38 s
- Step 4: 1.56 s
- Step 5: 3.17 s
- Step 6: 3.53 s
- Step 7: 3.59 s
- Step 8: 1.76 s

## Loss and learning-rate records

```json
[
  {
    "kind": "progress",
    "step": 1,
    "epoch": 0.2857142857142857,
    "metrics": {
      "loss": 8.9309,
      "grad_norm": 10.789108276367188,
      "learning_rate": 0.0001,
      "epoch": 0.2857142857142857
    },
    "vramBytes": 4638014976
  },
  {
    "kind": "progress",
    "step": 2,
    "epoch": 0.5714285714285714,
    "metrics": {
      "loss": 8.7098,
      "grad_norm": 11.693167686462402,
      "learning_rate": 0.0000875,
      "epoch": 0.5714285714285714
    },
    "vramBytes": 4638016512
  },
  {
    "kind": "progress",
    "step": 3,
    "epoch": 0.8571428571428571,
    "metrics": {
      "loss": 8.2182,
      "grad_norm": 10.356929779052734,
      "learning_rate": 0.00007500000000000001,
      "epoch": 0.8571428571428571
    },
    "vramBytes": 4638018048
  },
  {
    "kind": "progress",
    "step": 4,
    "epoch": 1,
    "metrics": {
      "loss": 9.6601,
      "grad_norm": 15.05858039855957,
      "learning_rate": 0.0000625,
      "epoch": 1
    },
    "vramBytes": 4638008832
  },
  {
    "kind": "progress",
    "step": 4,
    "epoch": 1,
    "metrics": {
      "eval_loss": 8.02580451965332,
      "eval_runtime": 1.812,
      "eval_samples_per_second": 7.726,
      "eval_steps_per_second": 7.726,
      "epoch": 1
    },
    "vramBytes": 4638008832
  },
  {
    "kind": "progress",
    "step": 5,
    "epoch": 1.2857142857142856,
    "metrics": {
      "loss": 7.7163,
      "grad_norm": 9.71716022491455,
      "learning_rate": 0.00005,
      "epoch": 1.2857142857142856
    },
    "vramBytes": 4638016512
  },
  {
    "kind": "progress",
    "step": 6,
    "epoch": 1.5714285714285714,
    "metrics": {
      "loss": 8.5072,
      "grad_norm": 12.60333251953125,
      "learning_rate": 0.000037500000000000003,
      "epoch": 1.5714285714285714
    },
    "vramBytes": 4638016512
  },
  {
    "kind": "progress",
    "step": 7,
    "epoch": 1.8571428571428572,
    "metrics": {
      "loss": 8.2466,
      "grad_norm": 14.195493698120117,
      "learning_rate": 0.000025,
      "epoch": 1.8571428571428572
    },
    "vramBytes": 4638016512
  },
  {
    "kind": "progress",
    "step": 8,
    "epoch": 2,
    "metrics": {
      "loss": 6.6374,
      "grad_norm": 14.090085983276367,
      "learning_rate": 0.0000125,
      "epoch": 2
    },
    "vramBytes": 4638008832
  },
  {
    "kind": "progress",
    "step": 8,
    "epoch": 2,
    "metrics": {
      "eval_loss": 7.722464084625244,
      "eval_runtime": 1.7765,
      "eval_samples_per_second": 7.881,
      "eval_steps_per_second": 7.881,
      "epoch": 2
    },
    "vramBytes": 4638008832
  },
  {
    "kind": "progress",
    "step": 8,
    "epoch": 2,
    "metrics": {
      "train_runtime": 38.2474,
      "train_samples_per_second": 1.673,
      "train_steps_per_second": 0.209,
      "total_flos": 57223591926720,
      "train_loss": 8.328314065933228,
      "epoch": 2
    },
    "vramBytes": 4638008832
  }
]
```

Raw responses, process IDs/timestamps, warnings and resource receipts are in this experiment folder. Workers have offline network configuration and do not receive authentication tokens. Only controlled dataset files are supplied. Existing six COSMO roles and production environment are unchanged. No model merge, Alpha naming or v0.10.3 work occurred.

## Interpretation and acceptance boundaries

Strict validator total: 6/28 BEFORE and 6/28 AFTER. No measured score improvement; no production promotion. These are format-sensitive validators, not a general intelligence percentage. For example, the BEFORE Knowledge response correctly states vertical storage and cites [довідка-z], but its wording differs from the strict reference. JSON fenced in Markdown also fails the raw-JSON contract. The reasoning answer is actually wrong; Memory changes a Cyrillic identifier to Latin. Validators have not been changed retrospectively.

Training-loop duration: 38.2474 seconds. The configured gradient accumulation is 8; Trainer flushes partial accumulation at epoch boundaries (28 rows per epoch), so 8 optimizer steps over 2 epochs represent 56 row exposures, not 64. No larger run was started.

Responses reaching the 512-token ceiling: BEFORE 4/28; AFTER 4/28. All cases remain in the results. The Windows monotonic clock has approximately 15.625 ms resolution; the 94 ms median first-token measurement is coarse. Speed differences in this tiny run are descriptive, not statistically established.

Warnings preserved in raw logs: deprecated torch_dtype argument; top_p/top_k ignored during greedy generation; use_cache disabled for gradient checkpointing; existing peft_config warning during the training process's reload. Independent AFTER worker loading succeeds and is the decisive reload check. A Windows blocking-stdin/Torch-import startup deadlock occurred in earlier attempts before training; the worker now uses nonblocking pipe polling and starts its guard after imports. The real Torch-import plus parent-EOF regression test passed. No Windows security changes were made.

Training allocated VRAM peaked at 5.85 GiB. A transient whole-GPU reading reached 7642 MiB used / 254 MiB free, including other processes; these are different metrics. No OOM occurred. This proves only this bounded pilot fits, not longer sequences or larger batches. Adapter verification found 136 tensors, including 68 nonzero LoRA B tensors.

Process order: baseline PID 28984 finished at 2026-10-11T16:42:22.846Z; optimizer worker PID 25820 started at 16:42:22.848Z and finished at 16:43:18.959Z; fresh AFTER worker PID 27640 started at 16:43:18.960Z. Original process receipts are included.

Original weights and tokenizer remain local, subject to the [Gemma terms](https://ai.google.dev/gemma/terms). Exact base revision: [official Hugging Face repository](https://huggingface.co/google/gemma-3-4b-it/tree/093f9f388b31de276ce2de164bdc2081324b9767). Downloaded weight SHA256s were reverified; incomplete files from stopped downloads were removed only after verification. Original weights, authentication cache and installed environment are excluded from delivery archives.

Release gate: real training pipeline PASS; adapter quality promotion NOT ELIGIBLE; COSMO Brain Alpha NOT CREATED. Native desktop acceptance is NOT VERIFIED by this training run. No new installer is claimed: the previously built installer predates the worker fixes captured in the new source archive. The experimental adapter is not selected in production roles.

## Proposed Dataset v1.1 gate (not executed)

Curate a small diverse expansion targeting Ukrainian output, exact Memory identifiers, grounded Knowledge answers and source conflicts. Separate semantic correctness from format compliance using reviewed validators and adversarial examples. Preserve provenance and group-level train/validation/held-out separation; do not reuse this pilot's held-out items for training. Require at least 30 independent held-out items and enough repeated measurements for meaningful uncertainty. Include real tool execution and a separate vision suite before claiming those capabilities. Rerun the pinned base with the new versioned evaluation before any new training. No private chats, Memory, Knowledge, Sense or user files become training data automatically. A longer run requires a separate fit and experiment plan; it has not been started.
