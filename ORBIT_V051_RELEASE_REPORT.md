# ORBIT 0.5.1 RELEASE REPORT

Date: 2026-09-27
Release status: INCOMPLETE — a new installer was built, but Windows application-control policy blocked installation. No older installer was reused and no native acceptance pass is claimed for 0.5.1.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Windows build | PASS | npm run build:desktop; fresh optimized executable and NSIS bundle; ProductVersion 0.5.1 |
| Installer | FAIL | File generation PASS; installation attempt blocked before the installer process started |
| Native v0.5 UX | FAIL | Required installed-app acceptance could not run |
| My AIs | FAIL for native gate | Browser UI PASS; installed 0.5.1 NOT VERIFIED |
| Create AI | FAIL for native gate | All ten steps PASS in browser harness; installed 0.5.1 NOT VERIFIED |
| Knowledge | FAIL for native gate | Ingestion, real indexing and preview PASS in core/browser; installed 0.5.1 NOT VERIFIED |
| RAG | PASS for core/protocol | Unique fact violet-739 retrieved and source opened; unavailable embeddings keyword fallback covered in core suite; no real model claimed |
| Memory | PASS for core/browser | AI/project scope, cross-profile mutation denial and restart persistence tested; native 0.5.1 NOT VERIFIED |
| Profile Export | PASS for core | Portable package test, explicit knowledge, secret exclusion; fresh native Save dialog NOT VERIFIED |
| Profile Import | PASS for core | Restored configuration/knowledge, malicious fields rejected, safe reviewed grants; fresh native UI NOT VERIFIED |
| Security Regression | PASS | Full suite including PathGuard, terminal risk, Local Only, remote trust, malicious knowledge/packages, permissions and secret exclusion |
| Anthropic Live | NOT VERIFIED | No ANTHROPIC_API_KEY, no project .env, and no matching saved ORBIT/Anthropic Credential Manager entry found |
| Real Local LLM | NOT VERIFIED | No ollama/lms command or listening default endpoint found; real ai.detect returned [] |
| Agent Live E2E | NOT VERIFIED | No genuine configured model; fixtures do not count |
| Undo | PASS for core/browser | Real file fix, verification, host restart and Undo; native 0.5.1 NOT VERIFIED |
| Frontend Lint | PASS | Typed ESLint includes frontend/src .ts/.tsx; zero warnings |
| Windows CI | NOT VERIFIED | Workflow updated and YAML/PowerShell/JS syntax checked; no configured Git remote or executed GitHub run |
| ORBIT Vision Architecture | PASS | Interfaces and design only; no registered screen/action/voice methods |
| Typecheck | PASS | Core and React |
| Format check | PASS | Core and React .ts/.tsx |
| Frontend build | PASS | Vite production bundle |
| Bundled IPC | PASS | Actual bundled Node/core with isolated cwd and no global Node/npm |
| Browser UX | PASS | 104 captures at 1100×700, 1366×768, 1440×900, 1920×1080; real core with explicitly labelled AI fixtures |

## Tests
214 PASS
0 FAIL
11 SKIP
225 total

The skips are reported by the existing suite, not converted to passes. Browser fixture runs are separate from these core counts.

## Fresh installer
Path:
C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\orbit\src-tauri\target\release\bundle\nsis\ORBIT_0.5.1_x64-setup.exe

Size: 27,593,808 bytes
SHA256: D4C6EBF6851B22B7EFBF414BE26C7CCC61DA4754FB3DCAE112FD1AA328EE9434

This is the normal versioned Tauri output filename. It was not renamed or copied to try to bypass application control.

## Installation blocker
The attempted current-user installation via Start-Process was rejected with “Политика управления приложениями заблокировала этот файл.”

Windows Code Integrity events 3077 and 3033 at 2026-09-27 11:00:09 identify this exact 0.5.1 installer and policy {0283ac0f-fff1-49ae-ada1-8a933130cad6}. The file did not meet Enterprise signing requirements. The prior Rust compilation blocker did not recur, but that does not authorize execution of the installer.

No policy was disabled, no executable was relaunched under another name/path, and no older installer was used. Existing app data was backed up before the attempt; the blocked installer did not run.

Completion requires an administrator-approved distribution/execution path under the Windows policy (for example a properly trusted signed release). Only after approval can this exact new build be installed, opened through its Desktop shortcut and tested natively.

## Release hardening
- package.json, root lockfile metadata, Cargo.toml and the orbit Cargo.lock entry are 0.5.1; Tauri consumes package.json and About consumes the native package version.
- Windows CI artifact names derive from package.json. The installer smoke selects only the matching version instead of the first old bundle.
- CI now explicitly runs frontend build and the v0.5 installed smoke after native first-run/restart checks. The latter covers creator, knowledge, chat, memory, persistence and profile portability with synthetic credentials.
- Frontend joins typed lint and format gates. Eight unsafe/default object-stringification findings were fixed via explicit formatting instead of suppressing rules.
- README now distinguishes implemented, partial, experimental and future capabilities.
- docs/ORBIT_VISION.md covers opt-in capture, visible indicators, current-window scope, UI Automation first, complementary vision, structured safe app identity, broker validation/risk/permission, revocation and untrusted screen text.
- Vision contracts are not runtime providers. Regression tests assert that future operation names are rejected by the current host.

## Evidence
validation/tests-v051.log
validation/windows-build-v051.log
validation/live-availability-v051.json
validation/polish-result.json
validation/polish/
packages/core/test/release-v051.test.ts
.github/workflows/desktop-windows.yml
scripts/windows-install-smoke.ps1
scripts/windows-v05-smoke.mjs

Earlier 0.3–0.5 reports and installers are historical evidence only. They do not establish 0.5.1 native acceptance.
