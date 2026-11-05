#Requires -Version 5.1
<#
.SYNOPSIS
Non-destructive laptop + HTTPS CRS preflight. Creates normal auth sessions ONLY when -WithAuth.
Does NOT create/submit/edit/review reports, alter finance, or upload files.
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/demo/Test-LiveDemo.ps1 -HttpsBase https://YOUR-TUNNEL
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/demo/Test-LiveDemo.ps1 -HttpsBase https://YOUR-TUNNEL -WithAuth
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$HttpsBase,
  [string]$LocalBase='http://127.0.0.1:58494',
  [switch]$WithAuth
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

function Origin([string]$inputValue,[string]$expectedScheme) {
  $u=$null
  if(-not [Uri]::TryCreate($inputValue,[UriKind]::Absolute,[ref]$u)) {throw 'URL must be absolute'}
  if($u.Scheme -ne $expectedScheme -or -not $u.Host -or $u.UserInfo -or $u.Query -or $u.Fragment -or $u.AbsolutePath -notin @('/','')) {
    throw ('Expected only '+$expectedScheme+'://hostname[:port], without path, login, or parameters')
  }
  return $u.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
}
function Get-Json([string]$url,[string]$token='') {
  $headers=@{ 'Accept'='application/json'; 'X-Report-Capabilities'='report-extras-v2' }
  if($token){$headers['Authorization']='Bearer '+$token}
  return Invoke-RestMethod -Uri $url -Method GET -Headers $headers -TimeoutSec 15
}
function Login([string]$base,[string]$role) {
  $cred=Get-Credential -Message ('Credentials for '+$role+' (not logged)')
  if($null -eq $cred){throw 'Authentication was cancelled'}
  $pw=$cred.GetNetworkCredential().Password
  try {
    $payload=@{login=$cred.UserName;password=$pw}|ConvertTo-Json -Compress
    return (Invoke-RestMethod -Uri ($base+'/api/v1/auth/login') -Method POST -ContentType 'application/json' -Body $payload -TimeoutSec 15).access_token
  } finally { $pw=$null;$cred=$null }
}
$local=Origin $LocalBase 'http'
$remote=Origin $HttpsBase 'https'
Write-Host 'CRS connection preflight (no report writes)'
Write-Host ('Local endpoint: '+$local)
Write-Host ('HTTPS endpoint: '+$remote)
Write-Host ('Android base URL: '+$remote+'/api/v1')
Write-Host 'Checking local /ready...'
$localReady=Get-Json ($local+'/ready')
if($localReady.status -ne 'ready'){throw 'Local /ready did not report ready'}
Write-Host '[PASS] local ready'
Write-Host 'Checking public HTTPS /ready (TLS validated by Windows)...'
$publicReady=Get-Json ($remote+'/ready')
if($publicReady.status -ne 'ready'){throw 'HTTPS /ready did not report ready'}
Write-Host '[PASS] HTTPS ready'
# Verify that unauthenticated API is protected. Expected HTTP 401.
try {
  $null=Get-Json ($remote+'/api/v1/me')
  throw 'SECURITY: unauthenticated /me succeeded'
} catch {
  if($_.Exception.Message -eq 'SECURITY: unauthenticated /me succeeded'){throw}
  $response=$_.Exception.Response
  if($null -eq $response -or [int]$response.StatusCode -ne 401){throw 'Unauthenticated /me must yield HTTP 401'}
}
Write-Host '[PASS] unauthenticated /me = HTTP 401'
# Verify that actual webpage is served from same origin.
$page=Invoke-WebRequest -Uri ($local+'/') -UseBasicParsing -TimeoutSec 15
if($page.StatusCode -ne 200 -or $page.Content -notmatch '<html'){throw 'Local Web root is missing'}
Write-Host '[PASS] laptop Web root = 200'
if($WithAuth){
  Write-Host 'Next steps create ordinary auth sessions; they do not create reports.'
  $manager=Login $remote 'manager'
  if(-not $manager){throw 'No manager token'}
  $managerProfile=Get-Json ($remote+'/api/v1/me') $manager
  if($managerProfile.role -notin @('manager','admin')){throw 'First credential must have manager/admin role'}
  $managerSites=@(Get-Json ($remote+'/api/v1/sites') $manager)
  Write-Host ('[PASS] manager access to '+$managerSites.Count+' site(s)')
  $foreman=Login $remote 'foreman'
  if(-not $foreman){throw 'No foreman token'}
  $foremanProfile=Get-Json ($remote+'/api/v1/me') $foreman
  if($foremanProfile.role -ne 'foreman'){throw 'Second credential must have foreman role'}
  $foremanSites=@(Get-Json ($remote+'/api/v1/sites') $foreman)
  $ids=@{}
  foreach($s in $managerSites){$ids[[string]$s.id]=$true}
  $shared=@($foremanSites | Where-Object { $ids.ContainsKey([string]$_.id) })
  if(-not $shared.Count){throw 'No common assigned object between manager and foreman'}
  Write-Host ('[PASS] foreman sees '+$foremanSites.Count+' site(s); common assigned sites: '+$shared.Count)
  $items=@(Get-Json ($remote+'/api/v1/reports?page=1&page_size=5') $manager)
  Write-Host ('[PASS] report list read, first page contains '+$items.Count+' record(s)')
  $manager='';$foreman=''
}
Write-Host 'RESULT: Laptop HTTP + public HTTPS preflight PASSED.'
Write-Warning 'NOT CHECKED: physical Android login, mobile-network reachability, actual submission/receipt, photo upload, independent mobile Web, and persistence after reboot. Run manual E2E before presentation.'
