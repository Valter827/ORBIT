// Fixed script, data arrives through stdin JSON. No audio or text is put in shell
// command arguments or written to disk. Never use ExecutionPolicy Bypass.
export const windowsSpeechScript = String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Speech
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($request.mode -eq 'probe') {
  $s=New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $voices=@($s.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { @{id=$_.VoiceInfo.Name;name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name} })
    $recognizers=@([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { @{id=$_.Id;language=$_.Culture.Name} })
    @{voices=$voices;recognizers=$recognizers} | ConvertTo-Json -Depth 5 -Compress
  } finally { $s.Dispose() }
} elseif ($request.mode -eq 'tts') {
  $s=New-Object System.Speech.Synthesis.SpeechSynthesizer
  $stream=New-Object System.IO.MemoryStream
  try {
    $s.SelectVoice([string]$request.voice)
    $s.Rate=[int]$request.rate
    $s.Volume=[int]$request.volume
    $s.SetOutputToWaveStream($stream)
    $s.Speak([string]$request.text)
    @{audio=[Convert]::ToBase64String($stream.ToArray())} | ConvertTo-Json -Compress
  } finally { $s.Dispose(); $stream.Dispose() }
} elseif ($request.mode -eq 'stt') {
  $available=@([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $request.language })
  if ($available.Count -eq 0) { throw 'No installed Windows recognizer for the selected language.' }
  $r=New-Object System.Speech.Recognition.SpeechRecognitionEngine($available[0])
  $bytes=[Convert]::FromBase64String([string]$request.audio)
  $stream=New-Object System.IO.MemoryStream(,$bytes)
  try {
    $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
    $r.SetInputToWaveStream($stream)
    $segments=New-Object System.Collections.Generic.List[string]
    while ($null -ne ($result=$r.Recognize())) { $segments.Add($result.Text) }
    @{text=($segments -join ' ')} | ConvertTo-Json -Compress
  } finally { $r.Dispose(); $stream.Dispose(); [Array]::Clear($bytes,0,$bytes.Length) }
} else { throw 'Unknown speech operation.' }
`;
