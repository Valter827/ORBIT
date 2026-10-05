# Disposable CI installation check. Does not claim native UI or real AI acceptance.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Only run on a disposable GitHub runner.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$release = Join-Path (Get-Location) "release/ORBIT-$version-windows-x64"
$status = Get-Content (Join-Path $release 'release-status.json') -Raw | ConvertFrom-Json
$installDir = Join-Path $env:RUNNER_TEMP "ORBIT-$version-installed"
if (Test-Path -LiteralPath $installDir) { throw 'Installation destination is not fresh.' }
$result = [ordered]@{ version=$version; commit=$status.commit; scope='packaging only'; nativeAcceptance='NOT VERIFIED'; realAI='NOT VERIFIED'; installation='NOT VERIFIED'; portableContents='NOT VERIFIED'; portableMove='NOT VERIFIED'; uninstall='NOT VERIFIED' }
try {
  $setup = Join-Path $release $status.installer.name
  if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $status.installer.sha256) { throw 'Installer hash mismatch.' }
  $process = Start-Process -FilePath $setup -ArgumentList @('/S', "/D=$installDir") -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer exit $($process.ExitCode)" }
  $exe = Join-Path $installDir 'ORBIT.exe'
  if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $status.exe.sha256) { throw 'Installed EXE differs from freshly compiled EXE.' }
  foreach ($resource in $status.resources) {
    if ((Get-FileHash -LiteralPath (Join-Path $installDir $resource.path) -Algorithm SHA256).Hash -ne $resource.sha256) { throw "Installed resource differs: $($resource.path)" }
  }
  $result.installation = 'PASS'
  $result.installedExe = $exe
  $result.desktopShortcut = 'NOT VERIFIED'
  $result.startMenu = 'NOT VERIFIED'
  $shell = New-Object -ComObject WScript.Shell
  $desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ORBIT.lnk'
  $start = Join-Path ([Environment]::GetFolderPath('Programs')) 'ORBIT/ORBIT.lnk'
  foreach ($item in @(@($desktop, 'desktopShortcut'), @($start, 'startMenu'))) {
    if (Test-Path -LiteralPath $item[0]) {
      $target = $shell.CreateShortcut($item[0]).TargetPath
      if ([IO.Path]::GetFullPath($target) -ne [IO.Path]::GetFullPath($exe)) { throw 'Shortcut targets another EXE.' }
      $result[$item[1]] = 'PASS'
    }
  }
  $portableDir = Join-Path $env:RUNNER_TEMP "ORBIT-$version-portable"
  if (Test-Path -LiteralPath $portableDir) { throw 'Portable destination is not fresh.' }
  Expand-Archive -LiteralPath (Join-Path $release $status.portable.name) -DestinationPath $portableDir
  if ((Get-FileHash -LiteralPath (Join-Path $portableDir 'ORBIT/ORBIT.exe') -Algorithm SHA256).Hash -ne $status.exe.sha256) { throw 'Portable EXE hash mismatch.' }
  foreach ($resource in $status.resources) {
    if ((Get-FileHash -LiteralPath (Join-Path $portableDir "ORBIT/$($resource.path)") -Algorithm SHA256).Hash -ne $resource.sha256) { throw 'Portable resource differs.' }
  }
  $result.portableContents = 'PASS'
} finally {
  $uninstaller = Join-Path $installDir 'uninstall.exe'
  if (Test-Path -LiteralPath $uninstaller) {
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    Start-Sleep -Seconds 3
    if ($process.ExitCode -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $installDir 'ORBIT.exe'))) { $result.uninstall = 'PASS' }
    else { $result.uninstall = 'FAIL' }
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'validation/windows-package-smoke.json' -Encoding utf8
}
if ($result.uninstall -ne 'PASS') { throw 'Uninstallation failed.' }
