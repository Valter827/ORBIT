# ORBIT 0.5 BUILD YOUR OWN AI REPORT
Date: 2026-09-22. Windows x64.

## Release state
PARTIALLY BLOCKED: the earlier native 0.5.0 build is verified; final rebuild of the latest source is blocked by Windows Code Integrity. Do not treat the included installer as containing the last source changes.

Verified installer built: 2026-09-21 20:03:40 local time.
Installer: C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\ORBIT-v0.5-preview\ORBIT Setup - tested preview.exe
Size: 27,598,366 bytes
SHA256: 17B7711F98495658B7DDE2058579D25E6872A8FE859DE60BA0B749F89A72FECF
Current source ZIP: C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\ORBIT-v0.5-preview\ORBIT-v0.5-current-source.zip

## Required acceptance
| Area | Result | Evidence / scope |
| --- | --- | --- |
| Windows Build | FAIL for final source; earlier build PASS | Earlier EXE/NSIS built and installed; current rebuild blocked by OS signing policy |
| Installer | PASS for included preview | Real NSIS installation and Desktop shortcut launch |
| AI Studio | PASS | Native My AIs cards and creator |
| Create My AI | PASS | Ten-step native NOVA creation |
| Profile Persistence | PASS | Native restart retains profile and selection |
| Personality Builder | PASS | Native Friendly preset and unit-tested slider instructions |
| Brain Selection | PASS | Native discovery/selection using labelled HTTP fixture |
| Provider Switching | PASS | Unit regression preserves UUID, instructions, knowledge and memory |
| Knowledge | PASS | Private per-AI sources and previews |
| Knowledge Ingestion | PASS | Native note; actual filesystem ingestion/exclusions/hash/limits/cancellation in tests |
| RAG | PASS for retrieval/protocol | Actual FTS5 retrieval and local embedding HTTP protocol tested; no real LLM acceptance claimed |
| Source Attribution | PASS | Native passage opened from chat source reference |
| Memory | PASS | Core edit, disable, search, delete and controlled UI actions |
| Memory Isolation | PASS | Private memory does not appear in another AI; explicit shared opt-in |
| Tools | PASS | Existing real-engine UI regression with actual filesystem/terminal actions |
| Permissions | PASS | Existing policies and standing-grant/profile Ask regression |
| Malicious Profile Security | PASS for execution controls | Malicious instructions cannot authorize terminal, escape PathGuard or change risk classification |
| Knowledge Prompt Injection | PASS for execution controls | Retrieved injection remains context data; tool authority tested separately from a real model |
| AI Export | PASS for native IPC package | Version-2 package generated from installed app; OS Save dialog not automated |
| AI Import | PASS | Actual file input, review and import in installed app |
| Secret-free Export | PASS | Synthetic credential excluded; secret-pattern redaction and schema regressions |
| Portable AI Restore | PASS | Export, delete, import; knowledge/workflow restored with safe grants |
| Agent Mode | PASS with fixture provider | Real engine approvals, diff, file edit and verification |
| Undo | PASS | Restart then persistent Undo restores original file |
| Live Anthropic | NOT VERIFIED | No real credential supplied |
| Real Local LLM | NOT VERIFIED | No genuine supported model/runtime used |
| Desktop Native Acceptance | PASS for included preview | Installed WebView2, actual core, SQLite, Credential Manager and restart |

## Current-source checks
- npm test: 223 total, 212 PASS, 0 FAIL, 11 SKIP.
- npm run typecheck: PASS.
- npm run lint: PASS.
- npm run format:check: PASS.
- npm run frontend:build: PASS.
- Bundled runtime/core JSONL IPC without global Node/npm PATH: PASS.
- Browser UI regression of real agent engine and Undo: PASS.
- npm run build:desktop: BLOCKED/FAIL on latest source.
- cargo fmt: blocked by Windows application-control policy on latest run.

## Exact blocker
Windows Code Integrity events 3077 and 3033 report rustc.exe loading:
src-tauri\target\release\deps\ctor_proc_macro-bbedd9e10fc2e1f1.dll
The DLL does not meet the Enterprise signing level requirements / violates policy {0283ac0f-fff1-49ae-ada1-8a933130cad6}. Cargo consequently emits E0463 for Tauri dependencies. cargo-fmt also returned Windows error 4551. Changing source code or granting another Codex shell approval does not resolve this OS policy block. No security policy was disabled or bypassed.

Administrator approval under the machine's application-control policy, or another approved build environment, is required before the final rebuild can be completed.

## Latest source changes absent from the preview installer
- Explicit recovery/reattachment of indexed knowledge kept after deleting an AI, plus its regression test.
- Provider configuration directly inside the Brain wizard step.
- Explicit accessible label on the preview question field.
- Minor card wording adjustment.

The preview installer contains the ten-step creator, knowledge/RAG, managed memory, packages, profile history, skills/workflows, preview cancellation and existing hardened engine. The source ZIP includes the improvements above. This difference is not hidden by claiming 100% completion.

## Other limits
Native file/folder picker and export Save dialog UI were not automated. Filesystem ingestion and native export IPC are tested; PDF/DOCX are unsupported. Actual clipboard, tray/global shortcut/notification display and clean-machine WebView2 bootstrap were not revalidated for 0.5. The installer is unsigned; no SmartScreen reputation claim is made.

Evidence: validation/windows-v05-result.json, windows-v05-chat.png, windows-v05-studio.png; scripts/windows-v05-smoke.mjs; packages/core/test/ai-v05.test.ts. Historical 0.3 and 0.4 artifacts were preserved.

Blocked DLL SHA256: 47BA8B42AC75104CE575E8DCFC2EC26E5CF635D8FEC1E3BFE50F9072F5D86AA0
