# ORBIT 0.9.1 Windows release

## End users

Download the artifact group `ORBIT-0.9.1-windows-x64` from a successful run of the Windows workflow. Check its commit and SHA-256 against `release-status.json` and `SHA256SUMS.txt`. Do not substitute an older ORBIT executable.

Run `ORBIT_0.9.1_x64-setup.exe`, install for the current user, then open ORBIT through its Desktop or Start Menu shortcut. For portable use, extract `ORBIT_0.9.1_portable_x64.zip` completely and open `ORBIT/ORBIT.exe`. The loose EXE alone does not include the sidecar resources: use the installer or portable ZIP.

WebView2 Evergreen Runtime is required. The installer can download its official bootstrapper; a portable installation needs WebView2 already installed. Install Ollama separately from https://ollama.com/download/windows and obtain `gemma3:4b` for chat and, optionally, `embeddinggemma:300m` for semantic Knowledge retrieval. Models are not included. In ORBIT choose the local Ollama brain, open COSMO and enter a question. Ordinary use requires no terminal, npm, Rust or development server.

Without Ollama or a model, configure/install the missing component. Missing embedding support should leave lexical Knowledge search available. An unavailable runtime is not evidence of successful chat. These degraded states still require native acceptance on the exact release.

The build is UNSIGNED unless metadata explicitly says SIGNED. A SmartScreen reputation warning and an Application Control block are different conditions. Do not disable security or bypass Application Control. If installation or launch is blocked, stop and record BLOCKED. No trusted signing certificate is configured for this release.

State lives under the Tauri application data directory for `app.orbit.personal-agent` in Windows AppData, independently of the installation or portable folder. Credentials use Windows Credential Manager. Never put user databases, keys or Ollama model files into a release archive.

## Reproducible build inputs

Node 24.18.0 (`.node-version`), npm 11.16.0 (`packageManager`), Rust/Cargo 1.98.1 (`rust-toolchain.toml`), npm/Cargo lockfiles, Tauri CLI from `package-lock.json`. The unsigned CI job uses Windows Server 2022. Its concrete runner image revision and tool versions are recorded in release metadata. WebView2 is Evergreen: its runtime version must be recorded during native acceptance, not invented at build time.

Run `npm ci`, `npm run check:release`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, then `npm run build:desktop`. This is a production Tauri frontend and bundled Node/core/parser build, despite the unsigned-test signing label. `npm run build:production` requires a trusted certificate and never silently falls back to unsigned.

The build records stale-output quarantine in `validation/build-cleanup.json`. Fresh app/installer hashes are checked before packaging. Portable resources match the Tauri resource mappings. Existing release directories are quarantined, never merged. A failure creates `validation/build-failure-v0.9.1.json`; it is not a successful release receipt.

On this PC, the earlier 0.9.0 attempt was blocked when Windows refused to load a Rust build dependency (LoadLibraryExW, error 4551). Re-run normally for 0.9.1 and retain its own log. Do not change policy, rename blocked binaries or reuse an older EXE.

## GitHub CI

`.github/workflows/desktop-windows.yml` runs on main, delivery branches, pull requests, or workflow dispatch. It installs pinned tools, runs checks, builds NSIS, and collects EXE, installer, portable, metadata and checksums. npm downloads may be cached; compiled Rust targets are not restored. Source HEAD must exactly match `GITHUB_SHA` and be clean. Upload group: `ORBIT-0.9.1-windows-x64`; validation logs are a separate artifact.

The disposable runner installs the exact installer, compares the installed EXE and every bundled resource to the build receipt, checks available shortcuts, verifies portable contents and uninstalls. This packaging smoke does not claim native chat, actual file pickers, real AI, Sense, portable launch/move, or persistence. Old fixture-based smoke scripts remain historical regression utilities and are not a substitute for real acceptance.

After CI succeeds, download that exact artifact, verify hashes, and perform the native acceptance checklist from the 0.9.1 request. Record the run URL, commit, WebView2 version, exact EXE path and hashes. Do not locally rebuild after downloading and call it the tested CI artifact.

## Native release gate

Required controlled checks: COSMO autofocus/Enter, real Ollama streaming/Stop, restart/history/brain/settings, Memory proposal/confirm/recall/Forget, Knowledge file and folder dialogs/citation/preview/Space isolation/incremental/delete/embedding, Web verification and modes, Sense selected public window/Stop/vision when available, Credential Manager synthetic credential write/read/delete without its value in logs, existing shortcuts/tray/autostart/notifications, Local Only destinations, installer shortcuts/uninstall/reinstall and portable move. Leave autostart disabled after testing. Record each unsupported or blocked operation separately. No browser check can mark a native check PASS.

Release delivery is incomplete until a fresh EXE exists and the real native launch and required workflows have been verified. A CI definition alone is NOT RUN, not PASS.
