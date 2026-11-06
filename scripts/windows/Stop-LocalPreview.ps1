#Requires -Version 5.1
param([string]$DataRoot='B:\CRS-runtime')
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath (Join-Path $DataRoot 'config.json'))){throw 'Private runtime has not been prepared'}
[IO.File]::WriteAllText((Join-Path $DataRoot 'stop.request'),'stop')
Write-Output 'CRS stop requested. The launcher will close its API and tunnel.'
