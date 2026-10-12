# ORBIT 0.11 — COSMO Voice

Voice uses the existing chat callback/router, Memory, Knowledge and Internet consent. It does not require a trained Alpha adapter and grants no additional tool permissions. Current production roles are unchanged.

Open Settings → Voice. Choose an input language and an actually installed Windows voice. The default is Review First. Click Microphone, explicitly allow access, speak, finish, review and send. Ctrl+Shift+Space holds to record in the visible chat; Ctrl+Space is already the desktop show/hide shortcut. Voice Mode listens again after a spoken response. Stop Voice stops recording, recognition, generation and playback. Leaving the page or hiding it releases the microphone.

All supplied speech providers are local. No cloud fallback is implemented. Audio stays in memory and is discarded. Diagnostic entries contain operation, provider, duration and status only. Do not export recordings as evidence.

## Local resources

Default storage: `D:\Orbit\AI\Voice`; STT, TTS and Cache subdirectories are independent of training. Paths are configurable in Voice settings. No downloads occur automatically. A fresh installation needs a permitted official whisper.cpp runtime and compatible GGML model; this PC has the official CPU v1.9.2 runtime and multilingual tiny model. Redistribution of those resources is not included in ORBIT installers.

- Runtime source: https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.2
- Runtime ZIP SHA256: `49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a`
- Model: https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1
- `ggml-tiny.bin`, 77,691,713 bytes, SHA256 `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21`.

Windows TTS enumerates installed voices. This PC currently exposes only Microsoft Zira Desktop (en-US). RU/UK speech input is supported by the multilingual backend but still requires real language acceptance; RU/UK TTS needs an installed compatible voice. Never claim absent voices as available.

## Honest limitations

No wake word, background recording, barge-in, partial transcription or streaming TTS. Recognition and synthesis are cancellable batch operations. Windows default audio output is used. RMS silence detection is bounded and requires microphone testing in the native WebView. ScriptProcessor is used for WebView2-compatible PCM capture; recordings are bounded to under 60 seconds. The model-first-token metric is observed through chat status polling, not a sample-accurate audio clock.

`scripts/voice-ui-smoke.mjs` uses explicit fixtures and is not real microphone acceptance. `scripts/voice-provider-acceptance.mjs` uses real Windows synthesis, real whisper.cpp and real local COSMO chat, with public synthetic English input kept in memory. Native microphone, audible output and Sense+Voice require separate acceptance.

## Training freeze

Experiment `cosmo-v11-20261011T171503-4d7608ae` remains FROZEN/BLOCKED. Pipeline PREPARED; Dataset v1.1 PASS; new baseline/training BLOCKED; COSMO Brain Alpha NOT CREATED. Windows Application Control blocks the required NumPy native module. Dataset, evaluation, base, adapters and historical archives are preserved. Do not remove pause markers or resume training without explicit authorization and an approved environment.
