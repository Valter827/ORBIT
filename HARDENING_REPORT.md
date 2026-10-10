# ORBIT HARDENING REPORT

Date: 2026-09-20. Source: supplied orbit 3.zip. Original archive unchanged.
This stage is implemented and locally validated, but the live authenticated AI acceptance gate is still NOT VERIFIED.

## Fixed
- Canonical filesystem validation, including existing ancestors, directory symlinks and Windows junctions.
- Conservative token/segment/operator/argument command analysis with side-effect categories.
- Allow Once authorizes only one pending execution; concurrent requests cannot share that answer.
- Abort propagation, cancellation checkpoints and real timeout races for hanging AI/tools.
- Persistent pre-mutation Undo transactions, both sides of move/overwrite, default overwrite rejection.
- Atomic text replacement, bounded linear diff, UTF-8/binary detection and enforced size/search limits.
- Concrete AgentDriver, native Anthropic tool IDs/results and configured-provider routing.
- Local HTTP/SSE UI: request, real plan/approval, permission, diff Apply/Reject, Stop, verification, final result and Undo.
- Independent verification and baseline test/package integrity checks.
- Stale diff rejection after permission waits, preserving concurrent manual edits.
- Real audit storage, npm lockfile, Ubuntu/Windows CI and synchronized security documentation.

## Security
| Area | Result | Evidence / scope |
|---|---|---|
| Path Guard | PASS | Outside junction read/write/delete/move denied; internal junction allowed; Windows case/slash and device/ADS checks |
| Command Risk | PASS | 40-case matrix, redirects, chains, shells, destructive Git, side-effect categories |
| Permissions | PASS | Once, concurrency, task scopes, denial, stale answer after Stop |
| Cancellation | PASS | Before/after AI, hanging AI/tool, pending permission, deadline at/during verification, UI Stop |
| Undo | PASS | Create/update/delete/rename/move/overwrite, restart and both original states |

PASS refers to tested application behavior, not full OS isolation. Two file-symlink tests skip because Windows denies symlink creation without additional privileges; directory junction cases run successfully. UNC shares and concurrent hostile reparse-point swaps are NOT VERIFIED.

## Agent
| Area | Result |
|---|---|
| AgentDriver | PASS |
| Tool Calling | PASS — IDs preserved; native Anthropic request/response mapping tested |
| Verification | PASS — real subprocess test runs; failed/tampered tests cannot complete |
| Cancellation | PASS |

## End-to-End
AI → Agent → Tool → Diff → Permission → Change → Test → Verify:
- PASS with an explicitly injected fixture provider and actual HTTP, disk operations, npm tests and audit storage.
- PASS in installed Chrome through actual UI buttons: plan approval, five permission answers, diff Apply, completion, Undo and Stop before execution.
- File changed from subtraction to addition, tests failed before and passed after, independent verification passed, then Undo restored subtraction.
- Failure, Reject, cancellation and stale diff acceptance cases pass.
- **NOT VERIFIED with live authenticated Anthropic.** ANTHROPIC_API_KEY was not configured. No fixture provider is substituted in production.

## Tests
Previous tests: **66/66 executed PASS**, 8 skipped, 74 total retained.
New regression/acceptance tests: **83/83 executed PASS**, 2 skipped, 85 total.
Total: **149 passed, 0 failed, 10 skipped; 159 tests**.

Skips:
- 7 Postgres integration cases: DATABASE_URL/service not configured.
- 1 opt-in live authentication case: ORBIT_LIVE_TESTS not enabled.
- 2 Windows file-symlink cases: OS privilege unavailable; junction equivalents pass.

Existing tests were adjusted for corrected Allow Once semantics, portable child-process commands and the MVP's explicit CRITICAL-command block. Tests were not marked successful merely because they were skipped.

## Build
| Check | Result |
|---|---|
| Install: npm install --ignore-scripts | PASS |
| Frozen install: npm ci --ignore-scripts | PASS |
| Typecheck | PASS |
| Lint | PASS — no errors or warnings |
| Format check | PASS |
| Build | PASS |
| Windows | PASS — local Node 24.18.0, actual cmd.exe/process tests |
| Chrome UI | PASS — no page JavaScript errors |
| Ubuntu | NOT VERIFIED locally; CI matrix supplied, remote run not performed |
| Desktop / Tauri | NOT VERIFIED — no Tauri application in this scope |
| PostgreSQL | NOT VERIFIED |
| Live AI workflow | NOT VERIFIED — missing configured key |

Command logs are in validation/. Browser acceptance script: scripts/ui-smoke.mjs.

## Remaining Limitations
- A configured Anthropic key and a live model run are required to finish the final acceptance gate. Run npm start after configuring the key in .env, approve the demo workflow, then Undo.
- Full OS sandboxing is absent. Approved terminal commands retain the OS user's privileges; cwd confinement is not filesystem confinement.
- Canonical filesystem checks are not race-free against a hostile concurrent local process. Do not run multiple writers against the same workspace.
- Undo persists snapshots but is not a multi-file atomic transaction and may overwrite later manual edits.
- Secret redaction is pattern-based; state backups retain original source contents and need private OS permissions.
- The independent test command and integrity checks do not mathematically prove arbitrary generated code correct.
- UI is a local core preview, not a packaged desktop product. Tauri, keychain, advanced integrations and remote CI execution remain outside verified delivery.

## Delivery
The source package includes the npm lockfile, CI, tests, documentation, validation logs and UI screenshots.
The working copy has a local Git commit. The ZIP is generated from that commit. No remote publishing is performed.
