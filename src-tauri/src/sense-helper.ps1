# Fixed native helper. Input is data read from stdin, never interpolated PowerShell.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
try {
  $inputData=[Console]::ReadLine() | ConvertFrom-Json
  if ($inputData.action -eq 'voice') {
    Add-Type -AssemblyName System.Speech
    $recognizer=New-Object System.Speech.Recognition.SpeechRecognitionEngine
    try {
      $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
      $recognizer.SetInputToDefaultAudioDevice()
      $result=$recognizer.Recognize([TimeSpan]::FromSeconds(8))
      if (-not $result) { throw 'No speech recognized.' }
      @{text=$result.Text;confidence=$result.Confidence} | ConvertTo-Json -Compress
    } finally { $recognizer.Dispose() }
    exit
  }
  Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase,System.Drawing,System.Windows.Forms
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OrbitSenseWin {
 public delegate bool EnumProc(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc fn,IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] public static extern int GetWindowStyle(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr h,out uint affinity);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int attr,out int value,int size);
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
}
'@
  function WindowInfo([IntPtr]$handle) {
    if (-not [OrbitSenseWin]::IsWindowVisible($handle) -or [OrbitSenseWin]::IsIconic($handle)) { return $null }
    $cloaked=0
    [void][OrbitSenseWin]::DwmGetWindowAttribute($handle,14,[ref]$cloaked,4)
    if ($cloaked) { return $null }
    $title=New-Object Text.StringBuilder 1024
    [void][OrbitSenseWin]::GetWindowText($handle,$title,1024)
    if (-not $title.Length) { return $null }
    $processNumber=[uint32]0
    [void][OrbitSenseWin]::GetWindowThreadProcessId($handle,[ref]$processNumber)
    $process=Get-Process -Id $processNumber -ErrorAction SilentlyContinue
    if (-not $process -or $process.ProcessName -eq 'ORBIT') { return $null }
    try { $started=$process.StartTime.ToUniversalTime().Ticks.ToString() } catch { return $null }
    return @{id=$handle.ToInt64().ToString();title=$title.ToString();application=$process.ProcessName;processId=$processNumber;started=$started;foreground=($handle -eq [OrbitSenseWin]::GetForegroundWindow())}
  }
  if ($inputData.action -eq 'windows') {
    $voiceAvailable=$false
    try { Add-Type -AssemblyName System.Speech; $voiceAvailable=@([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()).Count -gt 0 } catch { }
    $script:windows=New-Object 'System.Collections.Generic.List[object]'
    $callback=[OrbitSenseWin+EnumProc]{param($h,$l) $w=WindowInfo $h; if ($w) { $script:windows.Add($w) }; return $true}
    [void][OrbitSenseWin]::EnumWindows($callback,[IntPtr]::Zero)
    @{voiceAvailable=$voiceAvailable;windows=@($script:windows.ToArray());displays=@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{id=$_.DeviceName;title=$_.DeviceName;primary=$_.Primary} })} | ConvertTo-Json -Depth 6 -Compress
    exit
  }
  if ($inputData.action -ne 'capture') { throw 'Unsupported Sense operation.' }
  $scope=$inputData.scope
  $window=$null
  if ($scope -ne 'display') {
    $handle=[IntPtr][long]$inputData.target.id
    $window=WindowInfo $handle
    if (-not $window -or $window.processId -ne $inputData.target.processId -or $window.started -ne $inputData.target.started) { throw 'Shared window changed or is unavailable. Share again.' }
    $affinity=[uint32]0
    [void][OrbitSenseWin]::GetWindowDisplayAffinity($handle,[ref]$affinity)
    if ($affinity -ne 0) { throw 'This window excludes screen capture.' }
    $rect=New-Object OrbitSenseWin+RECT
    if (-not [OrbitSenseWin]::GetWindowRect($handle,[ref]$rect)) { throw 'Window bounds unavailable.' }
    $bounds=New-Object Drawing.Rectangle($rect.Left,$rect.Top,($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
  } else {
    $display=[System.Windows.Forms.Screen]::AllScreens | Where-Object DeviceName -eq $inputData.target.id | Select-Object -First 1
    if (-not $display) { throw 'Shared display is unavailable.' }
    $bounds=$display.Bounds
    $root=[System.Windows.Automation.AutomationElement]::RootElement
  }
  if ($bounds.Width -lt 10 -or $bounds.Height -lt 10 -or $bounds.Width -gt 7680 -or $bounds.Height -gt 4320) { throw 'Unsupported capture dimensions.' }
  $nodes=New-Object 'System.Collections.Generic.List[object]'
  $text=New-Object Text.StringBuilder
  $namesText=New-Object Text.StringBuilder
  $protectedCount=0
  $complete=$true
  $queue=New-Object 'System.Collections.Generic.Queue[object]'
  $queue.Enqueue($root)
  $watch=[Diagnostics.Stopwatch]::StartNew()
  $walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
  while ($queue.Count -and $nodes.Count -lt 300 -and $watch.ElapsedMilliseconds -lt 4000) {
    $element=$queue.Dequeue()
    try {
      $current=$element.Current
      if ($current.IsOffscreen) { continue }
      $b=$current.BoundingRectangle
      if ($b.IsEmpty -or $b.Right -le $bounds.Left -or $b.Left -ge $bounds.Right -or $b.Bottom -le $bounds.Top -or $b.Top -ge $bounds.Bottom) { continue }
      $nativePassword=$false
      if ($current.NativeWindowHandle -ne 0 -and $current.ClassName -match "Edit") {
        $nativePassword=([OrbitSenseWin]::GetWindowStyle([IntPtr]$current.NativeWindowHandle,-16) -band 0x20) -ne 0
      }
      $sensitiveInput=$current.ControlType.ProgrammaticName -match "Edit|ComboBox" -and $current.Name -match "(?i)password|passwd|api[ _-]*key|access[ _-]*token|secret|private[ _-]*key|credential"
      if ($current.IsPassword -or $nativePassword -or $sensitiveInput) { $protectedCount++; continue }
      $name=$current.Name
      if ($name.Length -gt 600) { $name=$name.Substring(0,600) }
      $role=$current.ControlType.ProgrammaticName.Replace('ControlType.','')
      $nodes.Add(@{name=$name;role=$role;focused=$current.HasKeyboardFocus})
      if ($name) { [void]$text.AppendLine($name); [void]$namesText.AppendLine($name) }
      $pattern=$null
      if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) {
        foreach ($range in $pattern.GetVisibleRanges()) {
          if ($text.Length -lt 16000) { [void]$text.AppendLine($range.GetText([Math]::Min(3000,16000-$text.Length))) }
        }
      }
      $child=$walker.GetFirstChild($element)
      $childCount=0
      while ($child -and $childCount -lt 300) { $queue.Enqueue($child); $child=$walker.GetNextSibling($child); $childCount++ }
    } catch { $complete=$false }
  }
  if ($queue.Count) { $complete=$false }
  $visible=if ($protectedCount) { $namesText.ToString() } else { $text.ToString() }
  if ($visible.Length -gt 16000) { $visible=$visible.Substring(0,16000); $complete=$false }
  $warnings=New-Object 'System.Collections.Generic.List[string]'
  if ($protectedCount) { $warnings.Add('Protected controls excluded. Image transfer disabled.') }
  if (-not $complete) { $warnings.Add('Accessibility extraction is partial. Image transfer disabled.') }
  $image=$null
  $ocrText=''
  $ocrStatus=if ($protectedCount) { 'excluded-protected-content' } else { 'not-needed' }
  $bitmap=$null
  if ($protectedCount -eq 0 -and ($inputData.snapshot -or $visible.Trim().Length -lt 80)) {
    try {
      $bitmap=New-Object Drawing.Bitmap($bounds.Width,$bounds.Height)
      $graphics=[Drawing.Graphics]::FromImage($bitmap)
      try {
        if ($scope -eq 'display') {
          $graphics.CopyFromScreen($bounds.Location,[Drawing.Point]::Empty,$bounds.Size)
        } else {
          $dc=$graphics.GetHdc()
          try { if (-not [OrbitSenseWin]::PrintWindow($handle,$dc,2)) { throw 'Window snapshot unavailable.' } }
          finally { $graphics.ReleaseHdc($dc) }
        }
      } finally { $graphics.Dispose() }
      Add-Type -AssemblyName System.Runtime.WindowsRuntime
      $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
      $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
      $null=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Foundation,ContentType=WindowsRuntime]
      function Await($operation,[Type]$resultType) {
        $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 } | Select-Object -First 1
        $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation))
        if (-not $task.Wait(5000)) { throw 'OCR timed out.' }
        return $task.Result
      }
      $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
      if (-not $engine) { throw 'No Windows OCR language is installed.' }
      $memory=New-Object IO.MemoryStream
      $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
      $random=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
      $writer=New-Object Windows.Storage.Streams.DataWriter($random)
      $writer.WriteBytes($memory.ToArray())
      $null=Await ($writer.StoreAsync()) ([uint32])
      $random.Seek(0)
      $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($random)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $software=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $ocr=Await ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult])
      $ocrText=$ocr.Text
      if ($ocrText.Length -gt 16000) { $ocrText=$ocrText.Substring(0,16000); $complete=$false }
      $ocrStatus='available-confidence-unknown'
      $warnings.Add('OCR may misread text; Windows does not provide a confidence score.')
      if ($inputData.snapshot -and $protectedCount -eq 0 -and $complete) {
        $jpeg=New-Object IO.MemoryStream
        $scale=[Math]::Min(1.0,1600.0/[Math]::Max($bitmap.Width,$bitmap.Height))
        $preview=New-Object Drawing.Bitmap($bitmap,(New-Object Drawing.Size([int]($bitmap.Width*$scale),[int]($bitmap.Height*$scale))))
        try { $preview.Save($jpeg,[Drawing.Imaging.ImageFormat]::Jpeg) } finally { $preview.Dispose() }
        if ($jpeg.Length -le 1500000) { $image=[Convert]::ToBase64String($jpeg.ToArray()) }
        else { $warnings.Add('Image is too large; using extracted text.') }
        $jpeg.Dispose()
      }
      $software.Dispose(); $writer.Dispose(); $random.Dispose(); $memory.Dispose()
    } catch { $ocrStatus='unavailable'; $warnings.Add('OCR or snapshot unavailable. Using accessibility text only.'); $image=$null }
    finally { if ($bitmap) { $bitmap.Dispose() } }
  }
  @{scope=$scope;window=$window;capturedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();visibleText=$visible;nodes=@($nodes.ToArray());ocrText=$ocrText;ocrStatus=$ocrStatus;image=$image;protectedCount=$protectedCount;complete=$complete;warnings=@($warnings.ToArray());url=$null} | ConvertTo-Json -Depth 8 -Compress
} catch {
  @{error='Sense could not read this scope. It may be protected, closed, inaccessible, or missing an optional Windows component. Choose another visible window.'} | ConvertTo-Json -Compress
  exit 1
}
