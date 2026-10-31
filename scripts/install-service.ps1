# Installs Sheep Portal as a self-restarting Windows service (two scheduled tasks plus a firewall rule).
# Run through "Install Sheep Portal Service.bat". Safe to run again: it replaces the earlier install.
param([string]$Port = '3000')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Needs administrator rights: relaunch elevated if necessary.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Asking for administrator permission...'
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Port', $Port)
  exit
}

try {
  # ---- which mode? Docker if it is installed and running, otherwise the local PostgreSQL.
  $mode = 'local'
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    # Through cmd: with -ErrorAction Stop, PowerShell 5.1 throws on any text a native command writes to stderr,
    # which is exactly what a stopped or broken Docker engine does.
    & cmd.exe /c 'docker info >nul 2>&1'
    if ($LASTEXITCODE -eq 0) { $mode = 'docker' }
    else { Write-Host 'Docker is installed but its engine is not usable, so the local PostgreSQL will be used.' -ForegroundColor Yellow }
  }
  $nodePath = ''
  if ($mode -eq 'local') {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'Neither Docker (running) nor Node.js was found. Install one of them first (see README section 3).' }
    $nodePath = $cmd.Source
  }
  Write-Host "Mode: $mode" -ForegroundColor Cyan

  # ---- one-time setup, done here so the unattended service never has to ask questions.
  if ($mode -eq 'local') {
    Write-Host 'Preparing the portal (database, packages, build). This can take a few minutes the first time...'
    & $nodePath scripts\run-local.mjs --prepare --no-open
    if ($LASTEXITCODE -ne 0) { throw 'Preparing the portal failed. Fix the problem shown above and run this again.' }
  } else {
    Write-Host 'Building and starting the containers...'
    & docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'docker compose failed. Fix the problem shown above and run this again.' }
  }

  # ---- the public address, so form submissions are accepted when the other server rewrites the Host header.
  $domain = (Read-Host 'Public address users will visit, e.g. portal.example.gov.kw (blank to skip)').Trim()
  $domain = ($domain -replace '^https?://', '') -replace '/.*$', ''
  if ($domain) {
    $envFile = Join-Path $Root '.env'
    $lines = @()
    if (Test-Path $envFile) { $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*ALLOWED_ORIGINS\s*=' }) }
    $lines += "ALLOWED_ORIGINS=$domain"
    Set-Content -Path $envFile -Value $lines -Encoding ASCII
    if ($mode -eq 'docker') { & docker compose up -d | Out-Null }
    Write-Host "Saved ALLOWED_ORIGINS=$domain to .env"
  }

  # ---- firewall: let the other server (and nobody outside the network) reach the portal.
  $remote = (Read-Host 'IP address of the server that forwards to this portal (blank = any computer on this network)').Trim()
  if (-not $remote) { $remote = 'LocalSubnet' }
  Get-NetFirewallRule -DisplayName 'Sheep Portal' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'Sheep Portal' -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $remote -Action Allow -Profile Any | Out-Null
  Write-Host "Firewall: port $Port is open to $remote"

  # ---- scheduled tasks
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $watch = Join-Path $Root 'scripts\watchdog.ps1'
  $backup = Join-Path $Root 'scripts\backup.ps1'
  $watchArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watch`" -Mode $mode -Port $Port"
  if ($nodePath) { $watchArgs += " -NodePath `"$nodePath`"" }
  $backupArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$backup`" -Mode $mode"

  foreach ($name in 'Sheep Portal', 'Sheep Portal Backup') { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue }

  # Restart the watchdog itself if it ever dies. No time limit.
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

  if ($mode -eq 'local') {
    # Starts at boot, before anyone logs in.
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  } else {
    # Docker Desktop only runs while someone is logged in, so start with that user's login.
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $me
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Highest
  }
  Register-ScheduledTask -TaskName 'Sheep Portal' -Description 'Starts Sheep Portal and restarts it if it stops answering.' `
    -Action (New-ScheduledTaskAction -Execute $ps -Argument $watchArgs -WorkingDirectory $Root) -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

  Register-ScheduledTask -TaskName 'Sheep Portal Backup' -Description 'Daily database backup into the backups folder.' `
    -Action (New-ScheduledTaskAction -Execute $ps -Argument $backupArgs -WorkingDirectory $Root) `
    -Trigger (New-ScheduledTaskTrigger -Daily -At '02:00') -Principal $principal `
    -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable) | Out-Null

  # A manually started portal would hold the port; the watchdog cannot take that over.
  Start-ScheduledTask -TaskName 'Sheep Portal'
  Write-Host 'Starting the portal...'
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
    Start-Sleep -Seconds 3
    try { $ok = ((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/health" -TimeoutSec 5).StatusCode -eq 200) } catch { }
  }

  Write-Host ''
  if ($ok) { Write-Host "Sheep Portal is running and will start by itself after every restart." -ForegroundColor Green }
  else { Write-Host 'The portal did not answer yet. See logs\watchdog.log and logs\prepare.log.' -ForegroundColor Yellow }
  Write-Host "  Address on this network : http://$([Net.Dns]::GetHostName()):$Port"
  Write-Host '  Logs                    : logs\'
  Write-Host '  Backups (daily 02:00)   : backups\  (copy these to another computer regularly)'
} catch {
  Write-Host ''
  Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host 'Press Enter to close'
