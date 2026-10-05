# Personal Memory 2.0 — ORBIT 0.8.0

COSMO remains version 1.0. Memory helps personalize answers; it is not evidence for public facts or permission to execute actions.

## Saving and reviewing
Say “Remember: I prefer TypeScript for web projects” or “Запомни: …”. Review the proposed note below the conversation and choose Remember, Edit, or Not now. A proposal is not permanent memory until accepted. Explicit requests use deterministic detection; ambiguous suggestions may use a bounded local-model classification. Invalid model output saves nothing.

Settings → Knowledge & Memory controls suggestions and automatic categories. Automatic saving is OFF by default. Preferences, decisions, goals and tasks can be enabled individually. Automatic categories still work with suggestions disabled; conflicting values require review. Screen text, web pages and assistant replies are not automatically saved.

## Scope and conflicts
Private AI memory is enabled for new profiles. Conversation memory stays with its conversation. Project memory requires an active project and the profile setting. Shared memory is opt-in; review its audience before saving. Existing profile settings are preserved during migration.

Current user input takes precedence. A replacement supersedes the previous record instead of silently erasing its history. To retain two different contexts, edit their content or scope; contradictory values for the same context must not both become current.

## Management
The Memory page provides a timeline, search, type/status filters, review flags and provenance. Pinning raises priority only for relevant records. Why remembered shows the source, dates and usage. Tasks can be Open, Done or Cancelled. Completed tasks and expired or superseded records are excluded from ordinary retrieval.

Forget deletes the selected record. Conversation deletion also removes its conversation-scoped memory and pending proposals. Clear memory is separate from deleting chat history. Review suggestions never automatically delete important records.

## Retrieval
Fast uses at most two memories / 800 characters; other modes use at most six / 2400 characters. Scope, relevance, validity and task state are checked before inclusion. Memory · N shows the actual records supplied for that answer.

Indexed SQLite FTS/keyword retrieval works locally without embeddings. A configured local embedding backend can augment retrieval outside Fast mode, using a bounded window of 64 recent eligible records and at most 16 new record embeddings per request. Failure falls back to keyword retrieval. The real acceptance run used keyword retrieval; real embedding-model quality is NOT VERIFIED.

## Storage and backup
Records reside in the existing local ai.sqlite database. Migration preserves legacy content, ownership, scopes and timestamps. There is no automatic cloud synchronization. A selected cloud chat provider can receive relevant recalled context as part of the chat; use Local Only for local inference.

Export from the Memory page creates a separate JSON backup. Select the types to include; shared memory is excluded by default. AI profile packages do not include private memory by default. Memory import is not implemented. Avoid storing credentials: sensitive-content detection is conservative, but cannot guarantee detection of every possible secret.
