# Writes a database backup to the backups\ folder and deletes backups older than 14 days.
# Run daily by the "Sheep Portal Backup" scheduled task; can also be run by hand:
#   powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -Mode local|docker
# Restore with pg_restore (see README). Copy the backups\ folder to another machine regularly.
param(
  [ValidateSet('local', 'docker')][string]$Mode = 'local',
  [int]$KeepDays = 14
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$BackupDir = Join-Path $Root 'backups'
New-Item -ItemType Directory -Force $BackupDir | Out-Null
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Log([string]$Message) {
  Add-Content -Path (Join-Path $LogDir 'backup.log') -Value ('{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message)
}

$target = Join-Path $BackupDir ('sheep_portal_{0:yyyy-MM-dd_HHmm}.dump' -f (Get-Date))

try {
  if ($Mode -eq 'docker') {
    & docker compose exec -T db pg_dump -U sheep -Fc -f /tmp/backup.dump sheep_portal
    if ($LASTEXITCODE -ne 0) { throw "pg_dump in the db container failed (exit $LASTEXITCODE)." }
    & docker compose cp db:/tmp/backup.dump $target
    if ($LASTEXITCODE -ne 0) { throw "Copying the backup out of the container failed (exit $LASTEXITCODE)." }
    & docker compose exec -T db rm -f /tmp/backup.dump
  } else {
    $url = $env:DATABASE_URL
    if (-not $url -and (Test-Path .env)) {
      $m = Select-String -Path .env -Pattern '^\s*DATABASE_URL\s*=\s*(.*)$' | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Groups[1].Value.Trim().Trim('"', "'") }
    }
    if (-not $url) { throw 'DATABASE_URL was not found in the environment or .env.' }
    $u = [Uri]$url

    $pgDump = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
    if (-not $pgDump) {
      $base = Join-Path $env:ProgramFiles 'PostgreSQL'
      if (Test-Path $base) {
        $pgDump = Get-ChildItem $base -Directory | Sort-Object { [double]($_.Name -replace '[^\d.]', '') } -Descending |
          ForEach-Object { Join-Path $_.FullName 'bin\pg_dump.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
      }
    }
    if (-not $pgDump) { throw 'pg_dump.exe was not found. Install the PostgreSQL command line tools.' }

    $creds = $u.UserInfo -split ':', 2
    $env:PGPASSWORD = [Uri]::UnescapeDataString($creds[1])
    $port = if ($u.Port -gt 0) { $u.Port } else { 5432 }
    & $pgDump -h $u.Host -p $port -U ([Uri]::UnescapeDataString($creds[0])) -Fc -f $target $u.AbsolutePath.TrimStart('/')
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)." }
  }

  if (-not (Test-Path $target) -or (Get-Item $target).Length -eq 0) { throw 'The backup file is missing or empty.' }
  Log ("Backup written: $target ({0:N0} KB)" -f ((Get-Item $target).Length / 1KB))
  Get-ChildItem $BackupDir -Filter 'sheep_portal_*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
} catch {
  if (Test-Path $target) { Remove-Item $target -Force -ErrorAction SilentlyContinue }
  Log "Backup FAILED: $($_.Exception.Message)"
  exit 1
}
