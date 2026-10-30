#Requires -Version 5.1
param([string]$Python = 'python')
. (Join-Path $PSScriptRoot 'Common.ps1')
$root = Get-AppRoot
Test-ReleaseIntegrity $root
$venv = Join-Path $root '.venv'
if (-not (Test-Path -LiteralPath (Join-Path $root 'backend/requirements.lock.txt'))) { throw 'Release dependency lock is missing' }
& $Python -c "import sys; assert sys.version_info[:2] == (3,12), 'Python 3.12 required'"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 required' }
& $Python -m venv $venv
if ($LASTEXITCODE -ne 0) { throw 'Cannot create runtime environment' }
$runtime = Join-Path $venv 'Scripts/python.exe'
& $runtime -m pip install -r (Join-Path $root 'backend/requirements.lock.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
Write-Output 'Runtime installed. Configure a private JSON file, migrate and create the first admin.'
