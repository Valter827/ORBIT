> Update 2026-09-29: Real local chat, streaming, cancellation, history, Knowledge, Sense and image-only vision now PASS with gemma3:4b in browser/core mode. Local Agent is unsupported; native Windows build remains blocked. See [real acceptance report](ORBIT_V061_REAL_LOCAL_AI_ACCEPTANCE.md). Earlier status below is historical.

# ORBIT 0.6.1 — COSMO 1.0 REPORT

Date: 2026-09-28
ORBIT Version: **0.6.1**
COSMO Version: **1.0**

**Implementation delivered; real local acceptance and Windows packaging are not complete.**
The Windows build failed because Application Control blocked the newly compiled Rust build script (OS error 4551). The policy was not bypassed. No fresh 0.6.1 installer exists and the 0.6.0 installer is not substituted.

| Requirement | Status | Evidence / limits |
| --- | --- | --- |
| COSMO Profile | PASS | Built-in stable ID, restrained identity, instructions, version, safe defaults |
| COSMO Seed Idempotency | PASS | SQLite restart, one built-in, user customization and existing selection preserved |
| Local Setup Wizard | PASS | Browser walkthrough: detect, select, acknowledge local inference, test, Chat; protocol fixture |
| Hardware Detection | PARTIAL | Real Ryzen 5 7500F, 32 GiB RAM, NVIDIA GeForce RTX 5060 and free drive space; VRAM Unknown |
| Runtime Detection | PASS | Real loopback probes correctly returned none; no model labelled installed from catalog |
| Runtime Guided Setup | NOT VERIFIED | Explicit official-installer action and instructions implemented; no third-party installer run |
| Real Model Discovery | NOT VERIFIED | No genuine local runtime currently available |
| Model Download | NOT VERIFIED | Pull/progress/cancel/disk checks PASS with labelled fixtures; no model weights downloaded |
| Real Local Chat | **NOT VERIFIED** | Genuine model acceptance has not run |
| Streaming | PASS for protocol tests; real model NOT VERIFIED | True SSE and cancellation tests; complete-response fallback without artificial token splitting |
| Cancellation | PASS | Request cancellation, download cancellation, cancellation during disk detection and model discovery |
| Chat Persistence | PASS | Stable conversation ID, SQLite reopen and retained messages |
| Multiple Chats | PASS | Separate IDs/history; regeneration does not duplicate a turn |
| Knowledge | PASS | Relevant source included and source attribution retained in fixture integration |
| Memory | PASS | Private AI memory on; shared/project off by default; duplication and profile isolation tested |
| Agent | NOT VERIFIED with genuine local model | Core tools/permission/Undo regressions PASS; UI blocks unconfirmed tool capability; no Pilot |
| Sense Integration | PASS | COSMO receives structured Sense context through existing privacy gates; fixture inference |
| Real COSMO + Sense | **NOT VERIFIED** | No real model response to an actual screen question established |
| Local Only | PASS | Existing fail-closed routing and cloud-backed model rejection retained; fixture tests pass |
| No Hardcoded AI Responses | PASS | Production answers come from provider requests; fixture servers remain test-only |
| Security Regression | PASS | Core suite plus 3 release signing tests; no policy changes or signing bypass |
| Windows Build | **FAIL — BLOCKED** | Application Control prevented orbit build-script-build execution, error 4551 |
| Installer | **NOT VERIFIED / NOT PRODUCED** | No ORBIT_0.6.1_x64-setup.exe generated |
| Signed Release | **NOT AVAILABLE** | No trusted signing identity; production preflight fails closed |

## Tests and checks
- **229 PASS / 0 FAIL / 11 SKIP** (240 core tests).
- **3 PASS / 0 FAIL** release pipeline tests.
- npm ci, TypeScript, ESLint, Prettier and Rust formatting: PASS.
- Frontend production build: PASS.
- Packaged JSONL IPC with bundled Node and isolated working directory: PASS.
- Browser regression: PASS on the tested UI; COSMO wizard uses an explicitly labelled protocol fixture. Agent approval/diff, history/restart, Undo, clipboard browser behavior, settings and keyboard flows are included.
- Native clipboard, installed shortcuts, final native shell, tray and uninstall for 0.6.1: NOT VERIFIED.
- Browser screenshots: cosmo-local-setup-v061.png (actual hardware, no runtime); cosmo-setup-fixture-v061.png (explicit test model).
- Windows failure log: validation/windows-build-v061.log.

The IPC test's expected missing-provider message was updated for unconfigured COSMO. Browser tests added accessible labels and caught stale capability state after reconnection; the app now refreshes cached model status. No fixture is claimed to be genuine AI.

## Installer
Installer Path: **N/A — build blocked**
Installer Size: **N/A**
SHA256: **N/A**
Expected filename after a successful permitted build: ORBIT_0.6.1_x64-setup.exe.

## Implementation notes
COSMO is added by an idempotent seed without replacing existing assistants, Knowledge, Memory, chats, credentials or settings. Built-in metadata is separate from editable settings; duplicates/imports are ordinary user profiles. Brain changes modify provider/model binding and retain identity and stored data.

The guided runtime is Ollama, separately installed through its official page. LM Studio and llama.cpp-compatible local endpoints remain supported. Model pull uses the fixed loopback Ollama API and an explicit reviewed catalog; sources and model terms are shown. Download progress is per layer, disk-headroom checks fail closed, and partial model files remain under runtime control.

COSMO uses existing Chat, Knowledge, Memory, Agent and Sense code. Sense stays OFF by default. Agent remains gated by actual discovered tool support and ORBIT security. No Pilot, security-policy change, cloud fallback, silent install or automatic multi-GB download was introduced.

## Remaining gates
The user was asked for the explicit runtime/model installation approval required by the supplied prompt; no answer was received during implementation. Ollama and Gemma have therefore not been installed/downloaded. After that approval and a permitted runtime installation, run the real Russian introduction, second-message context, restart/history and live Sense question acceptance. Local Agent additionally needs a genuinely tool-capable model.

Windows packaging requires an environment whose application-control policy permits the legitimate Rust build tools and a trusted signing identity for a signed release. Do not disable or bypass the policy.

See [COSMO setup guide](docs/COSMO_LOCAL_AI.md), [third-party notices](docs/LOCAL_AI_THIRD_PARTY_NOTICES.md), and [Sense privacy guide](docs/ORBIT_SENSE.md).
