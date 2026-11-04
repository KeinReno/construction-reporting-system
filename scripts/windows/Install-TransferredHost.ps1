#Requires -Version 5.1
<#
.SYNOPSIS
Install a private, already provisioned CRS runtime on a Windows laptop.
.DESCRIPTION
The transfer folder is created offline on the source PC. It contains real data and
must never be committed or shared through a public artifact. The destination must
not exist. This script does not change the source PC or transfer folder.
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\windows\Install-TransferredHost.ps1 -TransferRoot E:\CRS-live-transfer -DataRoot C:\CRS-Live
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$TransferRoot,
  [Parameter(Mandatory=$true)][string]$DataRoot,
  [ValidateRange(1024,65535)][int]$Port=58494,
  [string]$Python='python'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
if(-not [IO.Path]::IsPathRooted($TransferRoot) -or -not [IO.Path]::IsPathRooted($DataRoot)){throw 'Use absolute TransferRoot and DataRoot paths'}
$source=[IO.Path]::GetFullPath($TransferRoot).TrimEnd('\')
$target=[IO.Path]::GetFullPath($DataRoot).TrimEnd('\')
if(-not(Test-Path -LiteralPath $source -PathType Container)){throw 'Transfer folder does not exist'}
if(Test-Path -LiteralPath $target){throw 'Target already exists; no existing data will be changed'}
if($target.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase) -or
   $target.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase) -or
   $source.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'DataRoot must be separate from source and repository'}
$manifestFile=Join-Path $source 'runtime-manifest.json'
if(-not(Test-Path -LiteralPath $manifestFile)){throw 'Private runtime manifest missing'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if($manifest.version -ne 1 -or -not $manifest.files){throw 'Invalid transfer manifest'}
$runtimeSource=Join-Path $source 'runtime'
$known=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($entry in $manifest.files.PSObject.Properties){[void]$known.Add([string]$entry.Name)}
foreach($part in @('data','web')){
  foreach($item in (Get-ChildItem -LiteralPath (Join-Path $runtimeSource $part) -Recurse -Force)){
    if($item.LinkType){throw ('Linked transfer item: '+$item.FullName)}
    if(-not $item.PSIsContainer){
      $relative=$item.FullName.Substring($runtimeSource.Length+1).Replace('\','/')
      if(-not $known.Contains($relative)){throw ('Unverified transfer file: '+$relative)}
    }
  }
}
foreach($entry in $manifest.files.PSObject.Properties){
  $relative=[string]$entry.Name
  if($relative -notmatch '^(data/(crs\.db|uploads/[a-zA-Z0-9_.-]+)|web/[a-zA-Z0-9_./-]+)$' -or $relative.Contains('..')){throw 'Invalid manifest path'}
  $file=Join-Path $runtimeSource ($relative.Replace('/','\'))
  if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing transfer file: $relative"}
  if((Get-Item -LiteralPath $file).LinkType){throw "Linked transfer file: $relative"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne [string]$entry.Value){throw "Transfer checksum mismatch: $relative"}
}
& $Python -c "import sys;assert sys.version_info[:2] == (3,12),'Python 3.12 required'"
if($LASTEXITCODE -ne 0){throw 'Python 3.12 required'}
$ssh=Get-Command ssh.exe -ErrorAction SilentlyContinue
$keygen=Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue
if(-not $ssh -or -not $keygen){throw 'Windows OpenSSH client is required for phone HTTPS access'}
$venv=Join-Path $repo '.venv'
if(-not(Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe'))){
  & $Python -m venv $venv
  if($LASTEXITCODE -ne 0){throw 'Python environment creation failed'}
}
$runtimePython=Join-Path $venv 'Scripts\python.exe'
& $runtimePython -m pip install -r (Join-Path $repo 'backend\requirements.lock.txt')
if($LASTEXITCODE -ne 0){throw 'Backend dependency installation failed'}
[IO.Directory]::CreateDirectory($target)|Out-Null
Copy-Item -LiteralPath (Join-Path $runtimeSource 'data') -Destination (Join-Path $target 'data') -Recurse
Copy-Item -LiteralPath (Join-Path $runtimeSource 'web') -Destination (Join-Path $target 'web') -Recurse
foreach($entry in $manifest.files.PSObject.Properties){
  $file=Join-Path $target ([string]$entry.Name).Replace('/','\')
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne [string]$entry.Value){throw "Installed checksum mismatch: $($entry.Name)"}
}
$db=Join-Path $target 'data\crs.db'
& $runtimePython -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); assert c.execute('pragma integrity_check').fetchone()[0]=='ok'; print('Database integrity: OK')" $db
if($LASTEXITCODE -ne 0){throw 'Database integrity check failed'}
$cfg=@{
  code_root=$repo
  database_url=('sqlite:///'+$db.Replace('\','/'))
  uploads=(Join-Path $target 'data\uploads')
  web_dir=(Join-Path $target 'web')
  port=$Port
  gateway='srv.us'
}
$cfg|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $target 'config.json') -Encoding UTF8
& $keygen.Source -q -t ed25519 -N '""' -f (Join-Path $target 'gateway_ed25519')
if($LASTEXITCODE -ne 0){throw 'Gateway key generation failed'}
$startPs=@'
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8|ConvertFrom-Json
& (Join-Path $cfg.code_root 'scripts\windows\Start-LocalPreview.ps1') -DataRoot $PSScriptRoot
'@
$stopPs=@'
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8|ConvertFrom-Json
& (Join-Path $cfg.code_root 'scripts\windows\Stop-LocalPreview.ps1') -DataRoot $PSScriptRoot
'@
[IO.File]::WriteAllText((Join-Path $target 'START-CRS.ps1'),$startPs,[Text.Encoding]::UTF8)
[IO.File]::WriteAllText((Join-Path $target 'STOP-CRS.ps1'),$stopPs,[Text.Encoding]::UTF8)
[IO.File]::WriteAllText((Join-Path $target 'START-CRS.cmd'),"@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0START-CRS.ps1`"`r`npause`r`n",[Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $target 'STOP-CRS.cmd'),"@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0STOP-CRS.ps1`"`r`npause`r`n",[Text.Encoding]::ASCII)
$info=@"
CRS — рабочая копия с отчётами и фотографиями

1. Запустите START-CRS.cmd и дождитесь адреса HTTPS в ССЫЛКА.txt.
2. Откройте этот адрес на ноутбуке и во втором мобильном браузере. Вход руководителя: Andrey.
3. В Android укажите тот же HTTPS-адрес с /api/v1 и войдите как Ispolnitel.
4. Отправьте новый отчёт с телефона, проверьте квитанцию и тот же отчёт в обоих браузерах.
5. STOP-CRS.cmd останавливает сервер и туннель. Оставьте ноутбук включённым во время показа.

Локальный адрес: http://127.0.0.1:$Port/
Пароли переданы владельцем проекта отдельно. Не храните их в этом каталоге.
Здесь находятся реальные отчёты и фотографии. Храните каталог и переносной носитель приватно.
Кодовая папка $repo должна оставаться на месте.
Публичный HTTPS зависит от связи ноутбука и шлюза srv.us; проверьте его с физического телефона.
"@
[IO.File]::WriteAllText((Join-Path $target 'START-HERE.txt'),$info,[Text.Encoding]::UTF8)
Write-Host ('INSTALL READY: '+$target)
Write-Host ('Reports: '+$manifest.counts.reports+'; photo links: '+$manifest.counts.photos+'; media files: '+$manifest.counts.upload_files)
Write-Warning 'Physical Android-to-laptop delivery must still be tested.'
