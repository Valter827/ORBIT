# Run only on a disposable Windows CI runner / test account.
# Installs the real NSIS bundle, verifies shortcuts and opens ORBIT via its .lnk.
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Use a disposable CI runner for this installation smoke test.' }
$orbitVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version
$setup = Get-ChildItem -LiteralPath 'src-tauri/target/release/bundle/nsis' -Filter "*_${orbitVersion}_x64-setup.exe" | Select-Object -First 1
if (-not $setup) { throw 'No NSIS installer was produced.' }
if ($env:ORBIT_RELEASE_TYPE -eq 'production') { & ./scripts/windows-sign.ps1 -Mode Verify -File $setup.FullName }
$installDir = Join-Path $env:RUNNER_TEMP 'ORBIT-installed'
$install = Start-Process -FilePath $setup.FullName -ArgumentList @('/S', "/D=$installDir") -WindowStyle Hidden -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer returned $($install.ExitCode)" }
$exe = Join-Path $installDir 'ORBIT.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'ORBIT.exe missing after install.' }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ORBIT.lnk'
if (-not (Test-Path -LiteralPath $desktop)) { throw 'Desktop shortcut missing.' }
$start = Join-Path ([Environment]::GetFolderPath('Programs')) 'ORBIT'
if (-not (Get-ChildItem -LiteralPath $start -Filter '*.lnk')) { throw 'Start Menu shortcut missing.' }
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($desktop)
if ([IO.Path]::GetFullPath($shortcut.TargetPath) -ne [IO.Path]::GetFullPath($exe)) { throw 'Shortcut target is incorrect.' }
$uninstall = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object DisplayName -eq 'ORBIT'
if (-not $uninstall) { throw 'Uninstall registration missing.' }
# CDP is enabled only for this test process, never by the production application.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
$env:ORBIT_TEST_NODE = (Get-Command node).Source
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
Start-Process -FilePath $desktop -WindowStyle Hidden
& $env:ORBIT_TEST_NODE 'scripts/windows-native-smoke.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Native application smoke failed.' }
# v0.5 creator / knowledge / memory / chat / portability in the installed WebView.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9225'
Start-Process -FilePath $desktop -WindowStyle Hidden
& $env:ORBIT_TEST_NODE 'scripts/windows-v05-smoke.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Native v0.5 UX acceptance failed.' }
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9227'
Start-Process -FilePath $desktop -WindowStyle Hidden
& $env:ORBIT_TEST_NODE 'scripts/sense-native-ui-smoke.mjs' '--installed' '--exit'
if ($LASTEXITCODE -ne 0) { throw 'Native Sense acceptance failed.' }
$uninstaller = Join-Path $installDir 'uninstall.exe'
if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller missing.' }
if ($env:ORBIT_RELEASE_TYPE -eq 'production') {
  & ./scripts/windows-sign.ps1 -Mode Verify -File $exe
  & ./scripts/windows-sign.ps1 -Mode Verify -File $uninstaller
}
$result = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { throw 'Uninstall failed.' }
Start-Sleep -Seconds 3
if (Test-Path -LiteralPath $exe) { throw 'Uninstall left the executable.' }
if (Test-Path -LiteralPath $desktop) { throw 'Uninstall left Desktop shortcut.' }
if (Test-Path -LiteralPath $start) { if (Get-ChildItem -LiteralPath $start -Filter '*.lnk') { throw 'Uninstall left Start Menu shortcuts.' } }
if (Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object DisplayName -eq 'ORBIT') { throw 'Uninstall left registration.' }
Write-Output 'PASS: installer, Desktop and Start Menu shortcuts, native launch, restart and uninstall.'
