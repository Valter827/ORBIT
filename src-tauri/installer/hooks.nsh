; Tauri NSIS manages Desktop and Start Menu shortcuts, including the user's
; finish-page preference and /NS. Do not create a second unconditional shortcut.

; Capture the freshly compiled/signed binary at NSIS compile time, after Tauri
; has applied its bundle marker. Tauri restores the unmarked compiler output
; afterwards, so that output cannot identify the EXE actually installed.
!define ORBIT_CAPTURE_SCRIPT "${__FILEDIR__}\capture-bundle-exe.ps1"
!macro NSIS_HOOK_PREINSTALL
  !execute '"$%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File "${ORBIT_CAPTURE_SCRIPT}" -Source "${MAINBINARYSRCPATH}"' = 0
!macroend
