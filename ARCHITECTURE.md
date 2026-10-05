# Desktop architecture — v0.3

React/Vite assets → Tauri allowlisted commands → hidden bundled Node JSONL host → shared OrbitService → existing AgentDriver / Engine / security / tools. No production HTTP transport. Rust owns Windows integration and Credential Manager. SQLite DesktopStore owns local task history and schema migration; file audit and durable Undo remain intact. PostgreSQL adapters below remain optional server infrastructure.

# ORBIT architecture

The existing TypeScript core remains the foundation. A small Node HTTP adapter connects the existing HTML/CSS surface to that core; no Tauri/React rewrite was introduced.

```text
Browser (127.0.0.1)
  -> local HTTP / SSE (host check, request token, Origin check)
  -> RealAgentDriver / runAgent
  -> configured AIProvider with native tool calls
  -> schema + filesystem/security validation
  -> risk classification -> scoped approval -> tool execution
  -> durable audit / transaction backups
  -> independent verification -> final result
```

The server controls the workspace and verification command; model input cannot set them. The model generates the plan and proposed edits. Plan, diff and permission requests have unique pending IDs; duplicate/stale answers are rejected.

Engine cancellation is passed to provider, dispatcher and tools. Abort races release hanging waits and a real timer enforces the time budget. Cancellation stops new operations; it cannot reverse an OS operation already in flight. Terminal termination targets the process tree on Windows and the process group on POSIX.

The file guard first rejects lexical escapes, then uses realpath for roots and existing ancestors. Operations use canonical paths and revalidate before mutations. This mitigates static symlink/junction escapes but is not a race-free OS filesystem sandbox against a malicious concurrent local process.

File replacements use an exclusive temporary file, flush, close and rename. Undo snapshots are flushed before mutation and persist both source and existing destination, including hashes/mode. Default moves refuse an existing destination. Undo can restore after restart using the task ID and state directory.

Provider messages preserve tool call IDs and content types. Anthropic tool results use native tool_result blocks, following the [official tool lifecycle](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls). File content and tool outputs are redacted before sending; pattern-based redaction is best effort.

The existing pg repositories remain available independently. This slice uses filesystem audit/undo so it does not require a database service. The SQL and Prisma schemas are historical separate definitions, not a claim of verified migration equivalence.

## Boundaries of validation
Deterministic E2E tests use an injected fixture provider and actual HTTP requests, filesystem operations, child processes, npm tests and audit/undo storage. They do not prove authenticated AI performance. Local Windows results and skipped checks are recorded separately from CI configuration.
