# ORBIT 0.5 — Visual and UX polish

Updated 2026-09-27. This report describes the current source, not the previously built preview installer.

## Implemented
- Grouped Main / Workspace / System navigation and Home quick actions.
- Chat / Agent segmented selection, short dismissible Agent explanation, actual event timeline and explicit tool/risk/command approvals.
- Compact AI cards with a primary chat action and additional actions menu; consistent line icons; truthful configuration/model-discovery states.
- Ten-step creator with a live identity/purpose/personality/brain/knowledge preview, plain-language slider summary, Cloud / Local choices, and a saved-AI completion screen.
- Simple / Advanced provider controls; optional technical model metadata.
- Knowledge cards, actual indexing counters, empty/loading states, and real source counts in the creator.
- Memory category filters, editable records with source/date, Forget, and a collapsed Add a memory form.
- Chat code blocks with language and clipboard copy; separate next-message context and actual response context; technical counters in details.
- New conversation and Ctrl+N reset a completed conversation without erasing an active generation. Startup keyboard tests wait for application readiness.
- Diff additions/removals and line colors, keyboard focus trapping in dialogs, explicit button variants, shared empty/loading/error components, spacing tokens and reduced-motion support.
- Compact layouts for smaller window heights. The Home Send button and creator footer are checked within the viewport.

## Verification on current source
- TypeScript typecheck: PASS.
- Frontend production build: PASS.
- Core ESLint: PASS (the repository lint command covers core, not frontend).
- git diff --check: PASS.
- Browser integration: PASS, using real core / SQLite / project tools and a local HTTP fixture for AI responses.
- Actual agent plan/tool/diff approvals, file change, verification and restart + Undo: PASS.
- Ten creator steps, knowledge note ingestion/count/preview, profile creation, streaming chat, code clipboard, Ctrl+N, memory edit/filter, saved settings/keyboard and reduced motion: PASS.
- Screenshot and overflow checks: 1100×700, 1366×768, 1440×900, 1920×1080.
- Evidence: validation/polish-result.json and validation/polish/*.png. Includes onboarding, Home, My AIs, all creator steps, knowledge, memory, chat, permission, diff, timeline and settings.
- Representative screenshots were visually inspected; the captures are a baseline with structural checks, not a claim that every pixel was independently reviewed.
- Earlier core suite result remains 212 passed / 11 skipped; it was not rerun solely for these frontend edits.

Run:
```
npm run frontend:build
node scripts/desktop-ui-smoke.mjs --browser "C:\Program Files\Google\Chrome\Application\chrome.exe" --visual
```

## Remaining limits
- New Windows installer/native acceptance is outstanding. The last native build was blocked by Windows Code Integrity (see ORBIT_V05_REPORT.md). No OS policy has been disabled or bypassed. The old preview installer contains none of this UI polish.
- scripts/windows-v05-smoke.mjs was adapted to the new completion screen, menus and context disclosure but not rerun against a new native build.
- Actual Anthropic/local LLM quality, native pickers, Windows clipboard integration, tray and clean-machine installation are not validated by the browser fixture.
- Shared components were extended where used. A complete standalone design-system library (every requested primitive and its own component gallery) is not yet implemented.
- Native scrolling/keyboard/DPI behavior still needs checking in the rebuilt WebView2 app; browser resolutions alone do not establish native acceptance.
- Optional drag-and-drop knowledge import was not added. The existing file/folder picker and manual notes remain.
