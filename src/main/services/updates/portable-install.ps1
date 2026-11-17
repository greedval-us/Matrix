param([Parameter(Mandatory = $true)][string]$ConfigPath)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
$config = [IO.File]::ReadAllText($ConfigPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$oldProcessesExited = $false

function Write-Log([string]$Message) {
  try { [IO.File]::AppendAllText($config.logPath, ([DateTime]::UtcNow.ToString('o') + ' ' + $Message + [Environment]::NewLine)) }
  catch { # Logging must never prevent restoration of the original executable.
  }
}

function Get-Hash([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Assert-Candidate {
  if (([IO.FileInfo]$config.candidatePath).Length -ne $config.size -or (Get-Hash $config.candidatePath) -ne $config.sha256) {
    throw 'Update candidate size or SHA-256 hash changed.'
  }
}

function Assert-NotCancelled {
  if ([IO.File]::Exists($config.cancelPath)) { throw 'Installation cancelled before application exit.' }
}

function Start-Portable {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $config.targetPath
  $start.WorkingDirectory = [IO.Path]::GetDirectoryName($config.targetPath)
  $start.UseShellExecute = $false
  # NSIS must supply fresh extraction paths to the new Electron process.
  foreach ($key in @($start.EnvironmentVariables.Keys)) {
    if ($key.StartsWith('PORTABLE_', [StringComparison]::OrdinalIgnoreCase)) { $start.EnvironmentVariables.Remove($key) }
  }
  $started = [Diagnostics.Process]::Start($start)
  if ($null -eq $started) { throw 'Could not restart the portable executable.' }
  $started.Dispose()
}

function Restore-Original {
  if (-not [IO.File]::Exists($config.backupPath)) { throw 'Original executable backup is missing.' }
  if ((Get-Hash $config.backupPath) -ne $config.originalSha256) { throw 'Original executable backup hash changed.' }
  if ([IO.File]::Exists($config.targetPath)) {
    try { [IO.File]::Replace($config.backupPath, $config.targetPath, $config.failedPath) }
    catch {
      if (-not [IO.File]::Exists($config.backupPath)) { throw }
      [IO.File]::Move($config.targetPath, $config.failedPath)
      [IO.File]::Move($config.backupPath, $config.targetPath)
    }
  } else {
    [IO.File]::Move($config.backupPath, $config.targetPath)
  }
  if ((Get-Hash $config.targetPath) -ne $config.originalSha256) { throw 'Restored executable hash mismatch.' }
  Write-Log 'Original executable restored.'
}

try {
  Assert-NotCancelled
  Assert-Candidate
  if ((Get-Hash $config.targetPath) -ne $config.originalSha256) { throw 'Original portable executable changed.' }
  # Capture process handles now, while Electron is still running, to avoid PID reuse.
  $electron = [Diagnostics.Process]::GetProcessById([int]$config.processId)
  $launcher = [Diagnostics.Process]::GetProcessById([int]$config.launcherPid)
  if (-not [string]::Equals($launcher.MainModule.FileName, $config.targetPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The parent process is not the original NSIS portable launcher.'
  }
  $null = $electron.Handle
  $null = $launcher.Handle
  Write-Log 'Ready; waiting for Electron and NSIS extraction cleanup.'
  [IO.File]::WriteAllText($config.readyPath, $config.token)
  $deadline = [DateTime]::UtcNow.AddMilliseconds([double]$config.exitTimeoutMs)
  while (-not $electron.HasExited -or -not $launcher.HasExited) {
    Assert-NotCancelled
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Timed out waiting for Electron and portable launcher exit.' }
    Start-Sleep -Milliseconds 200
  }
  $oldProcessesExited = $true
  $electron.Dispose()
  $launcher.Dispose()
  # Wait for remaining scanners/file handles before replacing an EXE on Windows.
  while ($true) {
    Assert-NotCancelled
    try {
      $handle = [IO.File]::Open($config.targetPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
      $handle.Dispose()
      break
    } catch {
      if ([DateTime]::UtcNow -ge $deadline) { throw 'Timed out waiting for portable executable file lock.' }
      Start-Sleep -Milliseconds 200
    }
  }
  Assert-NotCancelled
  Assert-Candidate
  if ((Get-Hash $config.targetPath) -ne $config.originalSha256) { throw 'Original portable executable changed before replacement.' }
  try {
    [IO.File]::Replace($config.candidatePath, $config.targetPath, $config.backupPath)
  } catch {
    # FAT/external drives may not support ReplaceFile. Rename only when both files
    # are intact, and retain the original under a unique backup name for rollback.
    if ([IO.File]::Exists($config.backupPath) -or -not [IO.File]::Exists($config.candidatePath) -or
      (Get-Hash $config.targetPath) -ne $config.originalSha256) { throw }
    [IO.File]::Move($config.targetPath, $config.backupPath)
    [IO.File]::Move($config.candidatePath, $config.targetPath)
  }
  if ((Get-Hash $config.targetPath) -ne $config.sha256) { throw 'Installed portable executable hash mismatch.' }
  Start-Portable
  Write-Log ('Installation complete; previous executable retained at ' + $config.backupPath)
  try { [IO.File]::WriteAllText($config.successPath, 'complete') } catch { Write-Log 'Could not write completion marker.' }
} catch {
  $failure = $_.Exception.Message
  Write-Log ('Installation failed: ' + $failure)
  try { [IO.File]::WriteAllText($config.errorPath, $failure) } catch { Write-Log 'Could not write error marker.' }
  if ([IO.File]::Exists($config.backupPath)) {
    try { Restore-Original } catch { Write-Log ('ROLLBACK FAILED: ' + $_.Exception.Message + '; backup: ' + $config.backupPath) }
  }
  # A rejected preparation must never restart or stop the still-running app.
  if ($oldProcessesExited -and -not [IO.File]::Exists($config.cancelPath) -and [IO.File]::Exists($config.targetPath)) {
    try {
      if ((Get-Hash $config.targetPath) -eq $config.originalSha256) { Start-Portable; Write-Log 'Restarted original executable.' }
    } catch { Write-Log ('Could not restart original executable: ' + $_.Exception.Message) }
  }
  exit 1
} finally {
  try { [IO.File]::Delete($config.candidatePath) }
  catch { Write-Log ('Could not remove update candidate: ' + $_.Exception.Message) }
}
