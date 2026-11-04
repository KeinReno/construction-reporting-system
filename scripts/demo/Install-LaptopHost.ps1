#Requires -Version 5.1
<#
.SYNOPSIS
One-time setup of a NEW, isolated CRS laptop host. Prompts for the admin password.
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/demo/Install-LaptopHost.ps1 -DataRoot C:\CRS-Laptop
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$DataRoot,
  [ValidateRange(1024,65535)][int]$Port=58494,
  [string]$AdminLogin='crs-admin',
  [string]$Python='python'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not [IO.Path]::IsPathRooted($DataRoot)){throw 'DataRoot must be an absolute path outside the repository'}
$target=[IO.Path]::GetFullPath($DataRoot).TrimEnd('\','/')
if(Test-Path -LiteralPath $target){throw 'Target already exists; existing data will not be changed'}
if($target.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'DataRoot must be outside the repository'}
$npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
if(-not $npm){throw 'Node.js/npm is required for the one-time Web build'}
$ssh=Get-Command ssh.exe -ErrorAction SilentlyContinue
$keygen=Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue
if(-not $ssh -or -not $keygen){throw 'Windows OpenSSH client and ssh-keygen are required for Android HTTPS access'}

Push-Location (Join-Path $repo 'web')
try {
  & $npm.Source ci
  if($LASTEXITCODE -ne 0){throw 'npm ci failed'}
  & $npm.Source run build
  if($LASTEXITCODE -ne 0){throw 'Web build failed'}
} finally {Pop-Location}

& (Join-Path $PSScriptRoot 'Prepare-LaptopDemo.ps1') -DataRoot $target -Port $Port -AdminLogin $AdminLogin -Python $Python
if($LASTEXITCODE -ne 0){throw 'Runtime preparation failed'}
$key=Join-Path $target 'gateway_ed25519'
& $keygen.Source -q -t ed25519 -N '""' -f $key
if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $key)){throw 'Dedicated gateway key generation failed'}

$start=Join-Path $repo 'scripts\windows\Start-LocalPreview.ps1'
$stop=Join-Path $repo 'scripts\windows\Stop-LocalPreview.ps1'
$runPs='$cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot ''config.json'') -Raw -Encoding UTF8 | ConvertFrom-Json'+"`r`n"+'& (Join-Path $cfg.code_root ''scripts\windows\Start-LocalPreview.ps1'') -DataRoot $PSScriptRoot'+"`r`n"
$stopPs=@'
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
& (Join-Path $cfg.code_root 'scripts\windows\Stop-LocalPreview.ps1') -DataRoot $PSScriptRoot
$stateFile=Join-Path $PSScriptRoot 'running.json'
for($i=0;$i -lt 60;$i++) {
  if(-not(Test-Path -LiteralPath $stateFile)){break}
  $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if($state.status -eq 'stopped' -or -not(Get-Process -Id $state.pid -ErrorAction SilentlyContinue)){break}
  Start-Sleep -Milliseconds 500
}
if((Test-Path -LiteralPath $stateFile) -and ((Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json).status -ne 'stopped')) {
  throw 'CRS did not stop within 30 seconds; inspect private logs before restarting'
}
Write-Host 'CRS has stopped.'
'@
$runCmd='@echo off'+"`r`n"+'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-CRS.ps1"'+"`r`n"+'pause'+"`r`n"
$stopCmd='@echo off'+"`r`n"+'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP-CRS.ps1"'+"`r`n"+'pause'+"`r`n"
[IO.File]::WriteAllText((Join-Path $target 'START-CRS.ps1'),$runPs,[Text.Encoding]::UTF8)
[IO.File]::WriteAllText((Join-Path $target 'STOP-CRS.ps1'),$stopPs,[Text.Encoding]::UTF8)
[IO.File]::WriteAllText((Join-Path $target 'START-CRS.cmd'),$runCmd,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $target 'STOP-CRS.cmd'),$stopCmd,[Text.Encoding]::ASCII)
$instructions=@"
CRS LAPTOP HOST — NEW, EMPTY, ISOLATED DATABASE

1. Start locally first:
   powershell -NoProfile -ExecutionPolicy Bypass -File "$start" -DataRoot "$target" -LocalOnly
2. Open http://127.0.0.1:$Port/ and sign in as $AdminLogin with the password you just entered.
3. In Web > Management, create a test object, manager and foreman accounts; assign both to that object.
4. Stop the local server:
   powershell -NoProfile -ExecutionPolicy Bypass -File "$stop" -DataRoot "$target"
5. Double-click START-CRS.cmd. Read the current public HTTPS URL in ССЫЛКА.txt.
6. On a NEW standard Android install (not the offline demo), enter HTTPS URL + /api/v1,
   then the foreman login and password. The endpoint is bound after login; keep this gateway key.
7. Open the same HTTPS URL in desktop and mobile Web, sign in as manager, send a test report
   on Android, refresh both Web windows and compare the same report ID and receipt.

STOP-CRS.cmd stops the server and tunnel. Closing a browser tab does not stop them.
Never publish this directory: it contains the database, gateway key and future attachments.
The HTTPS tunnel passes traffic through srv.us; verify availability on the physical phone.
Keep this code checkout in place: the runtime points to it. This pilot is not a 24/7 server.
"@
[IO.File]::WriteAllText((Join-Path $target 'START-HERE.txt'),$instructions,[Text.Encoding]::UTF8)
Write-Host ('INSTALL READY: '+$target)
Write-Host ('Next: open '+(Join-Path $target 'START-HERE.txt'))
Write-Warning 'No customer data imported. Android/HTTPS and physical phone delivery are not yet verified.'
