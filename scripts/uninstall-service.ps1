# Removes the Sheep Portal scheduled tasks and firewall rule, and stops a portal the watchdog started.
# Run through "Uninstall Sheep Portal Service.bat". The database and backups are not touched.
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit
}

foreach ($name in 'Sheep Portal', 'Sheep Portal Backup') {
  Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
}
Get-NetFirewallRule -DisplayName 'Sheep Portal' -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Stop the web server and the watchdog that belong to this folder.
$nextBin = Join-Path $Root 'node_modules\next\dist\bin\next'
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine.Contains($nextBin) -or $_.CommandLine.Contains((Join-Path $Root 'scripts\watchdog.ps1')))
} | ForEach-Object { & taskkill.exe /PID $_.ProcessId /T /F 2>&1 | Out-Null }

Write-Host 'Sheep Portal service removed. Docker containers (if you use Docker) keep running; use "Stop Sheep Portal.bat" to stop them.'
Read-Host 'Press Enter to close'
