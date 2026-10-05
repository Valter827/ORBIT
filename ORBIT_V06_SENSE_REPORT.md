# ORBIT 0.6 SENSE REPORT

Date: 2026-09-28. Version: 0.6.0. Release type: **UNSIGNED TEST BUILD**.
Implementation and Windows installer build are complete; trusted installation and full live/native acceptance are **not complete**.

## Delivered behavior
Sense is OFF by default and enabled per AI. Users explicitly select a visible window, one application window, or a display, then read/refresh a snapshot. A persistent sharing indicator and Stop revoke the native lease. No automatic background capture or Pilot actions are enabled.
Windows UI Automation supplies bounded visible text/control roles first. Windows OCR is the fallback. Images remain in memory and require explicit opt-in, positive model vision metadata and privacy checks. Protected fields suppress OCR/image capture and ancestor text extraction. Known credential text is redacted; heuristics cannot identify every possible secret.
Remote consent binds provider/endpoint/model/scope. Local Only is checked before inference, including cloud-backed models advertised by local runtimes. Knowledge and scoped memory can inform replies; screen content and Sense answers are not automatically persisted.
Quick Ask opens Sense with a question. Optional offline speech inserts a transcript for review without submitting it.

## Validation
| Area | Status | Evidence / limits |
| --- | --- | --- |
| Dependency install | PASS | npm ci; no new dependency since installation |
| Core suite | PASS | 233 tests: 222 passed, 11 skipped, 0 failed |
| Latest privacy changes | PASS | All 8 focused Sense tests rerun after final redaction changes |
| TypeScript, ESLint, Prettier, Rust format | PASS | Typecheck and final lint/format checks |
| Frontend / Windows release build | PASS | Latest desktop build includes final helper/privacy changes |
| Packaged IPC | PASS | Bundled Node, isolated working directory, no global Node/npm PATH |
| Browser regression | PASS | Chat, Agent, history, Undo, settings, keyboard and offline files; fixture provider |
| UIA / OCR / protected fields | PASS | Real Windows fixture windows: accessibility, OCR-only and password modes |
| Per-AI opt-in / scope / indicator / disclosure / Stop | PASS on earlier 0.6 native build | validation/sense-native-ui-v06.json and screenshot; not final artifact acceptance |
| Final native executable launch | BLOCKED | Windows Application Control rejected final ORBIT.exe on 2026-09-28 |
| Extended native Quick overlay / cancellation / Local Only run | NOT VERIFIED | Final native launch blocked; test script is included, earlier evidence must not be treated as this run |
| Cancellation / remote consent / Local Only / no Pilot / no persistence | PASS in automated core tests | Includes native epoch cancellation and rejected stale requests |
| Knowledge / memory sources | PASS with fixture | Relevant Knowledge and existing scoped memory; no automatic observation storage |
| Vision payload / fallback | PASS with fixture/mock | Compatible image_url and Anthropic image blocks; metadata gate and structured fallback |
| Real Anthropic / genuine local AI / real image understanding | NOT VERIFIED | No live inference acceptance established |
| Voice | NOT VERIFIED / unavailable here | Zero offline recognizers installed; microphone was not opened |
| NSIS installer creation | PASS | Artifact below |
| Install / Desktop shortcut / tray / uninstall of final 0.6 | NOT VERIFIED | Installer was not installed during this final run |
| Trusted signature | UNAVAILABLE | User has no certificate/service; production preflight fails closed |
| Release signing safety tests | PASS | 3 release pipeline tests |
| Debug cargo check | BLOCKED | Windows Application Control blocked dependency build scripts; release build passed |

The browser regression initially checked Ctrl+N before React completed the update. The test now waits for the observable empty conversation, then asserts it; the rerun passed. No application shortcut behavior was changed for that test.
No Windows security settings or execution-policy protections were disabled.

## Artifacts
Installer:
`src-tauri/target/release/bundle/nsis/ORBIT_0.6.0_x64-setup.exe`
Absolute path:
`C:/Users/User/.codex/visualizations/2026/09/20/01a0bd72-b64e-7762-be87-c88c29292614/work/orbit/src-tauri/target/release/bundle/nsis/ORBIT_0.6.0_x64-setup.exe`
SHA256: `0480582F35914260CAC9E3E1B648D91C04237A4587975EDA365B75286E77DD34`
Size: 27,640,397 bytes.

Application SHA256: `62D2E77CED77B8FCE17E7E8595E74C6546CCC597B899943D4AF417EDE4166290`.
Build metadata: [release-v0.6.0.json](validation/release-v0.6.0.json).
Source ZIP is delivered separately as ORBIT-v0.6.0-source.zip and excludes dependencies, build outputs, local user data and signing material.

## Next acceptance gates
A trusted signing identity and a Windows environment permitting the signed application are required for trusted release acceptance. Run the included installed native smoke on that final artifact, then validate a configured real AI provider and image-capable model. Voice requires an installed offline recognizer and explicit microphone use.
See [Sense guide](docs/ORBIT_SENSE.md) and [Windows signing](docs/WINDOWS_SIGNING.md).
