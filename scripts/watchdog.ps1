# Keeps Sheep Portal running on Windows: starts it, checks /api/health every 20 seconds, and restarts it
# when the process dies or stops answering. Installed as a scheduled task by "Install Sheep Portal Service.bat".
#
#   -Mode local   runs Node against the PostgreSQL installed on this computer (starts at boot, no login needed)
#   -Mode docker  runs `docker compose up -d` and restarts the app container when it stops answering
#
# Logs are written to the logs\ folder next to the project.
param(
  [ValidateSet('local', 'docker')][string]$Mode = 'local',
  [int]$Port = 3000,
  [string]$NodePath = '',
  [int]$IntervalSeconds = 20,
  [int]$FailuresBeforeRestart = 3,
  [int]$GraceSeconds = 60
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null
$WatchLog = Join-Path $LogDir 'watchdog.log'

function Log([string]$Message) {
  if ((Test-Path $WatchLog) -and (Get-Item $WatchLog).Length -gt 2MB) { Move-Item $WatchLog "$WatchLog.old" -Force }
  Add-Content -Path $WatchLog -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message)
}

# 200 = healthy, 503 = the app is up but cannot reach the database, 0 = no answer.
function Get-Status([string]$Path) {
  try {
    return [int](Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port$Path" -TimeoutSec 10).StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

# An older build without /api/health (404) is judged by its home page instead of being restarted forever.
function Get-Health {
  $code = Get-Status '/api/health'
  if ($code -eq 404) { if ((Get-Status '/') -eq 200) { return 200 } }
  return $code
}

# Keep only the newest logs of a kind.
function Prune-Logs([string]$Filter, [int]$Keep) {
  Get-ChildItem $LogDir -Filter $Filter | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Stop-Tree([int]$ProcessId) {
  & taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
}

Log "Watchdog started (mode: $Mode, port: $Port)."

# ---------------------------------------------------------------- docker mode

if ($Mode -eq 'docker') {
  function Test-Engine { & cmd.exe /c 'docker info >nul 2>&1'; return ($LASTEXITCODE -eq 0) }

  while ($true) {
    $waited = $false
    while (-not (Test-Engine)) {
      if (-not $waited) { Log 'Docker is not running yet. Waiting for it...'; $waited = $true }
      Start-Sleep -Seconds 15
    }
    Log 'Docker is running. Starting the containers.'
    # Through cmd so Docker's progress text on stderr is not turned into PowerShell errors.
    $up = & cmd.exe /c 'docker compose up -d 2>&1' | Out-String
    Log ("docker compose up -d finished (exit $LASTEXITCODE). " + (($up -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ' | '))

    $started = Get-Date
    $fails = 0
    while ($true) {
      Start-Sleep -Seconds $IntervalSeconds
      if (-not (Test-Engine)) { Log 'Docker stopped. Waiting for it to come back.'; break }
      if (((Get-Date) - $started).TotalSeconds -lt $GraceSeconds) { continue }

      $running = (& docker compose ps -q --status running app 2>$null | Out-String).Trim()
      if (-not $running) {
        Log 'The app container is not running. Starting it.'
        & docker compose up -d 2>&1 | Out-Null
        $started = Get-Date; $fails = 0
        continue
      }
      $code = Get-Health
      if ($code -eq 200 -or $code -eq 503) { $fails = 0; if ($code -eq 503) { Log 'The app is up but cannot reach the database.' }; continue }
      $fails++
      Log "Health check failed ($fails of $FailuresBeforeRestart, status $code)."
      if ($fails -ge $FailuresBeforeRestart) {
        Log 'Restarting the app container.'
        & docker compose restart app 2>&1 | Out-Null
        $started = Get-Date; $fails = 0
      }
    }
  }
}

# ----------------------------------------------------------------- local mode

if ($NodePath) { $NodeExe = $NodePath } else { $NodeExe = (Get-Command node.exe -ErrorAction Stop).Source }
$env:Path = (Split-Path -Parent $NodeExe) + ';' + $env:Path   # run-local.mjs calls npm
$NextBin = Join-Path $Root 'node_modules\next\dist\bin\next'

$HttpsScript = Join-Path $Root 'scripts\https-proxy.mjs'

# HTTPS on port 443 is served by a small proxy (scripts\https-proxy.mjs) when .env names a certificate.
function Test-HttpsConfigured {
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) { return $false }
  return [bool](Select-String -Path $envFile -Pattern '^\s*TLS_(CERT|PFX)_FILE\s*=\s*\S' -Quiet)
}

function Start-Https([string]$LogFile) {
  return Start-Process -FilePath $NodeExe -ArgumentList @("`"$HttpsScript`"") -WorkingDirectory $Root `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err"
}

# A previous watchdog that was killed can leave the web server behind; stop it so the port is free.
# Only portal processes whose parent is gone are touched.
function Remove-Orphans {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and ($_.CommandLine.Contains($NextBin) -or $_.CommandLine.Contains($HttpsScript)) -and -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue)
  } | ForEach-Object {
    Log "Stopping a leftover portal process (PID $($_.ProcessId))."
    Stop-Tree $_.ProcessId
  }
}

$restartDelay = 5
while ($true) {
  Remove-Orphans

  # Database, dependencies, tables and build. Quick when nothing changed; fails (and is retried) if PostgreSQL is down.
  $prepLog = Join-Path $LogDir 'prepare.log'
  $prep = Start-Process -FilePath $NodeExe -ArgumentList @('scripts\run-local.mjs', '--prepare', '--no-open') -WorkingDirectory $Root `
    -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $prepLog -RedirectStandardError "$prepLog.err"
  if ($prep.ExitCode -ne 0) {
    Log "Preparing the portal failed (exit $($prep.ExitCode)); see logs\prepare.log. Retrying in 60 seconds."
    Start-Sleep -Seconds 60
    continue
  }

  $outLog = Join-Path $LogDir ('portal-{0:yyyyMMdd-HHmmss}.log' -f (Get-Date))
  $env:NODE_ENV = 'production'
  $env:PORT = "$Port"
  $proc = Start-Process -FilePath $NodeExe -ArgumentList @("`"$NextBin`"", 'start', '-p', "$Port") -WorkingDirectory $Root `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError "$outLog.err"
  Prune-Logs 'portal-*.log' 20
  Prune-Logs 'portal-*.log.err' 20
  Log "Portal started (PID $($proc.Id))."

  $https = $null
  $httpsLog = Join-Path $LogDir 'https.log'
  if (Test-HttpsConfigured) {
    $https = Start-Https $httpsLog
    $httpsStarted = Get-Date
    Log "HTTPS proxy started (PID $($https.Id)); see logs\https.log."
  }

  $started = Get-Date
  $fails = 0
  $dbWarned = $false
  while ($true) {
    Start-Sleep -Seconds $IntervalSeconds
    if ($proc.HasExited) { Log "The portal process exited (code $($proc.ExitCode))."; break }
    # A broken certificate must not keep restarting the portal itself: retry only the HTTPS proxy, at most once a minute.
    if ($https -and $https.HasExited -and ((Get-Date) - $httpsStarted).TotalSeconds -gt 60) {
      Log "The HTTPS proxy exited (code $($https.ExitCode)); see logs\https.log. Starting it again."
      $https = Start-Https $httpsLog
      $httpsStarted = Get-Date
    }
    if (((Get-Date) - $started).TotalSeconds -lt $GraceSeconds) { continue }

    $code = Get-Health
    if ($code -eq 200) { $fails = 0; $dbWarned = $false; continue }
    if ($code -eq 503) {   # restarting the web server would not fix a database outage
      if (-not $dbWarned) { Log 'The portal is up but cannot reach the database.'; $dbWarned = $true }
      $fails = 0
      continue
    }
    $fails++
    Log "Health check failed ($fails of $FailuresBeforeRestart, status $code)."
    if ($fails -ge $FailuresBeforeRestart) { Log 'Restarting the portal.'; Stop-Tree $proc.Id; break }
  }

  if ($https -and -not $https.HasExited) { Stop-Tree $https.Id }

  # Back off when it keeps failing right after starting; reset once it has run for a while.
  if (((Get-Date) - $started).TotalSeconds -gt 300) { $restartDelay = 5 } else { $restartDelay = [Math]::Min($restartDelay * 2, 120) }
  Log "Starting again in $restartDelay seconds."
  Start-Sleep -Seconds $restartDelay
}
