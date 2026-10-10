param(
  [ValidateSet('Preflight','Sign','Verify')][string]$Mode = 'Preflight',
  [string]$File
)
$ErrorActionPreference = 'Stop'
$thumb = $env:WINDOWS_CERTIFICATE_THUMBPRINT
if ($thumb -notmatch '^[A-Fa-f0-9]{40}$') { throw 'SIGNING NOT AVAILABLE: WINDOWS_CERTIFICATE_THUMBPRINT must identify a trusted code-signing certificate.' }
$store = $env:WINDOWS_CERTIFICATE_STORE
if (-not $store) { $store = 'CurrentUser' }
if ($store -notin @('CurrentUser','LocalMachine')) { throw 'Invalid certificate store.' }
$cert = Get-Item -LiteralPath "Cert:\$store\My\$thumb" -ErrorAction Stop
if (-not $cert.HasPrivateKey) { throw 'Signing certificate has no accessible private key.' }
if ($cert.Subject -eq $cert.Issuer) { throw 'Self-signed certificates are not production signing identities.' }
if ($cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date)) { throw 'Signing certificate is outside its validity period.' }
if ('1.3.6.1.5.5.7.3.3' -notin @($cert.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })) { throw 'Certificate lacks Code Signing EKU.' }
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
try {
  $chain.ChainPolicy.RevocationMode = 'Online'
  if (-not $chain.Build($cert)) { throw 'Signing certificate trust/revocation validation failed.' }
} finally { $chain.Dispose() }
if ($env:WINDOWS_EXPECTED_PUBLISHER -and $cert.Subject -ne $env:WINDOWS_EXPECTED_PUBLISHER) { throw 'Certificate publisher mismatch.' }
$timestamp = $env:WINDOWS_TIMESTAMP_URL
$uri = $null
if (-not [Uri]::TryCreate($timestamp, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.IsLoopback) { throw 'Configure a trusted RFC3161 timestamp service in WINDOWS_TIMESTAMP_URL.' }
$signTool = $env:WINDOWS_SIGNTOOL_PATH
if (-not $signTool) {
  $signTool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $signTool -or -not (Test-Path -LiteralPath $signTool -PathType Leaf)) { throw 'Windows SDK signtool.exe is required.' }
if ($Mode -eq 'Preflight') { Write-Output "Signing preflight PASS: $($cert.Subject)"; exit 0 }
$target = (Resolve-Path -LiteralPath $File).Path
if ($Mode -eq 'Sign') {
  $signArgs = @('sign','/sha1',$thumb,'/s','My','/fd','SHA256','/tr',$timestamp,'/td','SHA256')
  if ($store -eq 'LocalMachine') { $signArgs += '/sm' }
  & $signTool @signArgs $target
  if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed.' }
}
& $signTool verify /pa /all /tw $target
if ($LASTEXITCODE -ne 0) { throw 'Authenticode verification failed.' }
$sig = Get-AuthenticodeSignature -LiteralPath $target
if ($sig.Status -ne 'Valid' -or -not $sig.TimeStamperCertificate -or $sig.SignerCertificate.Thumbprint -ne $cert.Thumbprint) { throw 'Production signature, publisher or timestamp verification failed.' }
$record = [ordered]@{
  path = $target; size = (Get-Item -LiteralPath $target).Length
  sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  publisher = $sig.SignerCertificate.Subject
  thumbprint = $sig.SignerCertificate.Thumbprint
  timestampPublisher = $sig.TimeStamperCertificate.Subject
  status = [string]$sig.Status
}
$record | ConvertTo-Json -Compress | Write-Output
if ($env:ORBIT_SIGNING_RECEIPTS) { $record | ConvertTo-Json -Compress | Add-Content -LiteralPath $env:ORBIT_SIGNING_RECEIPTS -Encoding utf8 }
