# ORBIT 0.9.3 Internet & Browser

COSMO 1.0. Public search, a bounded static Browser reader, Steam/Places/YouTube providers and explicit page context. No Voice or Pilot.

[Internet & Browser guide](docs/INTERNET_BROWSER.md). Build, real-provider, browser and native acceptance are separate evidence scopes.

---

# ORBIT 0.9.2 Native Acceptance

COSMO 1.0. Continued from the delivered 0.9.1 source (f3fcf2ffa015d3bbcb9856a7230f1d4a6ad75204). No feature additions. Native release-candidate acceptance is pending; older release sections below are historical.

[Native acceptance gate](docs/NATIVE_ACCEPTANCE_092.md).

[Windows release and installation guide](docs/WINDOWS_RELEASE.md). Build artifacts and native acceptance are separate gates: consult the release-status.json for the exact build, and the final acceptance report. Preparing CI is not a successful Windows release.

---

# ORBIT 0.9 Knowledge 2.0

Knowledge Spaces, explicit AI access, structured document ingestion, hybrid local retrieval, source locations and incremental indexing. COSMO remains 1.0.

[Knowledge guide](docs/KNOWLEDGE_2.md) · [0.9 report](ORBIT_V090_KNOWLEDGE_REPORT.md)

**Windows delivery is BLOCKED:** Application Control error 4551 prevents the final 0.9 Rust build. No 0.9 EXE, installer or portable ZIP has been produced. Older release notices below describe earlier versions.

---

# ORBIT 0.8 Personal Memory 2.0

Typed, scoped memory with proposals, conflict review, supersession, bounded recall and a memory timeline. COSMO remains 1.0.

[Memory guide](docs/PERSONAL_MEMORY.md) · [0.8 acceptance report](ORBIT_V080_PERSONAL_MEMORY_REPORT.md)

The 0.8 Windows build produces an unsigned test installer. Installation/native-shell acceptance and real semantic embedding retrieval remain unverified. Older build-blocked notices below describe earlier releases.

---

# ORBIT 0.7 Intelligence

Fast / Balanced / Deep, Auto brain, selective context and evidence-based answer checks. COSMO remains 1.0. See [the 0.7 report](ORBIT_V070_INTELLIGENCE_REPORT.md) for real local acceptance and Windows build status.

> **Final chat polish:** исправлены Settings selection, единый заголовок, Markdown и ORBIT Rename/Delete dialogs. [Отчёт](ORBIT_FINAL_CHAT_UI_POLISH_REPORT.md). Native Windows build всё ещё BLOCKED.

> **Chat-first UI · 2026-09-29:** новый интерфейс и 11 разделов Settings проверены с настоящим Ollama. Новый Windows EXE/installer блокируется Application Control. [Отчёт и ограничения](ORBIT_CHAT_FIRST_UI_REPORT.md).

> Real local acceptance 2026-09-29: COSMO + gemma3:4b passed Chat, streaming, Stop, persistence, Knowledge, Sense and image-only vision. [Report](ORBIT_V061_REAL_LOCAL_AI_ACCEPTANCE.md). Windows packaging remains blocked; no 0.6.1 installer.

# COSMO 1.0 · ORBIT 0.6.1

COSMO is the built-in starter assistant. Set Up Local AI guides runtime discovery, model selection/download and a real inference test without an API key. Custom AIs and Sense remain available.

[Local setup guide](docs/COSMO_LOCAL_AI.md) · [0.6.1 acceptance report](ORBIT_V061_COSMO_REPORT.md). Genuine local inference must be verified separately; no fixture result is a live AI result.

# ORBIT 0.6.1 — Build Your Own AI
Your AI. Your Rules.

ORBIT is a Windows Tauri desktop application with a bundled TypeScript agent and Node runtime. The current source is **0.6.1**. Windows Application Control blocked its Rust build script, so no 0.6.1 installer has been produced on this PC. See [the COSMO release report](ORBIT_V061_COSMO_REPORT.md) for exact results; the [0.6.0 Sense report](ORBIT_V06_SENSE_REPORT.md) is historical. A successful build alone does not mean installation or live-model acceptance passed.

## Product status
| Status | Features |
| --- | --- |
| Implemented | My AIs; ten-step Create AI wizard; identity, personality, instructions and tool preferences; Cloud / Local provider selection; model discovery; streaming chat and cancellation |
| Implemented | UTF-8 text/code/manual knowledge; incremental indexing; keyword RAG with source attribution; editable private/project memory; profile isolation and SQLite persistence |
| Implemented | Reusable instruction skills; profile history; .orbit-ai export/import with reviewed safe permissions; optional portable knowledge; provider switching without discarding the AI |
| Implemented | Agent plan, tool permissions, file diff approval, terminal risk checks, PathGuard, verification, audit and Undo; Windows Credential Manager; native desktop shell |
| Partial | Local embeddings require a separately running compatible model; unavailable embeddings use labelled keyword fallback. Tool calling must be discovered/supported by the selected model. Workflows are reusable procedures, not a background scheduler |
| Experimental / release validation required | Compatibility with individual third-party model servers; unsigned distribution; native/live acceptance not covered by fixture tests |
| Coming later | Model Studio, training/LoRA, PDF/DOCX ingestion, ORBIT Pilot computer actions, always-on voice and application launcher, GitHub integration |

