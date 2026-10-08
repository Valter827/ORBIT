# Model Studio — ORBIT 0.10

COSMO 1.0 is an assistant identity. Its selected model is a replaceable inference backend. Changing a brain does not move or delete chats, Memory, Knowledge, permissions or assistant identity.

Open Model Studio from the sidebar or Settings → AI & Models. Reconnect obtains fresh inventories. Ollama discovery starts with a bounded, schema-validated `GET /api/tags`; it does not depend on `/v1/models`. CLI diagnostics use a known installed executable, fixed arguments, a numeric loopback `OLLAMA_HOST`, no shell and bounded output/time. ORBIT does not start a second server during discovery. CLI inventory alone is not HTTP readiness.

Runtime states distinguish no installation found in standard locations, installation with unavailable HTTP API, unavailable compatible endpoint, invalid service response, running without models, selected model missing, and valid inventory. A valid inventory does not prove inference or tools work. Custom local endpoints retain numeric-loopback validation, origin pinning and redirect rejection. No public scanning or telemetry occurs.

Installed model metadata comes from the runtime. Ollama digests, weight sizes, quantization and declared capabilities are separate from empirical capability probes. Missing facts are unknown. Embedding-only models are excluded from chat. No model is inferred to be a code model from its name.

Benchmarks run only after an explicit action. They contain synthetic prompts and execute sequentially under the core's inference guard. Stop aborts the request. SQLite stores bounded results and capability records, keyed by endpoint/provider/model/digest/runtime version. Schema migration 4 preserves earlier data. Changes to a digest/runtime invalidate probe identities.

Auto considers capability requirements, privacy policy, role preferences and comparable measured results. Manual selection stays manual. The controlled chat fallback can switch once, only before any output, only to an allowed model, never on user cancellation or after partial output. A fallback is recorded in the response details. Local Only filters out remote providers and cloud-backed runtime models.

Fast/Main/Code/Vision are routing preferences; capability gates still apply. Embedding assignment updates the existing shared local search backend. Existing vectors retain their backend identity and are not silently treated as vectors from a different model. Auto/unassigned does not delete models or indexes.

Hardware is measured locally; optional NVIDIA driver metadata supplies VRAM when available. Model-fit estimates use disk weights × 1.4 + 2 GB overhead and are clearly heuristic. They do not predict speed, actual KV-cache size or guaranteed fit. Benchmark timing is measured, not estimated.

Add local model opens the existing reviewed download flow with size, source, license, storage confirmation, progress and cancellation. Model Studio does not silently download weights. Advanced local generation controls expose temperature, top-p and the application's context budget, with reset. They do not claim to set an unsupported runtime context option.

Implementation/acceptance limitations are tracked in `WORKLOG-0.10.md`. Do not interpret a partial development build or browser screenshots as a completed native release.
