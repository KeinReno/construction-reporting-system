#Requires -Version 5.1
param([string]$DataRoot='B:\CRS-runtime',[switch]$LocalOnly,[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python=Join-Path $repo '.venv\Scripts\python.exe'
$runner=Join-Path $PSScriptRoot 'local_preview.py'
$stateFile=Join-Path $DataRoot 'running.json'
if (-not (Test-Path -LiteralPath (Join-Path $DataRoot 'config.json'))) {throw 'Private runtime has not been prepared'}
function Test-Ready([string]$url) {
    if (-not $url) {return $false}
    try {
        $health=Invoke-WebRequest -Uri ($url.TrimEnd('/')+'/ready') -UseBasicParsing -TimeoutSec 4
        return $health.StatusCode -eq 200
    } catch {return $false}
}
$existing=$null
if (Test-Path -LiteralPath $stateFile) {
    $existing=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existing.status -ne 'stopped' -and (Get-Process -Id $existing.pid -ErrorAction SilentlyContinue)) {
        if (-not (Test-Ready $existing.local_url)) {throw ('CRS process exists but API /ready failed. Use STOP-CRS.cmd, then START-CRS.cmd; inspect '+$DataRoot)}
        if ($LocalOnly) {
            Write-Output ('Local: '+$existing.local_url)
            if (-not $NoBrowser) {Start-Process $existing.local_url}
            exit 0
        }
        if ($existing.public_url -and (Test-Ready $existing.public_url)) {
            Write-Output ('Local: '+$existing.local_url)
            Write-Output ('Phone: '+$existing.public_url)
            if (-not $NoBrowser) {Start-Process $existing.public_url}
            exit 0
        }
        Write-Output 'API is ready; waiting for verified phone HTTPS...'
    } else {
        Remove-Item -LiteralPath $stateFile
        $existing=$null
    }
}
$alreadyRunning=$null -ne $existing
if (-not $alreadyRunning) {
    $arguments=@(('"'+$runner+'"'),'--root',('"'+$DataRoot+'"'))
    if ($LocalOnly) {$arguments+='--local-only'}
    Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataRoot 'server.stdout.log') -RedirectStandardError (Join-Path $DataRoot 'server.stderr.log') | Out-Null
}
$ready=$false
for($attempt=0;$attempt -lt 60;$attempt++) {
    Start-Sleep -Milliseconds 500
    if(Test-Path -LiteralPath $stateFile) {
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($state.status -eq 'stopped') {break}
        if(Test-Ready $state.local_url) {$ready=$true;break}
    }
}
if(-not $ready) {throw ('Cannot start CRS. See private logs in '+$DataRoot)}
Write-Output ('Local: '+$state.local_url)
if($LocalOnly) {
    if(-not $NoBrowser){Start-Process $state.local_url}
} else {
    $phoneReady=$false
    for($attempt=0;$attempt -lt 60;$attempt++) {
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($state.public_url -and (Test-Ready $state.public_url)){$phoneReady=$true;break}
        if($state.status -eq 'stopped') {break}
        Start-Sleep -Seconds 1
    }
    if(-not $phoneReady) {throw ('Phone HTTPS /ready not verified. Keep the laptop online and rerun START-CRS.cmd. Inspect '+(Join-Path $DataRoot 'gateway.log'))}
    Write-Output ('Phone: '+$state.public_url)
    if(-not $NoBrowser){Start-Process $state.public_url}
}
