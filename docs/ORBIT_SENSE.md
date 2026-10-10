# ORBIT Sense — v0.6

ORBIT remains **Build Your Own AI**. Sense is an optional per-profile capability for seeing and understanding a user-selected visible window. It starts OFF. ORBIT Pilot (click/type/scroll/launch) is not enabled.

## Using Sense

1. Select your AI and open **Sense** beside Chat and Agent.
2. Enable Sense for that AI (also available in the AI editor's Capabilities section).
3. Choose **Current window**, **Selected application window**, or **Entire display**. The application scope pins one chosen top-level window, not every window of the process.
4. Press **Share selected scope**, then **Read shared window**. The sharing indicator and Stop remain visible.
5. Review extracted context, optionally acknowledge the remote provider, and ask a question.
6. **Stop sharing** revokes the native session and clears the in-memory context.

This version uses one-time snapshots and manual refresh. There is no background capture timer or automatic focus tracking. Each window is bound to its handle, process identity and start time; closed/reused windows require sharing again. Snapshot requests expire after five minutes.

The existing configurable Quick Ask hotkey (default Ctrl+Space) opens the quick overlay. Its **ORBIT Sense** button transfers the question to the main Sense view. It does not silently capture the foreground window.

## What is actually read

A bounded Windows UI Automation traversal reads visible control names, roles, focus state and visible text ranges. Window title and process identity are included. Password controls are excluded. If protected fields are detected, OCR and image transfer are disabled and ancestor bulk text is replaced with control names. URL and unavailable metadata remain unknown.

When text is sparse, or an image snapshot is explicitly selected, Windows OCR processes an in-memory window/display bitmap. OCR depends on installed Windows language support; its API does not expose a confidence score. The UI warns that OCR can misread text. Protected/closed windows, denied access, missing components and timeouts fail clearly.

Optional JPEG snapshots are sent only with image opt-in, positive model vision metadata and successful privacy checks. Unknown/non-vision models receive extracted structured context, and the response labels that path explicitly. Image capture never implies that a model actually understood an image.

## Privacy and providers

- Capture is explicit; Sense capability alone grants no active screen access.
- The native broker only accepts calls from the main ORBIT window. Pilot operation names are rejected.
- Stop cancels in-flight work, invalidates the session and discards the snapshot. Closing the window stops sharing.
- Known token/key patterns and credential assignments are removed from extracted text. Protected controls, detected secrets, partial accessibility or unavailable OCR disable image transfer. Detection is heuristic, not a guarantee that every sensitive item can be recognized; review the selected scope.
- Remote acknowledgement binds to provider identity/type/endpoint, model and scope. Changing these requires a new acknowledgement.
- Local Only is enforced again in the core before provider use. Cloud-backed models exposed by local runtimes remain blocked by the existing resolver. There is no cloud fallback.
- The helper receives structured data on stdin, never an interpolated command. It uses fixed read-only native code and no execution-policy override.
- Screenshots, OCR and accessibility observations are not written to disk, logs, chat history, exported profiles or memory. Sense answers in this version also remain session-only. Normal Chat retains its existing conversation policy.
- Knowledge and enabled, scoped memory can inform answers. Response metadata identifies those sources. Sense never adds memory automatically.
- The OS/pagefile/crash infrastructure and a chosen remote provider's retention policy are outside application-level ephemeral storage guarantees.

## Voice

Click to speak explicitly opens the default microphone for bounded offline Windows speech recognition (up to eight seconds). The recognized question is inserted for review; it is not submitted automatically. Stop cancels it. No always-on microphone or audio-file retention is implemented. Availability depends on Windows recognizers and microphone permissions. The button is disabled when no offline recognizer is installed.

## Boundaries

Sense supplies no tools to the model and rejects any returned tool call. Screen content, OCR, control names and retrieved documents are untrusted data, never authorization. Existing Agent validation, risk, permission, Undo and verification remain independent.

ScreenContextProvider, WindowProvider, AccessibilityProvider and future action contracts remain in packages/core/src/vision/contracts.ts. The concrete v0.6 Windows adapter is src-tauri/src/sense.rs + sense-helper.ps1; core privacy/session abstractions, OCRProvider and VisionContextProvider are in packages/core/src/sense/session.ts. Native data travels through internal core operations that are absent from the frontend core-command allowlist.

## Validation

See ORBIT_V06_SENSE_REPORT.md for exact results. Fixture model transport tests do not establish live Anthropic or genuine local inference. Direct native execution does not establish installer acceptance or production signing.

Primary references:
- [Microsoft UI Automation TextPattern](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-textpattern-overview)
- [Windows OCR RecognizeAsync](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine.recognizeasync)
- [Windows PrintWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-printwindow)
