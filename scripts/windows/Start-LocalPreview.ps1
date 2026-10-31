#Requires -Version 5.1
param([string]$DataRoot='B:\CRS-runtime',[switch]$LocalOnly,[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python=Join-Path $repo '.venv\Scripts\python.exe'
$runner=Join-Path $PSScriptRoot 'local_preview.py'
$stateFile=Join-Path $DataRoot 'running.json'
if (-not (Test-Path -LiteralPath (Join-Path $DataRoot 'config.json'))) {throw 'Private runtime has not been prepared'}
if (Test-Path -LiteralPath $stateFile) {
    $existing=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existing.status -ne 'stopped' -and (Get-Process -Id $existing.pid -ErrorAction SilentlyContinue)) {
        Write-Output ('Local: '+$existing.local_url)
        if ($existing.public_url) {Write-Output ('Phone: '+$existing.public_url)}
        if (-not $NoBrowser) {Start-Process $existing.local_url}
        exit 0
    }
    Remove-Item -LiteralPath $stateFile
}
$arguments=@(('"'+$runner+'"'),'--root',('"'+$DataRoot+'"'))
if ($LocalOnly) {$arguments+='--local-only'}
Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataRoot 'server.stdout.log') -RedirectStandardError (Join-Path $DataRoot 'server.stderr.log') | Out-Null
$ready=$false
for($attempt=0;$attempt -lt 60;$attempt++) {
    Start-Sleep -Milliseconds 500
    if(Test-Path -LiteralPath $stateFile) {
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($state.status -eq 'stopped') {break}
        try {
            $health=Invoke-WebRequest -Uri ($state.local_url+'/ready') -UseBasicParsing -TimeoutSec 1
            if($health.StatusCode -eq 200) {$ready=$true;break}
        } catch { }
    }
}
if(-not $ready) {throw ('Cannot start CRS. See private logs in '+$DataRoot)}
Write-Output ('Local: '+$state.local_url)
if(-not $NoBrowser){Start-Process $state.local_url}
if(-not $LocalOnly) {
    for($attempt=0;$attempt -lt 50;$attempt++) {
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if($state.public_url){Write-Output ('Phone: '+$state.public_url);break}
        if($state.status -eq 'stopped') {break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $state.public_url) {Write-Output 'Local CRS is ready. The external gateway is reconnecting; check the link file later.'}
}
