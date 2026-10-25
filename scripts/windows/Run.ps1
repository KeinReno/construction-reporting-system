#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$ConfigPath,[ValidateRange(1024,65535)][int]$Port=8000,[switch]$MigrateOnly,[switch]$ValidateOnly,[switch]$AllowSqliteForTests)
. (Join-Path $PSScriptRoot 'Common.ps1')
$settings=Read-AppSettings -ConfigPath $ConfigPath -AllowSqliteForTests:$AllowSqliteForTests
$runtime=Join-Path $settings.Root '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Run Install-Runtime.ps1 first' }
if (-not (Test-Path -LiteralPath (Join-Path $settings.WebDir 'index.html'))) { throw 'Built Web interface is missing' }
if ($ValidateOnly) { Write-Output 'Configuration valid (credentials hidden)'; exit 0 }
[IO.Directory]::CreateDirectory($settings.DataDir) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $settings.DataDir 'uploads')) | Out-Null
$hash=[Security.Cryptography.SHA256]::Create()
try { $key=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($settings.DataDir.ToLowerInvariant())))).Replace('-','') } finally { $hash.Dispose() }
$mutex=New-Object Threading.Mutex($false,('Global\ConstructionReporting-'+$key))
$owned=$false
$before=@{}
foreach($name in @('DATABASE_URL','UPLOAD_DIR','WEB_DIR','AUTO_CREATE_SCHEMA')) { $before[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$previous=Get-Location
try {
    $owned=$mutex.WaitOne(0)
    if (-not $owned) { throw 'Another server or maintenance process is using this data directory' }
    $env:DATABASE_URL=$settings.DatabaseUrl
    $env:UPLOAD_DIR=Join-Path $settings.DataDir 'uploads'
    $env:WEB_DIR=$settings.WebDir
    $env:AUTO_CREATE_SCHEMA='0'
    Set-Location -LiteralPath (Join-Path $settings.Root 'backend')
    & $runtime -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed; inspect private server logs' }
    if (-not $MigrateOnly) {
        # One worker: login limiter is process-local. Public traffic must pass through HTTPS proxy.
        & $runtime -m uvicorn app.main:app --host 127.0.0.1 --port $Port --workers 1 --no-proxy-headers
        if ($LASTEXITCODE -ne 0) { throw 'API process failed' }
    }
} finally {
    Set-Location -LiteralPath $previous.Path
    foreach($name in $before.Keys) { [Environment]::SetEnvironmentVariable($name,$before[$name],'Process') }
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