Creating an AI customizes an existing model. It does not train a new foundation model. Screenshots and fake model responses are never presented as live AI results.

## Using ORBIT
1. Install the fresh Windows NSIS release and open the Desktop shortcut.
2. Meet COSMO 1.0 and choose **Set Up Local AI**, **Connect Cloud AI**, or **Create My AI**. The creator includes identity, purpose, personality, brain, knowledge, memory, skills/tools, permissions, test and create.
3. Connect Anthropic or a compatible/local provider in the Brain step or Settings. Keys use Windows Credential Manager. Model discovery and connection tests use the selected provider; cloud tests may incur API usage.
4. Add text files/folders or manual knowledge. Relevant passages are retrieved per question; response context shows sources actually used.
5. Save memory deliberately, inspect it, edit it or forget it. Other AIs cannot read private memory. Sharing requires explicit opt-in.
6. Use Chat for answers. Choose a project and Agent Mode for actions. Review plans, permissions and diffs; verification and Undo use real project files.
7. Export a .orbit-ai package to move configuration and optional knowledge. Imported permissions are reset for review and credentials are excluded.

Local models require an independently installed compatible runtime. ORBIT does not silently download a model. Local Only restricts inference endpoints; a local server's own cloud forwarding remains outside ORBIT's control. Project scripts run with your account permissions; there is no full OS sandbox for approved shell commands.

## Windows development and builds
Requirements: Node.js 24, stable Rust MSVC, Visual Studio Build Tools with Desktop C++/Windows SDK, and WebView2. The installer can bootstrap WebView2. End users do not install Node, Rust, npm or PostgreSQL.

```powershell
npm ci --ignore-scripts
npm test
npm run typecheck
npm run lint
npm run format:check
npm run frontend:build
npm run build:desktop
```

Tauri reads its version from package.json. The preparation script synchronizes Cargo metadata; About uses the native package version. Installer output: src-tauri/target/release/bundle/nsis/ORBIT_0.6.0_x64-setup.exe.

`npm run dev:desktop` starts the native development app with Vite. Production embeds React assets and launches the bundled Node/core over private JSON-lines stdin/stdout IPC; it does not run a localhost UI server.

## Validation commands
| Command | Scope |
| --- | --- |
| npm test | Core, desktop service and security regression tests |
| npm run typecheck | Core and React TypeScript |
| npm run lint | Typed ESLint on core and React .ts/.tsx, zero warnings |
| npm run format:check | Core and React .ts/.tsx formatting |
| npm run frontend:build | Frontend typecheck and Vite production build |
| npm run build:desktop | New Windows executable and NSIS installer |
| npm run test:desktop-ui | Browser integration with real core and explicitly labelled AI fixtures |
| node scripts/protocol-smoke.mjs | Prepared bundled runtime/core IPC without global Node/npm |
| scripts/windows-install-smoke.ps1 | Disposable CI runner only: fresh install, Desktop launch, native restart and v0.5 acceptance, uninstall |

For browser tests install Playwright Chromium, or pass `--browser "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"` to scripts/desktop-ui-smoke.mjs. Add `--visual` for all four desktop sizes.

Windows CI runs installation, typecheck, core/frontend lint and format, tests, frontend build, browser/IPC checks, native build and installed smoke tests. Artifact names derive from package.json; installer upload follows successful native acceptance. Writing the workflow does not mean it ran successfully; see the release report.

## Security and storage
Tauri owns native windows, tray, shortcuts and Credential Manager. The frontend has no filesystem/shell plugin capability; native IPC is allowlisted. The hardened TypeScript engine remains security authority, never the model, profile or retrieved knowledge.

Application data lives under the Tauri app-data directory for app.orbit.personal-agent: database, settings, logs, undo and cache. SQLite migrates automatically and refuses unsupported newer schemas. Interrupted tasks remain visible after restart. Session grants reset; uninstall preserves user data. Credentials are neither exported nor exposed to the frontend.

See [SECURITY.md](SECURITY.md) and [future ORBIT Vision architecture](docs/ORBIT_VISION.md). Sense now adds opt-in, one-time window understanding; see [Sense privacy and usage](docs/ORBIT_SENSE.md). Future action contracts remain disabled.

Historical ORBIT_DESKTOP_REPORT.md, ORBIT_V05_REPORT.md and ORBIT_UX_POLISH_REPORT.md describe earlier validation and must not be treated as current native release evidence.

## Windows signing
Default desktop builds are unsigned test artifacts. Production: npm run build:production. See [signing requirements](docs/WINDOWS_SIGNING.md). A trusted certificate is currently unavailable; native signed acceptance is not verified.

## Optional Sense capability
Enable Sense for an AI, choose a visible window or display, then read a one-time snapshot. Accessibility-first text and optional Windows OCR/image context support descriptive questions. Cloud disclosure, Local Only, a visible indicator and Stop are enforced. Quick Ask includes Sense; click-to-speak is optional. No Pilot actions are enabled. See [the Sense guide](docs/ORBIT_SENSE.md).
