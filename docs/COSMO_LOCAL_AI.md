> Update 2026-09-29: Real local chat, streaming, cancellation, history, Knowledge, Sense and image-only vision now PASS with gemma3:4b in browser/core mode. Local Agent is unsupported; native Windows build remains blocked. See [real acceptance report](../ORBIT_V061_REAL_LOCAL_AI_ACCEPTANCE.md). Earlier status below is historical.

# COSMO 1.0 — local AI in ORBIT 0.6.1

COSMO is a built-in assistant profile, not a model. ORBIT remains Build Your Own AI. Custom assistants, Knowledge, Memory, Chat, Agent and Sense are retained.

## Start
Choose **Set Up Local AI** on first run, or **Set up COSMO / Brain settings** on Home. The six setup stages show this PC, discover local runtimes, select an installed model, download/configure, send a real test request, and start chatting. No API key is needed for unauthenticated loopback runtimes.

Ollama is the guided path. Its official Windows installer page opens only after the user clicks Install. Installation is separate and manual; ORBIT does not silently execute or redistribute it. Return to ORBIT and choose Check again after starting Ollama. Existing LM Studio (1234) and llama.cpp-compatible (8080) servers are also discovered. Advanced provider settings retain custom endpoints and cloud providers.

The reviewed Gemma 3 catalog offers 1B (approximately 815 MB) and 4B (approximately 3.3 GB). These are third-party Google models. RAM thresholds (8/16 GiB) are conservative setup guidance, not measured benchmarks or working-memory estimates. Runtime capabilities and installed models come from discovery, never the catalog. GPU name is queried from Windows; VRAM remains Unknown because Win32 adapter memory is not reliable enough.

## Downloads
Downloads require a separate click accepting model terms and confirmation of the displayed Ollama model-storage location. The core checks that drive before requesting the fixed loopback Ollama pull API; unknown free space and insufficient space fail closed. Required headroom is catalog bytes × 1.25 + 512 MiB. If the running Ollama process uses another location, use Ollama to download instead.

Progress reflects the current runtime layer, not an invented aggregate percentage. Cancel aborts the HTTP request, including cancellation during disk detection. The runtime may retain partial layers for resuming; ORBIT does not mark a cancelled model ready. No automatic model update or removal occurs. After success, refresh installed models, choose the model and test it.

## Chat and readiness
A model test sends a real request through the existing provider router with COSMO instructions. No successful inference means no Ready state. Test cancellation covers discovery and inference. Health checks refresh selected-model availability approximately every 15 seconds while Chat is mounted; Offline and Model unavailable preserve chats and never switch providers automatically.

Chat uses real provider streaming. Non-streaming providers use a single complete response, without simulated token animation. Enter sends, Shift+Enter adds a line, Stop cancels, Regenerate makes a new request. Conversations retain stable IDs from creation through SQLite persistence. Multiple chats, copying, scoped Knowledge and Memory use existing ORBIT mechanisms.

COSMO defaults to conversation and private AI memory enabled; project and shared memory disabled. Messages are not automatically made permanent memories. A stable built-in ID seeds one COSMO without overwriting existing profiles, selected AI or customizations. Duplicates/imports become ordinary user profiles; credentials are not cloned. Provider binding may reference an existing credential-managed provider.

## Agent, Sense and privacy
Agent is disabled until discovered model metadata confirms tool support; the core independently enforces it. Path Guard, command risk, permissions, cancellation, verification and Undo remain authoritative.

Sense remains OFF by default. Existing explicit scope, Stop, credential redaction, remote acknowledgement and image capability gates apply to COSMO. Non-vision models receive extracted text, not a claim of image understanding. Pilot is not implemented.

Local Only enforces ORBIT routing and rejects cloud-backed models, remote providers and unconfirmed local inference. No cloud fallback exists. Arbitrary local software can still communicate externally; ORBIT does not claim to control it. Installed local models may work offline; downloads, cloud, updates and web services require a network.

## Validation
See ORBIT_V061_COSMO_REPORT.md. Protocol/UI fixtures validate implementation but are never real-model acceptance. Live local chat, live COSMO + Sense and local Agent remain NOT VERIFIED until run with a genuine installed model. Native installer acceptance is separate from browser validation.

Sources checked 2026-09-28:
- [Ollama Windows setup and storage](https://docs.ollama.com/windows)
- [Ollama pull API](https://docs.ollama.com/api/pull)
- [Gemma 3 model catalog](https://ollama.com/library/gemma3)
- [Gemma terms](https://ai.google.dev/gemma/terms)
