# Future COSMO LoRA/QLoRA design — not implemented training

Goal: improve instruction following, Russian/Ukrainian/English communication, complete use of supplied context, source fidelity and structured outputs on an appropriately licensed existing model. Do not train a foundation model from scratch.

Candidate selection will require measured local baselines, hardware fit, license review and a held-out evaluation set. LoRA/QLoRA training infrastructure, CUDA packages and datasets are not installed by Model Studio. No training job or model weights are included in this release.

A future explicit dataset export could produce JSONL records with: schema version, example ID, task type, language, messages, expected behavior, source provenance, source license, explicit consent identifier, permitted purpose, redaction report and split assignment. Example:

```json
{"schemaVersion":1,"id":"synthetic-001","task":"source-adherence","language":"en","messages":[{"role":"user","content":"Using supplied source S1: the silver planet is Nereon. What is the silver planet?"}],"expected":"Nereon [S1]","provenance":{"kind":"synthetic","source":"ORBIT controlled eval authoring"},"license":"review-required","consent":"explicit-export-required","split":"train"}
```

This is a format proposal, not exported user data. Conversations, memories, documents, screenshots, secrets and browser history are excluded by default. Any future inclusion must be explicit, scoped, reviewable and redactable before export. Consent for local inference is not consent for training or uploading data. Export and training are separate actions. No silent feedback collection, telemetry or cloud upload is permitted.

Keep training and held-out eval sources disjoint; preserve licenses and provenance; measure regression against the original model and existing Memory/Knowledge/privacy acceptance. Do not call an adapter a COSMO foundation model. Publish only actual measurements, model-card limitations and authorized artifacts.
