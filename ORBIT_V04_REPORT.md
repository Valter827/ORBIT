# ORBIT 0.4.0 validation report
Date: 2026-09-21. Platform: Windows x64.

## Deliverables
- Installer: C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\ORBIT-v0.4-release\ORBIT Setup.exe
- Installer size: 27,565,454 bytes
- SHA-256: AF390207CBDD9436D96628E98A266B82B494FD00234C7CE449FAA88E36CF8A82
- Source ZIP: C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\ORBIT-v0.4-release\ORBIT-v0.4-source.zip
- Existing v0.3 release and original orbit 3.zip were preserved.
- NSIS installs per user. Node 24/core resources are bundled. WebView2 bootstrap may need internet if its runtime is absent.

## PASS
- Windows release EXE and NSIS build (npm run build:desktop).
- Actual silent installation in validation/installed-orbit-v04 and launch through the installed Desktop shortcut.
- Native WebView2: eight-step AI Studio NOVA creation, selected provider/model, restart persistence.
- Native Windows Credential Manager: synthetic test credential persisted across restart, accepted by fixture server, absent from returned UI state, removed on disconnect.
- Native streaming chat, navigation without losing generation, regeneration without duplicate replies, cancellation.
- Local Only rejection of legacy remote connection testing.
- Profile export returned configuration without the synthetic credential.
- 200 tests: 189 PASS, 0 FAIL, 11 SKIP (including opt-in live integrations).
- TypeScript checks, ESLint, Prettier check and cargo fmt --check.
- Bundled core JSONL protocol runs with isolated working directory and without global Node/npm PATH.
- Browser UI with real agent engine and a fixture provider: onboarding, plan, permissions, diff, actual file edit, verification, restart/history, persistent Undo, settings, keyboard navigation, offline file access.
- Security regressions: remote acknowledgement, endpoint validation, Local Only including cloud-backed local model tests, imported permissions, profile isolation, unsupported Agent models, toolCallId consistency, SSE boundaries, cancellation/retries, standing grants cannot bypass profile Ask.
- Test installation uninstalled; previous settings restored; newly created test AI database moved to an ignored validation directory.

## NOT VERIFIED
- Authenticated live Anthropic completion, streaming and real-model agent change/verification/Undo. No real API key was available. ORBIT_LIVE_AI_TESTS opt-in tests are supplied.
- A real local model: no installed supported runtime/model was available for this acceptance run. The native HTTP fixture is not an LLM.
- Actual native save-dialog export and file-picker import end-to-end. Core import/export and reviewed permission reduction are tested.
- Clipboard integration, system tray interactions, native project folder picker, global shortcuts and notification display were not revalidated for 0.4.
- A clean Windows machine without existing WebView2, Authenticode signing and SmartScreen reputation.
- GPU/VRAM detection: displayed as unknown; CPU/RAM/free disk use actual OS data.

## Scope and limitations
This is a built and tested release candidate, not a claim that every live-AI acceptance criterion passed. Known skipped acceptance requires an accessible real model and credentials where applicable.

Local Only constrains ORBIT provider routing; a separate local runtime must genuinely perform local inference. ORBIT cannot independently verify whether a third-party runtime secretly forwards requests. Unknown model tool support prevents Agent Mode.

Profiles are configurations, not newly trained models. Training is explicitly Coming later. Pricing is unknown rather than fabricated. Profile/network/git-write features marked unavailable are not claimed as implemented standalone tools.

Evidence: validation/windows-v04-result.json, windows-v04-chat.png, windows-v04-studio.png; repeatable scripts/windows-v04-smoke.mjs and scripts/desktop-ui-smoke.mjs. Generated logs stay in validation and are not included in git.
