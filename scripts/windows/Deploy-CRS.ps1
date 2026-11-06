#Requires -Version 5.1
<#
.SYNOPSIS
  Reproducible CRS build, staging check, backup, deploy and file-level rollback.
.DESCRIPTION
  Reads a private layout file that is not stored in Git. The layout points at
  source, tools, configs and directories. It must not be committed.

  Rollback switches the recorded previous release directory and restarts the
  API. It does not run alembic downgrade. If the current database revision is
  newer than the previous release can open, the script stops and tells the
  operator to restore a backup into a new database.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Preflight', 'Build', 'StagingCheck', 'Backup', 'Deploy', 'Rollback')]
    [string]$Action,
    [string]$LayoutPath = 'Q:\CRS\ops\layout.json',
    [string]$Notes = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-Layout {
    if (-not (Test-Path -LiteralPath $LayoutPath)) { throw "Layout file is missing: $LayoutPath" }
    $layout = Get-Content -LiteralPath $LayoutPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($name in @('source', 'python', 'node', 'pgBin', 'caddy', 'git', 'productionRoot', 'stagingRoot', 'productionConfig', 'stagingConfig', 'backupRoot', 'stateFile')) {
        if (-not $layout.$name) { throw "Layout is missing $name" }
    }
    return $layout
}

function Invoke-Native {
    param([string]$File, [string[]]$Arguments, [string]$WorkingDirectory)
    $previous = Get-Location
    try {
        if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit $LASTEXITCODE" }
    } finally {
        Set-Location -LiteralPath $previous.Path
    }
}

function Get-AlembicHead {
    param($Layout, [string]$Release)
    $runtime = Join-Path $Release '.venv\Scripts\python.exe'
    $output = & $runtime -m alembic heads 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Cannot read alembic head from $Release" }
    return (($output | Select-Object -Last 1) -replace '\s+\(head\)$', '').Trim()
}

function Stop-Listener {
    param([int]$Port)
    $lines = netstat -ano | findstr 'LISTENING' | findstr ":$Port "
    foreach ($line in $lines) {
        if ($line -notmatch ":$Port\s") { continue }
        $procId = [int](($line -split '\s+')[-1])
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

function Start-Api {
    param($Layout, [string]$Release, [string]$Config, [int]$Port, [string]$LogDir)
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Release 'scripts\windows\Run.ps1'),
        '-ConfigPath', $Config, '-Port', "$Port"
    )
    Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments `
        -WorkingDirectory (Join-Path $Release 'backend') `
        -RedirectStandardOutput (Join-Path $LogDir 'api.out.log') `
        -RedirectStandardError (Join-Path $LogDir 'api.err.log') `
        -WindowStyle Hidden | Out-Null
}

function Wait-Ready {
    param([int]$Port)
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/ready" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw "API on port $Port did not become ready"
}

function Read-State {
    param($Layout)
    if (-not (Test-Path -LiteralPath $Layout.stateFile)) { return @{ current = $null; previous = $null } }
    return Get-Content -LiteralPath $Layout.stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
}

$layout = Read-Layout
$env:Path = "$(Split-Path -Parent $layout.python);$($layout.node);$($layout.pgBin);$env:Path"
$env:CRS_PG_BIN_DIR = $layout.pgBin

