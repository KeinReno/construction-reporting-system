#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Get-AppRoot { return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
function Read-AppSettings([string]$ConfigPath,[switch]$AllowSqliteForTests) {
    if (-not [IO.Path]::IsPathRooted($ConfigPath)) { throw 'ConfigPath must be absolute' }
    try { $cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { throw 'Cannot read configuration JSON' }
    if (-not $cfg.database_url -or -not $cfg.data_dir) { throw 'database_url and data_dir are required' }
    if (-not $AllowSqliteForTests -and -not $cfg.database_url.StartsWith('postgresql+psycopg://')) { throw 'Production requires explicit PostgreSQL DATABASE_URL' }
    if (-not [IO.Path]::IsPathRooted($cfg.data_dir)) { throw 'data_dir must be absolute' }
    $root = Get-AppRoot
    $data = [IO.Path]::GetFullPath($cfg.data_dir).TrimEnd('\','/')
    $web = [IO.Path]::GetFullPath((Join-Path $root 'web')).TrimEnd('\','/')
    if ($data.Equals($web,[StringComparison]::OrdinalIgnoreCase) -or $data.StartsWith($web+'\',[StringComparison]::OrdinalIgnoreCase) -or $web.StartsWith($data+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Private data and public Web directories must be separate' }
    $configFull=[IO.Path]::GetFullPath($ConfigPath)
    if ($configFull.StartsWith($web+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Private configuration must not be in public Web directory' }
    return @{ Root=$root; DatabaseUrl=[string]$cfg.database_url; DataDir=$data; WebDir=$web }
}
