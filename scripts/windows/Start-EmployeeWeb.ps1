#Requires -Version 5.1
param([int]$Port=58495,[string]$ApiUrl='http://127.0.0.1:58494')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if($ApiUrl -notmatch '^http://127\.0\.0\.1:\d+$'){throw 'Use a loopback CRS API address'}
if($Port -lt 1024 -or $Port -gt 65535){throw 'Invalid Web port'}
Invoke-WebRequest -Uri ($ApiUrl+'/ready') -UseBasicParsing -TimeoutSec 3 | Out-Null
if(-not(Test-Path -LiteralPath (Join-Path $repo 'web\dist\index.html'))){throw 'Run npm run build in web first'}
$env:CRS_API_PROXY=$ApiUrl
Push-Location (Join-Path $repo 'web')
try {
    Write-Output ("Employee Web: http://127.0.0.1:"+$Port+'/?mode=employee')
    & npm.cmd exec -- vite preview --host 127.0.0.1 --port $Port --strictPort
} finally {Pop-Location}
