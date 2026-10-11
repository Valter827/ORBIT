# ORBIT 0.10.2 — base selection before training

Selected for a bounded pilot: **google/gemma-3-4b-it**, original instruction-tuned Safetensors revision `093f9f388b31de276ce2de164bdc2081324b9767`. No model is selected for COSMO distribution yet. Original-weight behavior must be measured again; the 0.10.1 Ollama quantization is not assumed numerically identical.

| Candidate | Evidence | Training practicality and decision |
|---|---|---|
| Gemma 3 4B Instruct | Memory 4/4 and Knowledge PASS; Core 67.42%; generated code 32/32; RU/UK 6/10 | Smallest tested candidate. Gemma 3 supported by Transformers; PEFT QLoRA is a documented method. Select for pilot only. 8 GiB fit not measured. |
| Qwen 3.5 9B | Core 79.24%, strong RU/semantics/vision; Knowledge empty final; RAM pressure | Larger hybrid architecture and final-output reliability concerns; not first general adapter. |
| Ministral 3 8B | Fastest warm visible TTFT; generated code 32/32; injection 0/2 and invented UK dates | Strong specialist, weaker general reliability; 8B training fit not established. |
| DeepSeek R1 0528 Qwen3 8B | Best reasoning 21/26; Memory final 2/4; budget-starved outputs | Weighted score alone is insufficient; retain Logic role, not first general fine-tuning base. |

Choose Instruct rather than pretrained Base to preserve existing instruction-following behavior while adapting grounding/formatting. Text-only QLoRA targets discovered language attention modules; the vision encoder/projector remain frozen. This does not guarantee visual behavior is preserved: a future promotion requires real vision re-evaluation.

License gate (documentation review, not legal guarantees): Gemma Terms allow use/modification and distribution subject to restrictions, notices and use policy. Fine-tuning YES with terms; commercial use YES with terms; adapters/derivatives YES with terms; redistribution YES with conditions. Qwen/Ministral candidate cards identify Apache-2.0; DeepSeek identifies MIT with underlying-model notices. No unclear license becomes a default distribution base. Access to Google's gated repository must be accepted by the user; ORBIT does not bypass it.

The official two Safetensors shards total 8,600,277,880 bytes. No original weights or CUDA training libraries are installed by this release automatically. Provisioning scripts require explicit flags; Python is separate from production Node/Rust. On the inspected machine, bundled Python has none of torch/transformers/PEFT/bitsandbytes/accelerate/safetensors. C: has less free space than the original weights alone, while D: has ample capacity. The proposed D: environment and model download remain approval-gated.

Estimated pilot footprint: VRAM 6–10 GiB, host RAM 12–24 GiB, reserve 25 GiB storage. These are rough planning ranges, NOT measured compatibility or a promise. Start with batch 1, rank 8, sequence 512, NF4 double quantization, gradient accumulation 8, checkpointing and eight optimizer steps. Full training requires a real saved/reloaded pilot adapter. No retries replace failed-run history.

Backend deployment: saved PEFT adapter loading and real inference are implemented in the isolated worker. **Ollama adapter import is NOT VERIFIED** for this exact architecture/runtime; GGUF conversion/merging is not automatic. Existing six COSMO roles remain unchanged.

Primary references checked 2026-10-10:
- https://huggingface.co/google/gemma-3-4b-it
- https://ai.google.dev/gemma/terms
- https://huggingface.co/docs/transformers/model_doc/gemma3
- https://huggingface.co/docs/peft/developer_guides/quantization
- https://huggingface.co/docs/bitsandbytes/installation
- https://docs.ollama.com/import
- https://huggingface.co/Qwen/Qwen3.5-9B
- https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512
- https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B

A current Google QLoRA guide now demonstrates Gemma 4 and a >16 GiB GPU; it is NOT evidence that Gemma 3 4B trains successfully on this 8 GiB card.