switch ($Action) {
    'Preflight' {
        & $layout.python -c "import sys; assert sys.version_info[:2] == (3, 12), sys.version"
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required' }
        Invoke-Native -File (Join-Path $layout.node 'node.exe') -Arguments @('-v')
        Invoke-Native -File (Join-Path $layout.pgBin 'pg_isready.exe') -Arguments @('-h', '127.0.0.1', '-p', '5432')
        Invoke-Native -File (Join-Path $layout.pgBin 'pg_isready.exe') -Arguments @('-h', '127.0.0.1', '-p', '5433')
        foreach ($path in @($layout.source, $layout.productionConfig, $layout.stagingConfig, $layout.backupRoot)) {
            if (-not (Test-Path -LiteralPath $path)) { throw "Missing path $path" }
        }
        $listen = netstat -ano | findstr 'LISTENING' | findstr ':5432 '
        if ($listen -match '0\.0\.0\.0:5432|\[::\]:5432') { throw 'PostgreSQL is listening outside loopback' }
        Write-Output 'Preflight passed'
    }
    'Build' {
        $web = Join-Path $layout.source 'web'
        Invoke-Native -File (Join-Path $layout.node 'npm.cmd') -Arguments @('ci', '--no-audit', '--no-fund') -WorkingDirectory $web
        Invoke-Native -File (Join-Path $layout.node 'npx.cmd') -Arguments @('tsc', '-b', '--pretty', 'false') -WorkingDirectory $web
        Invoke-Native -File (Join-Path $layout.node 'npx.cmd') -Arguments @('vite', 'build') -WorkingDirectory $web
        $sha = (& $layout.git -C $layout.source rev-parse --short=12 HEAD).Trim()
        $package = Join-Path $layout.productionRoot "crs-$sha.zip"
        Invoke-Native -File $layout.python -Arguments @((Join-Path $layout.source 'scripts\package_release.py'), '--output', $package) -WorkingDirectory $layout.source
        Write-Output "Package $package"
    }
    'StagingCheck' {
        $sha = (& $layout.git -C $layout.source rev-parse --short=12 HEAD).Trim()
        $package = Join-Path $layout.productionRoot "crs-$sha.zip"
        if (-not (Test-Path -LiteralPath $package)) { throw "Build the package first: $package" }
        $dest = Join-Path $layout.stagingRoot $sha
        if (Test-Path -LiteralPath $dest) { throw "Staging directory already exists: $dest" }
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        tar.exe -xf $package -C $dest
        if ($LASTEXITCODE -ne 0) { throw 'Cannot extract staging package' }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'scripts\windows\Install-Runtime.ps1') -Python $layout.python
        if ($LASTEXITCODE -ne 0) { throw 'Staging runtime installation failed' }
        Stop-Listener -Port $layout.stagingPort
        Start-Api -Layout $layout -Release $dest -Config $layout.stagingConfig -Port $layout.stagingPort -LogDir (Split-Path -Parent $layout.stagingConfig)
        Wait-Ready -Port $layout.stagingPort
        Write-Output "Staging ready from $sha"
    }
    'Backup' {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $snapshot = Join-Path $layout.backupRoot $stamp
        if (Test-Path -LiteralPath $snapshot) { throw "Backup path already exists: $snapshot" }
        $config = Get-Content -LiteralPath $layout.productionConfig -Raw -Encoding UTF8 | ConvertFrom-Json
        $env:DATABASE_URL = [string]$config.database_url
        $env:UPLOAD_DIR = Join-Path ([string]$config.data_dir) 'uploads'
        Stop-Listener -Port $layout.productionPort
        try {
            $runtime = Join-Path (Read-State $layout).current '.venv\Scripts\python.exe'
            if (-not $runtime -or -not (Test-Path -LiteralPath $runtime)) { throw 'Current release is not recorded; backup from a deployed release' }
            Invoke-Native -File $runtime -Arguments @('-m', 'app.backup', 'backup', $snapshot, '--service-stopped') -WorkingDirectory (Join-Path (Read-State $layout).current 'backend')
            Invoke-Native -File $runtime -Arguments @('-m', 'app.backup', 'verify', $snapshot) -WorkingDirectory (Join-Path (Read-State $layout).current 'backend')
        } finally {
            Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
            Remove-Item Env:UPLOAD_DIR -ErrorAction SilentlyContinue
            $current = (Read-State $layout).current
            if ($current) { Start-Api -Layout $layout -Release $current -Config $layout.productionConfig -Port $layout.productionPort -LogDir (Split-Path -Parent $layout.productionConfig) }
        }
        Wait-Ready -Port $layout.productionPort
        Write-Output "Backup verified and production restarted: $snapshot"
    }
    'Deploy' {
        $sha = (& $layout.git -C $layout.source rev-parse --short=12 HEAD).Trim()
        $package = Join-Path $layout.productionRoot "crs-$sha.zip"
        if (-not (Test-Path -LiteralPath $package)) { throw "Build the package first: $package" }
        $dest = Join-Path $layout.productionRoot $sha
        if (-not (Test-Path -LiteralPath (Join-Path $dest 'release-manifest.json'))) {
            New-Item -ItemType Directory -Force -Path $dest | Out-Null
            tar.exe -xf $package -C $dest
            if ($LASTEXITCODE -ne 0) { throw 'Cannot extract production package' }
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest 'scripts\windows\Install-Runtime.ps1') -Python $layout.python
            if ($LASTEXITCODE -ne 0) { throw 'Production runtime installation failed' }
        }
        $state = Read-State $layout
        $record = @{ current = $dest; previous = $state.current; sha = $sha; deployedAt = (Get-Date).ToString('o'); notes = $Notes }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $layout.stateFile) | Out-Null
        Stop-Listener -Port $layout.productionPort
        Start-Api -Layout $layout -Release $dest -Config $layout.productionConfig -Port $layout.productionPort -LogDir (Split-Path -Parent $layout.productionConfig)
        try {
            Wait-Ready -Port $layout.productionPort
        } catch {
            ($record | ConvertTo-Json) | Set-Content -LiteralPath $layout.stateFile -Encoding UTF8
            throw
        }
        ($record | ConvertTo-Json) | Set-Content -LiteralPath $layout.stateFile -Encoding UTF8
        Write-Output "Deployed $sha"
    }
    'Rollback' {
        $state = Read-State $layout
        if (-not $state.previous) { throw 'No previous release is recorded' }
        if (-not (Test-Path -LiteralPath (Join-Path $state.previous 'release-manifest.json'))) { throw 'Previous release files are missing' }
        $currentHead = Get-AlembicHead -Layout $layout -Release $state.current
        $previousHead = Get-AlembicHead -Layout $layout -Release $state.previous
        if ($currentHead -ne $previousHead) {
            throw "Database rollback is not automatic: current release head $currentHead differs from previous head $previousHead. Restore a consistent backup into a new database and point the config at it. alembic downgrade was not run."
        }
        Stop-Listener -Port $layout.productionPort
        Start-Api -Layout $layout -Release $state.previous -Config $layout.productionConfig -Port $layout.productionPort -LogDir (Split-Path -Parent $layout.productionConfig)
        Wait-Ready -Port $layout.productionPort
        $record = @{ current = $state.previous; previous = $state.current; sha = 'rolled-back'; deployedAt = (Get-Date).ToString('o'); notes = 'file rollback; schema head matched' }
        ($record | ConvertTo-Json) | Set-Content -LiteralPath $layout.stateFile -Encoding UTF8
        Write-Output "Rolled back to $($state.previous)"
    }
}
