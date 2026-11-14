#Requires -Version 5.1
<#
  Phase 0 harness: proves templates/wedding_schema.sql (as frozen in
  database/0001_baseline.sql) actually runs on real PostgreSQL and that its
  security model holds.

  It spins up postgres:16 in Docker, installs a Supabase shim (roles, auth
  schema, auth.uid(), default privileges), applies the schema and the Phase 1
  migration, then runs the behavioural suites. Deleting the database between
  runs keeps it repeatable.

  Usage:
    powershell -ExecutionPolicy Bypass -File database/test/run.ps1
    powershell -ExecutionPolicy Bypass -File database/test/run.ps1 -Port 55433
    powershell -ExecutionPolicy Bypass -File database/test/run.ps1 -ShowAll

  Exit code 0 = every assertion passed.
#>
[CmdletBinding()]
param(
  [int]$Port = 55432,
  [string]$Container = 'wg-pg',
  [string]$Database = 'wedtest',
  [string]$Schema,
  [switch]$Reuse,
  [switch]$ShowAll
)

# Native tools write progress to stderr; PowerShell 5.1 would treat that as a
# terminating error. Every step below checks $LASTEXITCODE explicitly instead.
$ErrorActionPreference = 'Continue'

$testDir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $testDir)
if (-not $Schema) { $Schema = Join-Path $repoRoot 'database\0001_baseline.sql' }
if (-not (Test-Path $Schema)) { throw "Schema file not found: $Schema" }
$SaasSchema = Join-Path $repoRoot 'database\0002_saas.sql'
if (-not (Test-Path $SaasSchema)) { throw "Migration file not found: $SaasSchema" }

if ($Database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "Unsafe database name: $Database"
}

# ---------- locate tools ----------
$psql = $env:PSQL
if (-not $psql) {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) { $psql = $cmd.Source }
}
if (-not $psql) {
  $candidates = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending
  if ($candidates) { $psql = $candidates[0].FullName }
}
if (-not $psql -or -not (Test-Path $psql)) {
  throw 'psql not found. Install the PostgreSQL client or set $env:PSQL to psql.exe'
}

$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) { throw 'docker not found on PATH.' }

& $docker version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker daemon is not running.' }

# ---------- start postgres ----------
if (-not $Reuse) {
  & $docker rm -f $Container *> $null
  & $docker run -d --name $Container `
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres `
    -p "$($Port):5432" postgres:16 *> $null
  if ($LASTEXITCODE -ne 0) { throw "docker run failed for image postgres:16" }
}

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  & cmd /c "`"$docker`" exec $Container pg_isready -U postgres -d postgres >nul 2>&1"
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) {
  & cmd /c "`"$docker`" logs $Container --tail 30 2>&1"
  throw 'PostgreSQL did not become ready within 30s.'
}

# ---------- fresh database ----------
& cmd /c "`"$docker`" exec $Container psql -U postgres -d postgres -q -c `"drop database if exists $Database;`" -c `"create database $Database;`" >nul 2>&1"
if ($LASTEXITCODE -ne 0) { throw "Could not recreate database $Database" }

# ---------- run suites ----------
$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = 'postgres'
$env:PGCLIENTENCODING = 'UTF8'

$steps = @(
  @{ name = 'supabase shim';          file = Join-Path $testDir 'supabase-stub.sql' },
  @{ name = 'schema (fresh)';         file = $Schema },
  @{ name = 'saas migration';         file = $SaasSchema },
  @{ name = 'fixtures';               file = Join-Path $testDir 'phase0-setup.sql' },
  @{ name = 'guest RPCs as anon';     file = Join-Path $testDir 'phase0-anon.sql' },
  @{ name = 'RLS as two admins';      file = Join-Path $testDir 'phase0-auth.sql' },
  @{ name = 'grant surface';          file = Join-Path $testDir 'phase0-security.sql' },
  @{ name = 'drafts + ownership';     file = Join-Path $testDir 'phase1-saas.sql' },
  @{ name = 'schema (re-run)';        file = $Schema },
  @{ name = 'saas migration (re-run)';file = $SaasSchema },
  @{ name = 'grant surface (re-run)'; file = Join-Path $testDir 'phase0-security.sql' }
)

$passed = 0
$failed = 0
$failureStep = $null

try {
  foreach ($step in $steps) {
    if (-not (Test-Path $step.file)) { throw "Missing test file: $($step.file)" }

    Write-Host ''
    Write-Host "=== $($step.name) ===" -ForegroundColor Cyan

    # cmd /c keeps psql's stderr from becoming a PowerShell NativeCommandError
    $raw = & cmd /c "`"$psql`" -h localhost -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -q -f `"$($step.file)`" 2>&1"
    $code = $LASTEXITCODE

    foreach ($line in $raw) {
      $text = $line -replace '^.*?(ok:|note:|ASSERT FAILED|ERROR:|SECURITY:|FATAL)', '$1'
      $text = $text.Trim()
      if ($text -match '^ok:') { $passed++ }
      if ($text -match '^(ASSERT FAILED|ERROR:|SECURITY:|FATAL)') { $failed++ }
      if ($ShowAll -or $text -match '^(ok:|note:|ASSERT FAILED|ERROR:|SECURITY:|FATAL)') {
        Write-Host "  $text"
      }
    }

    if ($code -ne 0) {
      $failureStep = $step.name
      Write-Host "  -> exit=$code" -ForegroundColor Red
      break
    }
  }
}
finally {
  $env:PGPASSWORD = $previousPassword
}

Write-Host ''
Write-Host ("=== {0} passed, {1} failed ===" -f $passed, $failed)
if ($failureStep) {
  Write-Host "FAILED at: $failureStep" -ForegroundColor Red
  Write-Host "Container '$Container' left running for inspection." -ForegroundColor Yellow
  exit 1
}
if ($failed -gt 0) { exit 1 }

Write-Host 'ALL GREEN' -ForegroundColor Green
exit 0
