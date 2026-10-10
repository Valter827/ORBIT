# Trusted Windows releases

Production command: `npm run build:production`. The default `npm run build:desktop` produces an **unsigned test build**, never a trusted production release. Production fails before compilation if signing prerequisites are missing.

## Certificate Store setup

Provision a publicly trusted Code Signing certificate and its private-key provider in Windows Certificate Store (CurrentUser/My or LocalMachine/My). Hardware or cloud-backed certificates must expose their signing key through a provider compatible with Windows SDK SignTool. This integration does not provision or purchase certificates and does not implement an arbitrary remote signing API.

Set these environment variables in a trusted terminal or protected CI environment:
- WINDOWS_CERTIFICATE_THUMBPRINT: certificate SHA-1 identifier (not the signing digest).
- WINDOWS_CERTIFICATE_STORE: CurrentUser (default) or LocalMachine.
- WINDOWS_TIMESTAMP_URL: your provider's RFC3161 timestamp endpoint.
- WINDOWS_EXPECTED_PUBLISHER: optional exact certificate Subject.
- WINDOWS_SIGNTOOL_PATH: optional Windows SDK x64 signtool.exe path.

Do not put private keys, PFX files, passwords or tokens in source control or command-line arguments. Use a dedicated protected Windows signing runner with a pre-provisioned key. This project deliberately does not import PFX files or mint a certificate. Restrict runner and protected environment access to trusted release maintainers.

The hook checks private-key availability, certificate dates, Code Signing EKU, online chain trust and optional publisher. Self-signed leaf certificates are rejected. It signs with SHA256 and RFC3161 timestamps, verifies the result, records publisher and timestamp-authority metadata, and computes hashes only afterwards. Tauri invokes the hook for its Windows signing targets, including the NSIS uninstaller and final installer. Valid vendor signatures on bundled Node are preserved; invalid bundled executable signatures stop production packaging.

A successful build is not native acceptance. Install the exact verified artifact under the intended unchanged policy, launch its real Desktop shortcut, and verify the installed executable and uninstaller. Inspect current Code Integrity logs. Run creator, real file import, memory isolation, restart, export/import, Credential Manager and Agent/Undo checks. Fixture tests do not establish live Anthropic or local-model operation.

## Evidence on this PC, 2026-09-27

Smart App Control registry state: VerifiedAndReputablePolicyState=1. CodeIntegrity event 3099 identifies active VerifiedAndReputableDesktop policy {0283ac0f-fff1-49ae-ada1-8a933130cad6}. Events 3077/3033 blocked the unsigned 0.5.1 installer at 11:00:09. CiTool policy enumeration returned access denied, so a complete policy inventory is unavailable.

No code-signing certificate was found in CurrentUser/My or LocalMachine/My. The user confirmed no certificate or signing service is available. Bundled Node has a valid OpenJS Foundation signature. This is not an ORBIT publisher identity.

Do not disable SAC/WDAC/SmartScreen, change policy, or move/rename blocked artifacts to evade enforcement. Signing does not guarantee reputation or acceptance under every organizational policy.

References:
- [Microsoft: code signing for Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)
- [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/)

ORBIT Sense means future screen understanding; ORBIT Pilot means future approved computer actions. Existing Vision interfaces remain architecture only.

CI production uses the protected windows-production environment and a dedicated runner labelled orbit-signing-windows. Restrict that environment to main and require maintainer approval. Set WINDOWS_SIGNING_RUNNER_READY=true only after provisioning the runner. A hosted prerequisite job fails clearly when signing configuration is absent. Development runs npm run dev:desktop; unsigned-test runs npm run build:desktop; production runs npm run build:production.
