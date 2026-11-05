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
function Get-ReleaseHash([string]$Path) {
    $algorithm=[Security.Cryptography.SHA256]::Create()
    $stream=[IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose();$algorithm.Dispose() }
}
function Test-ReleaseIntegrity([string]$Root) {
    $manifestPath=Join-Path $Root 'release-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Use a packaged release with release-manifest.json' }
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.format_version -ne 1) { throw 'Unsupported release manifest' }
    $base=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')+'\'
    foreach($entry in $manifest.sha256.PSObject.Properties) {
        $path=[IO.Path]::GetFullPath((Join-Path $Root $entry.Name))
        if (-not $path.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or $entry.Value -notmatch '^[0-9a-f]{64}$') { throw 'Invalid release manifest entry' }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-ReleaseHash $path) -ne $entry.Value) { throw 'Release checksum mismatch' }
    }
}
