# ORBIT v0.3 WINDOWS RELEASE

Date: 2026-09-21
Real Tauri 2 Windows x64 EXE and NSIS installer produced and tested. This is ORBIT 0.3.0, not the earlier Electron build.
Installation and programmatic activation of the installed Desktop shortcut passed on this Windows 11 PC. The complete manual native acceptance checklist is not yet verified.

## Artifacts

ORBIT EXECUTABLE:
C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\orbit\src-tauri\target\release\ORBIT.exe
Size: 11,001,856 bytes.

ORBIT INSTALLER (standalone delivery):
C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\ORBIT-v0.3-release\ORBIT Setup.exe
Size: 27,516,778 bytes (26.24 MiB).
SHA256: AE4EAF80C89A45EC4B0B431841352D5D697767391B418CAF0EE8D0D8D63BD39D

Original generated installer:
C:\Users\User\.codex\visualizations\2026\09\20\01a0bd72-b64e-7762-be87-c88c29292614\work\orbit\src-tauri\target\release\bundle\nsis\ORBIT_0.3.0_x64-setup.exe

Source ZIP: ORBIT-v0.3-source.zip, alongside the installer and this report.
Installer is unsigned. WebView2 was already installed on this PC; bootstrapper installation on a PC without WebView2 was not tested.

## Results

| Check | Result | Executed evidence / limits |
| --- | --- | --- |
| MSVC | PASS | VS Build Tools 2022 17.14.41, MSVC 14.44.35207; link.exe and cl.exe found in Developer PowerShell |
| Windows SDK | PASS | 10.0.26100.0; rc.exe and mt.exe found |
| Rust target | PASS | Rust/Cargo 1.98.1, x86_64-pc-windows-msvc |
| Tauri compilation | PASS | Actual optimized production build, all existing plugins compiled |
| ORBIT.exe | PASS | File exists; installed executable starts and serves real native IPC |
| NSIS installer | PASS | File exists; real silent installation returned 0 |
| Installation | PASS | Temporary install directory on current Windows 11 account; not a clean VM/disposable OS |
| Desktop shortcut | PASS | Actual ORBIT.lnk points to installed ORBIT.exe |
| Launch from Desktop | PASS | Started via installed .lnk, first run and restart. Programmatic shell activation; literal mouse double-click not performed |
| Start Menu | PASS | Actual ORBIT/ORBIT.lnk created |
| Installed Apps | PASS | HKCU uninstall registration contains ORBIT 0.3.0 and correct installation/uninstall paths; Settings UI not inspected |
| Bundled runtime | PASS | Child node.exe path is installed-orbit/node/node.exe, parent is ORBIT.exe. Successful native launch with PATH excluding global Node/npm |
| Production UI | PASS | Real WebView2 loads packaged assets at Tauri virtual origin http://tauri.localhost/, not a Vite/HTTP development server or external browser |
| Credential Manager | PASS | Save synthetic test key, exit, reopen via shortcut, native key read/hasKey true, delete, hasKey false. Key not returned to frontend or recorded in report |
| Quick Ask | PASS | Real second WebView window opens; quick_submit delivers draft into main UI |
| Single instance | PASS | Second installed EXE exits with 0; original native IPC stays available |
| Autostart | PASS | Real enable/read/disable/read through plugin. Disabled after test |
| Window state persistence | PASS | Saved main window width/height match reopened native WebView; manual movement/maximize/multi-monitor cases not tested |
| SQLite persistence | PASS | Actual core SQLite restart/history tests; installed native history endpoint also works after restart |
| Restart recovery | PASS (core tests) | SQLite marks interrupted tasks; native active-task crash recovery not performed |
| Undo after restart | PASS (fixture/core) | Actual file restoration after core restart and UI reload; native desktop live-agent Undo not verified |
| Fixture Agent E2E | PASS | Browser React harness + real core/tools/files/terminal/permissions/diff/tests/verification; explicitly FIXTURE E2E, not native live AI |
| Live Anthropic Agent E2E | NOT VERIFIED | No API key available; no provider calls made |
| Native real agent task | NOT VERIFIED | No live API key; fixture provider was not added to production |
| Projects persisted (native picker) | NOT VERIFIED | Native folder picker interaction unavailable |
| System Tray | NOT VERIFIED | Compiled and initialized without startup failure; actual tray menu actions not exercised |
| Folder Picker | NOT VERIFIED | Actual dialog interaction not exercised |
| Global Shortcut | NOT VERIFIED | Key press/registration behavior not exercised end to end |
| Notifications | NOT VERIFIED | Actual Windows notification display not exercised |
| Close-to-tray | NOT VERIFIED | OS close-button interaction not exercised |
| Uninstall | PASS | Actual registered uninstaller returned 0; program, Desktop/Start Menu shortcuts, registry entry removed; SQLite data retained. Windows Settings UI path not clicked |
| Windows 10 / fresh Windows VM | NOT VERIFIED | Tested only current Windows 11 installation |

## Native defects found and fixed

1. Tauri can supply Windows extended-length resource paths. Bundled Node 24 failed before host startup with EISDIR on such an entry-point path. Normalize existing resources/data through dunce before spawning; native installed launch now passes.
2. Saving settings called autostart.disable even when no startup registration existed. Change startup registration only when its state changes; saving and actual enable/disable now pass.
3. Quick Ask was created synchronously from a Windows event/command handler, deadlocking WebView2 at about:blank. Create it on a blocking worker as required by the installed Tauri API; native Quick Ask and draft handoff now pass.

No security guard, permission flow, Undo, verification, or provider implementation was disabled.

## Validation after native fixes

- npm test: **172 total; 162 passed; 0 failed; 10 skipped**.
- npm run typecheck: PASS.
- npm run lint: PASS.
- npm run format:check: PASS.
- npm run frontend:build: PASS (executed by final desktop build).
- npm run build:desktop: PASS.
- cargo fmt --manifest-path src-tauri/Cargo.toml --check: PASS.
- scripts/desktop-ui-smoke.mjs: PASS, fixture-only browser E2E.
- scripts/protocol-smoke.mjs: PASS, real bundled Node/core and restricted PATH.
- scripts/windows-native-smoke.mjs: PASS on final installed binary, real native IPC/key/restart.
- scripts/windows-native-extra.mjs: PASS on final installed binary, autostart/Quick Ask/single instance/window size.
- git diff --check: PASS.

Skipped tests: seven optional PostgreSQL tests, one opt-in live authentication test, two Windows symlink privilege checks.

Native test automation used the WebView2 CDP endpoint only via the test launch environment. No debugging flag or fixture provider is embedded in the application. The desktop-control helper failed to start (sandbox helper error); that prevented remaining manual native UI checks. Diagnostic harness failures were corrected and rerun; only successful final executions are marked PASS.

Evidence is in validation/: windows-build.txt, tests-v03.txt, windows-native-smoke.txt, windows-native-extra.txt, windows-native-acceptance.json, windows-processes.json, windows-uninstall.json, and screenshots. GitHub Actions workflow remains authored but not executed here.

The temporary application installation has been uninstalled. Newly created test AppData is retained, with no stored test API key and autostart disabled. Existing user project files and the original orbit 3.zip were not changed.

## Remaining acceptance

Exercise the actual folder picker, tray, global shortcut, notification display, close-to-tray, literal Desktop double-click, and the Windows Settings uninstall UI on a test machine. Run a live Anthropic demo task and native Undo when an API key is available. These omissions do not change the fact that the delivered NSIS installer and installed native application were actually built and launched.
