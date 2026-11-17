param(
  [Parameter(Mandatory = $true)][string]$HelperPath,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$config = [IO.File]::ReadAllText($ConfigPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
try {
  # Windows paths cannot contain double quotes. Quote each path for the Windows
  # argument parser; no command shell interprets apostrophes, dollars or brackets.
  if ($HelperPath.Contains('"') -or $ConfigPath.Contains('"')) { throw 'Invalid helper path.' }
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
  $start.Arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $HelperPath + '" -ConfigPath "' + $ConfigPath + '"'
  $start.WorkingDirectory = [IO.Path]::GetDirectoryName($HelperPath)
  # ShellExecute gives PowerShell a separate hidden console, independent of the
  # Electron/Node caller. No elevation or shell command is requested.
  $start.UseShellExecute = $true
  $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  $worker = [Diagnostics.Process]::Start($start)
  if ($null -eq $worker) { throw 'Could not launch the portable installer worker.' }
  $worker.Dispose()
} catch {
  [IO.File]::WriteAllText($config.errorPath, $_.Exception.Message)
  exit 1
}
