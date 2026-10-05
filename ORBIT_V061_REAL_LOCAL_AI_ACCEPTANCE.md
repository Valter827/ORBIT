# ORBIT 0.6.1 REAL LOCAL AI ACCEPTANCE

Date: 2026-09-29
ORBIT: 0.6.1 · COSMO: 1.0 · Ollama: 0.34.4
Model: **gemma3:4b** (4.3B, Q4_K_M)

**Real local AI acceptance passed in the available browser/core environment. No fixture or mock model was used.**
The UI ran production frontend assets against a separate production core process, the actual installed Ollama and actual downloaded model. Tauri transport was adapted for the browser; the Windows Sense helper captured a real, dedicated public test window. The blocked Rust shell/broker and installer were not executed or claimed as validated.

| Check | Result |
| --- | --- |
| Ollama installation | PASS |
| Real runtime detection | PASS |
| Real model installed | PASS — gemma3:4b |
| Real COSMO chat | PASS |
| Real streaming | PASS |
| Real cancellation | PASS |
| Conversation context | PASS |
| Restart/history | PASS |
| Knowledge + real model | PASS |
| Sense + real model | PASS — actual UIA text + local model |
| Vision image path | PASS — actual window image, extracted text omitted |
| Local Only | PASS |
| Local Agent | UNSUPPORTED |
| Windows Build | BLOCKED |
| Installer | NOT PRODUCED |

## Runtime and installation
Official installer source: https://ollama.com/download/OllamaSetup.exe (linked by the official Windows download page).
Authenticode: **Valid**, publisher **Ollama Inc.**
Installer size: 1571115536 bytes.
Installer SHA256: 4A6514323EB8C131F6C8BB651B4FE2EDF5F1525F4FD8B84315BA20F1AF3E210F.
Installed executable: C:\Users\User\AppData\Local\Programs\Ollama\ollama.exe.
API: http://127.0.0.1:11434; real version response: 0.34.4.

Model size reported by Ollama: 3338801804 bytes.
Model digest: a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a.
The actual pull completed digest verification before success. No model was labelled installed from the catalog.
Ollama reported completion and vision capabilities; tool calling was absent.
A runtime /api/ps observation reported 2,875,520,450 bytes in VRAM and an active 4096-token context. The model's advertised maximum is 131072, which is not a claim that the current runtime allocated that maximum.
gemma3:1b fallback was not needed: 4b loaded and completed the real acceptance requests.

## COSMO and conversation context
Only user-specified public test content was used, beginning with “Меня зовут Алекс.”
For “Привет. Представься одним предложением.”, the actual answer was:

> Я COSMO, ваш персональный помощник в ORBIT, готовый помочь вам в решении задач и обучении.

The exact requested context question returned:

> В контексте этого разговора, тебя зовут Алекс. Я запомнил это, когда ты представился.

An additional question without the name, “Как меня зовут? Ответь только именем.”, returned:

> Алекс.

The real core process was stopped and restarted: PIDs 16060 → 12556. All 8 existing messages were read back unchanged from SQLite, the previous conversation opened in the browser UI, and the selected COSMO/model binding persisted. Provider configuration was reloaded from a file, not rebuilt from a model fixture.

## Streaming and cancellation
The selected long streaming response contained 223 real SSE frames across 222 received network chunks. The UI/core observed progressive text lengths rather than splitting a completed answer into words.

After clicking **Stop generating**, the real inference HTTP response closed with complete=false and aborted=true (17 received SSE frames). Core status became “Generation stopped.” Text remained at 46 characters after a further wait. This verifies cancellation of the actual request, not merely hiding the UI.

## Knowledge
A real UTF-8 file, ORBIT_TEST_FACT_928.txt, was ingested through the production knowledge pipeline:
ORBIT_TEST_FACT_928 = "The silver planet is Nereon."

Actual answer:
> According to my knowledge base, the silver planet is Nereon.

Source metadata: **ORBIT_TEST_FACT_928.txt**.

## Sense
A real Windows window displayed the France question with A) Berlin, B) Madrid, C) Paris, D) Rome. The production Sense helper read the selected window through UI Automation; OCR was unnecessary for the text path. No unrelated windows were exposed to the browser adapter.

Actual answer to the Russian Sense request:
> Based on the information presented, the question is: “What is the capital of France?” and the options are A) Berlin, B) Madrid, C) Paris, and D) Rome.
> 
> The correct answer is C) Paris.
> 

Path: structured-context. This first result was extracted screen text, not image understanding.

A separate request used an actual JPEG captured from that window, with visibleText, ocrText and control nodes removed from the request. The image was 24665 bytes; SHA256 2fce2c97a33e7a9451328b2a2cef5b90d2d6bf1b62f2c53fb886d30e57d37674.
Actual vision-path answer:
> Based on the provided information, the correct answer is **C) Paris**.
> 
> The question asks "What is the capital of France?" and the multiple-choice options include Paris.

The production provider reported path=vision. The image request did not include extracted screen text. One earlier attempt answered only “C”, also the correct option; the successful recorded run returned C) Paris explicitly. Raw screenshots were not persisted by the application; browser evidence images contain only this isolated public test data.

## Local Only and Agent
Local Only was enabled in the actual ORBIT UI and remained enabled for the repeated chat and Sense requests.
All observed inference requests targeted **http://127.0.0.1:11434**. Remote requests observed: **0**. No Anthropic/remote provider or API key was configured in this isolated acceptance environment. The observer logged method destinations/stream metadata, never request headers or private prompts.

Runtime metadata confirmed text and vision, but not tools. Therefore **Local Agent = UNSUPPORTED**. No Agent PASS is inferred from successful chat.

## Limits and observations
- Native Rust broker, installed Desktop shortcut, tray and native clipboard remain unverified for 0.6.1. Browser/core acceptance is explicitly separate.
- Windows Application Control previously blocked the 0.6.1 Rust build script (error 4551). No policy was changed, no binaries renamed, and no bypass attempted. No 0.6.1 installer exists.
- Functional success is not a factual-accuracy benchmark. The streaming sample incorrectly called Mercury the hottest planet; some Sense replies used English despite a Russian question. Outputs were preserved rather than corrected or replaced. These are model-quality limitations, not a fabricated PASS for accuracy.
- Existing user chats, credentials, Knowledge and settings were not opened or overwritten. Acceptance used a separate local test database containing only the public test messages. Model weights and that database are excluded from delivered archives.
- Harness selectors were corrected for asynchronous controlled checkboxes and duplicate text in chat history. These were test-driver issues, not substituted model responses.

## Evidence
- [Structured results](validation/real-local-acceptance-v061.json)
- [Official installation evidence](validation/ollama-installation-real-v061.json)
- [Actual installed models](validation/ollama-models-real-v061.json)
- [Completed real download](validation/ollama-model-download-real-v061.json)
- [Network metadata](validation/real-local-network-1790660745463.jsonl)
- [COSMO chat](validation/cosmo-real-chat-v061.png)
- [Knowledge](validation/cosmo-real-knowledge-v061.png)
- [Sense](validation/cosmo-real-sense-v061.png)
- Reproduction: scripts/real-local-acceptance.mjs and scripts/real-local-network-observer.mjs. These use real Ollama; they contain no model fixture.
