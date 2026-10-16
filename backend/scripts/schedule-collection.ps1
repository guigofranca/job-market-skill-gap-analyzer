<#
.SYNOPSIS
  Registers (or removes) a Windows scheduled task that collects and processes jobs every day,
  so deadlines and closed postings stay current. The running API picks up the new dataset by
  itself; no restart needed.
.EXAMPLE
  pwsh backend/scripts/schedule-collection.ps1             # every day at 08:00
  pwsh backend/scripts/schedule-collection.ps1 -At 19:30
  pwsh backend/scripts/schedule-collection.ps1 -Remove
#>
param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string] $At = '08:00',
  [switch] $Remove
)
$ErrorActionPreference = 'Stop'
$TaskName = 'JobAnalyzer - coleta diaria'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Task '$TaskName' removed."
  } else {
    Write-Output "No task named '$TaskName'."
  }
  return
}

$collect = Join-Path $PSScriptRoot 'collect.ps1'
$exe = Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\job-analyzer.exe'
if (-not (Test-Path $exe)) {
  throw "job-analyzer not found at $exe. Create the virtual environment first (see the README)."
}
$shell = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $shell) { $shell = Get-Command powershell }

$action = New-ScheduledTaskAction -Execute $shell.Source `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$collect`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# StartWhenAvailable: if the computer was off at the scheduled time, run as soon as it is on.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Job Market Skill Gap Analyzer: coleta e processa vagas (job-analyzer run).' `
  -Force | Out-Null
Write-Output "Task '$TaskName' registered: every day at $At."
Write-Output "Log: $(Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\collect.log')"
