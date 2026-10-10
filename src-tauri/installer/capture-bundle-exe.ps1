param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Source
if ($file.Name -ne 'ORBIT.exe' -or $file.Length -lt 2) { throw 'Unexpected NSIS main binary.' }
# A packaging snapshot only: no executable is run, modified, or re-signed here.
Copy-Item -LiteralPath $file.FullName -Destination ($file.FullName + '.nsis') -Force
