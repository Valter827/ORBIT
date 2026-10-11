# Explicit opt-in provisioning only. Never invoked by the app or installer.
param([Parameter(Mandatory=$true)][string]$Python,[string]$Destination='D:\ORBIT\TrainingEnv',[switch]$ApproveLargeInstall)
$ErrorActionPreference='Stop'
if(-not $ApproveLargeInstall){throw 'Explicit approval required: CUDA PyTorch and training dependencies use several GB.'}
$resolved=[IO.Path]::GetFullPath($Destination)
if($resolved -eq [IO.Path]::GetPathRoot($resolved)){throw 'Environment cannot be a drive root'}
if(Test-Path -LiteralPath $resolved){throw 'Use a new isolated environment; existing environments are not overwritten'}
& $Python -m venv $resolved
if($LASTEXITCODE -ne 0){throw 'venv creation failed'}
$venv=Join-Path $resolved 'Scripts/python.exe'
$env:PIP_CACHE_DIR=Join-Path $resolved 'pip-cache'
& $venv -m pip install --disable-pip-version-check torch==2.8.0 --index-url https://download.pytorch.org/whl/cu128
if($LASTEXITCODE -ne 0){throw 'PyTorch installation failed'}
& $venv -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt') --index-url https://pypi.org/simple
if($LASTEXITCODE -ne 0){throw 'Training dependency installation failed'}
& $venv -m pip freeze | Set-Content (Join-Path $resolved 'installed-versions.txt') -Encoding utf8
& $venv -I (Join-Path $PSScriptRoot 'worker.py') --probe
