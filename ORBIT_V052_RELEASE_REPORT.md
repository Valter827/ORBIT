# ORBIT 0.5.2 SIGNED RELEASE REPORT

Date: 2026-09-27. Version: 0.5.2.

**Release gate: NOT COMPLETE. SIGNING NOT AVAILABLE.**
The current source produces a fresh unsigned test installer. The user confirmed that no trusted certificate or signing service is available. No self-signed certificate was created. No Windows security policy was changed. No unsigned 0.5.2 installation or native launch was attempted.

## Results

| Check | Result | Scope / evidence |
| --- | --- | --- |
| Windows Build | PASS | Current 0.5.2 source; fresh NSIS bundle |
| Installer creation | PASS | Unsigned test artifact only |
| Signing | NOT AVAILABLE | No certificate in CurrentUser/My or LocalMachine/My; no service |
| ORBIT.exe Signature | FAIL | Authenticode NotSigned |
| Installer Signature | FAIL | Authenticode NotSigned |
| Bundled Node signature | PASS | Valid, OpenJS Foundation; timestamp present |
| Windows App Control acceptance | NOT VERIFIED | No signed artifact exists to test |
| Installation | NOT VERIFIED | Signed installer prerequisite unavailable |
| Desktop Shortcut | NOT VERIFIED | No current installation |
| Native Launch | NOT VERIFIED | No current installation |
| Native v0.5 UX | NOT VERIFIED | Browser acceptance does not substitute |
| Create My AI | NOT VERIFIED | Native gate |
| Knowledge ingestion/search/preview | NOT VERIFIED | Native real-file gate |
| RAG | NOT VERIFIED | Native/live gate |
| Memory and isolation after restart | NOT VERIFIED | Native gate; core persistence/isolation tests pass |
| Profile Export | NOT VERIFIED | Native gate |
| Profile Import | NOT VERIFIED | Native gate |
| Credential Manager | NOT VERIFIED | Synthetic native save/restart/delete not run |
| Agent | NOT VERIFIED | Native gate; browser fixture regression passes |
| Undo | NOT VERIFIED | Native gate; browser fixture regression passes |
| Live Anthropic | NOT VERIFIED | No environment key; earlier same-day saved-key check found none; no real inference |
| Real Local LLM | NOT VERIFIED | No supported runtime command/listener detected |
| Uninstall and registration cleanup | NOT VERIFIED | No current installation |
| Security Regression | PASS | Existing core suite + 3 fail-closed release tests; not a signature/native acceptance claim |
| CI execution | NOT VERIFIED | Workflow authored and YAML parsed; no remote run |

## Executed checks

- npm ci: PASS. Audit reported 0 vulnerabilities. npm noted pending lifecycle-script approvals for Prisma/esbuild; no blanket approval was applied. Build commands nevertheless succeeded.
- npm test: 225 total, **214 PASS, 0 FAIL, 11 SKIP**.
- npm run test:release: **3 PASS, 0 FAIL, 0 SKIP**. Missing/malformed signing identities and unknown build flags fail before preparation, without an unsigned fallback.
- npm run typecheck, npm run lint, npm run format:check: PASS.
- npm run frontend:build and npm run build:desktop: PASS.
- cargo fmt --manifest-path src-tauri/Cargo.toml --check: PASS.
- Packaged-core JSONL IPC with bundled Node and no global Node/npm PATH: PASS.
- Browser harness: PASS for fixture Agent flow, restart/history, Undo, settings, keyboard and offline files. It explicitly excludes native shell, Credential Manager, folder dialog, tray and installer.
- PowerShell script syntax and workflow YAML: PASS.
- npm run build:production: expected refusal, SIGNING NOT AVAILABLE. This is not a successful production build.

Logs are in validation/*-v052.log. Public metadata: validation/signatures-v052.json and validation/trust-v052.json. Machine-generated build manifest: validation/release-v0.5.2.json.

## Exact unsigned test artifact

Filename: ORBIT_0.5.2_x64-setup.exe

Path: C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\orbit\src-tauri\target\release\bundle\nsis\ORBIT_0.5.2_x64-setup.exe

Size: **27,597,886 bytes**

SHA256: **FD3358284AF6CA13D6A835FCFFE18F7BCE2AAFAD9997D28B9550EDD000626AFA**

Signature status: **NotSigned**. Signer: **NOT AVAILABLE**. Timestamp: **NOT AVAILABLE**.

This hash belongs only to the unsigned test installer. No final signed-installer hash exists.

ORBIT.exe: 11,290,624 bytes; SHA256 8F5D53CD6BA2DE143C063048E49A3B8F3511576BB9B2891FDF288170A77914F2; NotSigned.

Bundled node.exe: 92,534,088 bytes; SHA256 9A4EB5F1C29C6A2E93852EAD46B999E284A6A5CA8BAB4D4E241D587D025A52DE; Valid; publisher OpenJS Foundation; timestamp authority Microsoft Public RSA Time Stamping Authority.

## Trust findings and limits

Registry VerifiedAndReputablePolicyState remains 1. Code Integrity event 3099 identified active VerifiedAndReputableDesktop policy {0283ac0f-fff1-49ae-ada1-8a933130cad6}. Events 3077/3033 blocked the previous unsigned 0.5.1 installer at 11:00:09 on this date. CiTool full policy enumeration returned access denied. These observations identify active Smart App Control and the prior block; they do not establish the full set of organization-specific signer allowances or prove that any particular certificate will be accepted.

The new artifact has not been executed; absence of a new block event would not demonstrate acceptance. No policy, SmartScreen or certificate trust store was weakened.

## Changes

- Synchronized npm, lockfile, Cargo and native smoke version to 0.5.2; Tauri/About derive the package version.
- Added Certificate Store signing hook with chain/EKU/date/private-key checks, SHA256, RFC3161 timestamp, Authenticode verification and post-signing hashes. Signing with an actual trusted private key remains untested.
- Tauri custom signing configuration targets app/bundler signing operations, including NSIS uninstaller and final installer. Bundled executable signatures are validated before packaging; valid third-party signatures are preserved.
- Separate development, unsigned-test and production commands. Production never silently falls back.
- CI has a hosted signing-prerequisite gate and a protected dedicated signing-runner route. Maintainers must provision the runner, certificate and environment controls. No signing infrastructure was provisioned here.
- Native smoke now verifies production signatures before installation and on installed app/uninstaller; checks Start Menu and uninstall registration cleanup. The existing suite still needs complete native real-file-dialog and Agent/permission/diff coverage before it can establish the requested full native acceptance.
- Documentation names future screen understanding ORBIT Sense and approved computer actions ORBIT Pilot. Existing interfaces remain disabled architecture only.

## Remaining release prerequisites

1. Obtain a trusted Code Signing identity or provision a compatible signing service/key provider. Configure the chosen identity in Windows Certificate Store as described in docs/WINDOWS_SIGNING.md. The included integration is SignTool/Certificate Store, not a generic remote signing API.
2. Build production, verify app/resources/uninstaller/installer signatures and timestamps, and calculate the final signed installer hash.
3. Install that exact artifact under unchanged policy, launch its real Desktop shortcut, run all native acceptance scenarios (including real knowledge file, memory isolation/restart, profile package, synthetic credential lifecycle and Agent/Undo), inspect Code Integrity logs, and verify uninstall.
4. Record live AI only when a genuine provider/runtime is available. Missing paid credentials alone do not block a signed release.

Signing improves trust but does not guarantee reputation or acceptance under every policy. See [Microsoft Smart App Control signing guidance](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control) and [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/).
