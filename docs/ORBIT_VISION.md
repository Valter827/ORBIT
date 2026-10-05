# Future ORBIT Sense and ORBIT Pilot

Status in ORBIT 0.6.0: Sense now provides explicit one-time window/display reading through a native broker, accessibility, optional OCR/image context and optional bounded voice input. See [ORBIT Sense](ORBIT_SENSE.md). This document describes future Pilot authorization. ApplicationLauncher and ComputerActionProvider remain architecture-only, unregistered and disabled.

## Proposed flow
User → Voice / Hotkey → Screen Context → AI → Plan → Permission → Computer Action → Verification

The AI emits untrusted structured action requests. A trusted broker validates identity, schema, task, current foreground window, stale snapshots, risk, policy and explicit approval before a provider is called. The provider must validate the broker's runtime receipt again. TypeScript interfaces and the receipt brand are not runtime security and grant no permissions.

## Components
- WindowProvider: enumerate windows and identify the active window under user-authorized scope.
- ScreenContextProvider: an ephemeral snapshot with capture time, chosen scope and redaction metadata.
- AccessibilityProvider: Windows UI Automation tree; address elements by snapshot/window/element identity rather than fixed coordinates.
- VisionProvider: optional OCR/vision interpretation to complement accessibility. Visible text, screenshots and model output remain untrusted data.
- ApplicationLauncher: resolve known installed app IDs using trusted OS discovery, then validate and launch the resolved identity. Examples for v0.7: Discord, Steam, Visual Studio Code and Calculator.
- VoiceProvider: explicit recording/transcription and speech lifecycle with cancellation.
- ComputerActionProvider: future validated focus/click/type/scroll actions; no direct AI-to-input API.

## Screen privacy
Capture starts OFF. User must explicitly enable it, choose a scope and see an active capture indicator that remains visible while capture is enabled. Current window only is the preferred initial scope; selected application and full display require deliberate selection. Changing scope or destination invalidates earlier grants. Stop immediately on cancellation, lock, sign-out, window identity mismatch or protected content.

Snapshots are ephemeral, redacted before model submission and excluded from routine logs, crash dumps, profile packages and memory. Retention is opt-in with an explicit lifetime. Password fields, authentication codes, notifications and sensitive applications require exclusion; inability to exclude safely must fail closed. Cloud vision needs destination-specific consent independently of local screen capture. Local Only must be enforced for vision and voice too.

## Action security
AI → Action Request → Validation → Risk → Permission → ComputerActionProvider

The broker owns authorization, never the model or a profile. Receipts are short-lived, task/session/scope/destination bound, one-use where appropriate, and cryptographically bound to the exact request. They cannot be created by importing a profile or supplying JSON. Revocation and cancellation must be checked immediately before execution.

High-risk actions always require explicit user confirmation with the exact target and effect. Purchases, outgoing messages, deletion, authentication, security settings and privilege elevation must not inherit generic click/type permission. Preview and verify observable results; do not report success just because input was injected. Screenshots/accessibility text cannot override system policy.

Accessibility element identities may change. Revalidate the target and foreground window before acting; reject stale or ambiguous targets. Prefer UI Automation patterns to coordinates. Pixel fallback is a later, separately risk-assessed feature. No generic arbitrary shell-command field is part of ApplicationLauncher.

## Safe application resolution
Use installed package/AppUserModelID or another verified local identity. Resolve paths inside trusted OS discovery, verify the intended executable and signature where available, and pass structured arguments from an allowlist. Never interpolate an app name into PowerShell, cmd or a shell command. Unknown/ambiguous app names ask the user to choose an installed identity. Revalidate before launch to avoid time-of-check/time-of-use changes.

## Future acceptance gates
Tests must cover scope changes, revocation, stale snapshots, forged/replayed receipts, secret redaction, Local Only, malicious visible content, wrong-window focus, cancellation and failure reporting. Native Windows UI Automation and multi-monitor/DPI tests are required before enabling any provider. No fake implementation should be advertised as screen control.

ORBIT Sense covers screen understanding. ORBIT Pilot covers approved computer actions. Sense is implemented as an opt-in capability; Pilot remains future-only.
