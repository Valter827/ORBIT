# Security model

**AI OUTPUT IS UNTRUSTED INPUT.** Project files, command output and model responses may contain prompt injection. Neither a model's claim nor a prompt instruction is an authorization.

## Trust boundaries
The local operator configures the workspace, private state directory, model key and verification command. The browser submits requests and explicit decisions. All model tool calls pass schema validation, security validation, risk analysis, permission and execution through the dispatcher. The core must only be exposed through this boundary.

The optional development HTTP server binds to loopback. Mutations require a per-process unpredictable request token and validate browser Origin and Host. No CORS access is provided. This does not protect against other code already running as the same OS user.

## Filesystem access
Canonical roots and targets are resolved with realpath, including existing parents for new files. Outside symlink/junction targets are rejected. Windows device/stream aliases are rejected; ordinary case/slash aliases are supported. Network UNC shares and unusual reparse-point implementations were not exercised locally.

Credential filenames and internal tooling writes are restricted. Reads, writes, diffs and searches enforce byte/count limits. Binary/non-UTF-8 files are rejected or skipped. These text tools are not general binary file managers.

There is still a TOCTOU window between filesystem checks and OS operations. A hostile local process that swaps directory links concurrently is outside this MVP's isolation guarantee. Do not run multiple writers against the same workspace. Node realpath plus revalidation is not equivalent to handle-relative native filesystem confinement.

## Terminal
Terminal process isolation != full OS sandbox. Commands run with the server user's OS permissions. The guard constrains cwd, not every path a command can access. Approved scripts can read files, use the network or launch descendants.
The lexer is conservative, not a complete parser of cmd, PowerShell or POSIX shells. Dynamic substitutions/wrappers and unknown behavior are HIGH. Redirects are WRITE, destructive actions are elevated, CRITICAL commands are blocked by the terminal tool. Builds/tests are classified as EXECUTION, not read-only.
Default UI policy asks for terminal operations. Grant only commands in trusted projects. Environment inheritance is allowlisted; this reduces credential exposure but is not a sandbox.

## Permissions and cancellation
Allow Once authorizes only the pending execution and creates no reusable grant. Task grants match task, target/input and risk. HIGH Always is downgraded to task scope; CRITICAL cannot reuse a standing grant. Denied domains remain blocked.
Abort signals propagate through AI, approvals, dispatcher and tools; deadlines race pending operations. No new tool starts after observed cancellation. Already-running OS operations may complete before cancellation is observed. Process-tree termination is best effort and does not guarantee containment of detached hostile descendants.

## Undo and audit
Backups and transaction manifests are persisted before mutations; moves preserve both sides. Normal overwrites use atomic replacement. Audit is append-only at the application layer, not tamper-proof against the OS user.
Backups contain source content; protect the state directory with OS permissions. Do not expose it via the workspace. Undo applies stored snapshots; it may overwrite subsequent manual edits. Review the task and stop other writers first. A multi-file Undo is not a filesystem-wide atomic transaction.

## Secrets and model data
Provider keys come from the server environment, never the page or database. The local .env is a development convenience, not an OS keychain.
Context and tool output are pattern-redacted before model submission and audit. Unknown secret formats can escape redaction; do not include sensitive data unnecessarily. Undo backups intentionally retain original content and are not redacted.

## Verification
Completion requires an independent operator-configured command to pass. The local server also checks baseline test/package hashes. This resists simple test editing, but cannot prove an arbitrary program correct or prevent malicious code from faking test output. Verification commands themselves execute project code.

## Reporting
Report security problems privately to the project maintainer with a minimal reproduction. This repository does not yet specify a public security contact or claim an external security audit.

## Desktop 0.3 boundary
Production Tauri embeds React assets and launches a bundled Node core over inherited stdin/stdout, with no HTTP listener. Frontend capabilities permit event subscription only; native application commands enforce main/Quick Ask window identity and a fixed operation allowlist. Projects are selected natively, canonicalized, revalidated, and cannot overlap private AppData. Windows Credential Manager stores the key; plaintext exists only transiently in the key-entry form and in native/core process memory. It is never persisted to settings, history or logs. SQLite stores redacted task events and marks interrupted runs on restart. Native OS behavior and installer acceptance remain NOT VERIFIED until the Windows MSVC build can run.

Exit waits for real driver/tool I/O and Undo to settle before closing SQLite. Pause holds at action boundaries and does not remove deadlines or interrupt an in-flight atomic write. System-level process containment is still not provided.
