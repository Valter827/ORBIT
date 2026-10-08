# Model evaluation protocol

Suite `cosmo-0.10-baseline-3` uses bounded synthetic cases for instructions, final-answer arithmetic, JavaScript output semantics, English/Russian/Ukrainian language behavior, JSON contract, supplied project-context completeness, source adherence, controlled web evidence, hallucination, prompt injection, classification, summary and bounded longer-context recall. Exact validators are inspectable in `packages/core/src/ai/model-studio.ts`. Generated code is not executed. Results are narrow task measurements, not general-intelligence rankings.

Compatibility probes separately test chat, stream, a synthetic vision image, structured output, harmless tool-call protocol, Russian, real-stream cancellation and a strict JSON schema. Unsupported/unknown cases remain visible. A short context recall test does not establish a maximum context window. Runtime limits remain metadata.

Each persisted run records suite/model identity, digest/runtime metadata when available, hardware, generation settings, date, ORBIT version, per-case responses/errors, validation outcomes and duration. One to three repetitions are supported. Displayed comparison requires matching suite and generation configuration. Earlier suite versions are retained and must not be mixed into a new score.

Time to first token is measured at the first nonempty streamed content event. Total time covers the provider call. Tokens/second is explicitly end-to-end output tokens divided by total call time; it is present only when the runtime supplies actual usage counts. It is not a tokenizer estimate or a pure GPU decode rate. Warm/cold state and process resource use remain UNKNOWN when not measured.

The initial baseline-1 measured 11/14 checks passing on real gemma3:4b. Baseline-2 repeated the same 14 cases twice and measured 20/28. These are separate runs, not a guaranteed stable model score. Arithmetic, Ukrainian exact wording and unconstrained JSON failed; code semantics also failed in the repeated run. Raw failures are preserved. Schema-constrained JSON passed the separate protocol probe. Do not replace a failed unconstrained JSON check with that protocol success.

Embedding suite `cosmo-0.10-embedding-1` runs the real local embedding backend and compares multilingual synthetic relevance against an unrelated passage. It records actual dimensionality and batch time, and never sends an embedding model a chat task.

`scripts/model-studio-real-acceptance.mjs` exercises actual runtime discovery, benchmark execution, embedding vectors, isolated Memory retrieval/context/final facts, and restart persistence. `scripts/model-studio-ui-acceptance.mjs` connects a browser to production core and real Ollama through a test IPC bridge. Browser acceptance is not native acceptance. Test fixtures in unit tests prove control flow/security only and are not real AI measurements.

Release results, missing coverage and native status remain in the work log until the release gate is actually complete.
