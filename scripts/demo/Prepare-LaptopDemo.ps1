#Requires -Version 5.1
<#
.SYNOPSIS
Prepare a NEW isolated SQLite laptop rehearsal runtime from current CRS source.
Never imports customer DB, never overwrites existing runtime, never opens inbound ports.
Web must be built separately; installs only Python backend dependencies.
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/demo/Prepare-LaptopDemo.ps1 -DataRoot C:\CRS-Laptop-Demo
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$DataRoot,
  [ValidateRange(1024,65535)][int]$Port=58494,
  [string]$AdminLogin='demo-admin',
  [string]$Python='python'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not [IO.Path]::IsPathRooted($DataRoot)){throw 'Use an absolute private DataRoot path'}
$target=[IO.Path]::GetFullPath($DataRoot).TrimEnd('\','/')
if(Test-Path -LiteralPath $target){throw 'Target already exists; refusing to modify an existing runtime'}
if($target.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Private runtime cannot be inside repository'}
if($AdminLogin -notmatch '^[a-zA-Z0-9_-]{4,48}$'){throw 'Admin login must be 4-48 safe characters'}
$webDist=Join-Path $repo 'web\dist'
if(-not(Test-Path -LiteralPath (Join-Path $webDist 'index.html'))){throw 'Build current Web first: cd web; npm ci; npm run build'}
& $Python -c "import sys;assert sys.version_info[:2] == (3,12),'Python 3.12 required'"
if($LASTEXITCODE -ne 0){throw 'Python 3.12 required'}
$venv=Join-Path $repo '.venv'
if(-not(Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe'))){
  & $Python -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Failed to create Python venv'}
}
$runtime=Join-Path $venv 'Scripts\python.exe'
& $runtime -m pip install -r (Join-Path $repo 'backend\requirements.lock.txt')
if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
[IO.Directory]::CreateDirectory($target)|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $target 'data'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $target 'data\uploads'))|Out-Null
Copy-Item -LiteralPath $webDist -Destination (Join-Path $target 'web') -Recurse
$dbFile=Join-Path $target 'data\crs-demo.db'
$dbUrl='sqlite:///'+$dbFile.Replace('\','/')
$cfg=@{
  code_root=$repo
  database_url=$dbUrl
  uploads=(Join-Path $target 'data\uploads')
  web_dir=(Join-Path $target 'web')
  port=$Port
  gateway='srv.us'
}
$cfg|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $target 'config.json') -Encoding UTF8
$oldDb=$env:DATABASE_URL
$oldUploads=$env:UPLOAD_DIR
$oldWeb=$env:WEB_DIR
$oldAuto=$env:AUTO_CREATE_SCHEMA
Push-Location (Join-Path $repo 'backend')
try {
  $env:DATABASE_URL=$dbUrl
  $env:UPLOAD_DIR=Join-Path $target 'data\uploads'
  $env:WEB_DIR=Join-Path $target 'web'
  $env:AUTO_CREATE_SCHEMA='0'
  & $runtime -m alembic upgrade head
  if($LASTEXITCODE -ne 0){throw 'Database migration failed; inspect the output before continuing'}
  Write-Host 'Create the PRIVATE administrator password interactively (minimum 12 characters).'
  & $runtime -m app.cli create-admin $AdminLogin
  if($LASTEXITCODE -ne 0){throw 'Admin creation failed'}
} finally {
  Pop-Location
  $env:DATABASE_URL=$oldDb
  $env:UPLOAD_DIR=$oldUploads
  $env:WEB_DIR=$oldWeb
  $env:AUTO_CREATE_SCHEMA=$oldAuto
}
# URL and password are NOT written to the public repository or to a debug artifact.
$info=@'
ISOLATED CRS LAPTOP DEMO
This new folder contains only a blank demo database and a copy of built Web.
Local launch:
powershell -ExecutionPolicy Bypass -File scripts/windows/Start-LocalPreview.ps1 -DataRoot "<THIS-DIRECTORY>" -LocalOnly
For Android live HTTPS: arrange an authorized working srv.us tunnel and place ONLY its
dedicated gateway_ed25519 private key inside this private runtime, then launch WITHOUT -LocalOnly.
Android address: https://<confirmed-public-host>/api/v1
First log in to Web as admin; create manager/foreman accounts and a test object and grant access.
A demo APK cannot submit to this server; use the standard debug/release APK.
NEVER add this folder to GitHub, email or an unencrypted archive.
'@
$info.Replace('<THIS-DIRECTORY>',$target) | Set-Content -LiteralPath (Join-Path $target 'README-FIRST.txt') -Encoding UTF8
Write-Host ('READY: isolated SQLite runtime prepared at '+$target)
Write-Host ('Local URL: http://127.0.0.1:'+$Port+'/')
Write-Warning 'This does NOT create HTTPS or prove phone connectivity. Manager, foreman and assignments must be created before E2E.'
