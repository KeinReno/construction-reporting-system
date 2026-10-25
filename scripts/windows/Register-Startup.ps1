#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$ConfigPath,[PSCredential]$Credential,[switch]$ValidateOnly)
. (Join-Path $PSScriptRoot 'Common.ps1')
$settings=Read-AppSettings -ConfigPath $ConfigPath
$run=Join-Path $PSScriptRoot 'Run.ps1'
if ($ConfigPath.Contains('"') -or $ConfigPath.Contains("`n") -or $ConfigPath.Contains("`r")) { throw 'Invalid configuration path' }
if (-not $ValidateOnly -and -not $Credential) { throw 'Supply a dedicated service account with -Credential (Get-Credential)' }
$user=if ($Credential) { $Credential.UserName } else { [Security.Principal.WindowsIdentity]::GetCurrent().Name }
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -File "'+$run+'" -ConfigPath "'+$ConfigPath+'"') -WorkingDirectory (Join-Path $settings.Root 'backend')
$trigger=New-ScheduledTaskTrigger -AtStartup
$options=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Password -RunLevel Limited
$task=New-ScheduledTask -Action $action -Trigger $trigger -Settings $options -Principal $principal
if ($ValidateOnly) { @{ Execute=$task.Actions[0].Execute; Arguments=$task.Actions[0].Arguments; Trigger=$task.Triggers[0].CimClass.CimClassName; RestartCount=$task.Settings.RestartCount; MultipleInstances=[string]$task.Settings.MultipleInstances } | ConvertTo-Json; exit 0 }
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credential.Password)
try {
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    Register-ScheduledTask -TaskName 'Construction Reporting System' -InputObject $task -User $user -Password $plain -Force | Out-Null
} finally { $plain=$null;[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
Write-Output 'Startup task registered. Verify NTFS rights and start the task after configuring HTTPS.'
