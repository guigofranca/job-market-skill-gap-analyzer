<#
.SYNOPSIS
  Runs one collection (job-analyzer run) and appends its output to backend/logs/collect.log.
  Used by the scheduled task (see schedule-collection.ps1); can also be run by hand.
#>
$backend = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $backend '.venv\Scripts\job-analyzer.exe'
$logDir = Join-Path $backend 'logs'
$log = Join-Path $logDir 'collect.log'

New-Item -ItemType Directory -Force $logDir | Out-Null
# Keep the log small: one previous file is enough to diagnose a failed run.
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Move-Item -Force $log "$log.1" }

$stdout = Join-Path $logDir 'last-run.out'
$stderr = Join-Path $logDir 'last-run.err'
$env:PYTHONUTF8 = '1'  # accents in the report survive the redirection
$run = Start-Process -FilePath $exe -ArgumentList 'run' -WorkingDirectory $backend -NoNewWindow `
  -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

$header = "===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - exit code $($run.ExitCode) ====="
Add-Content -Path $log -Value $header -Encoding utf8
Get-Content -Path $stderr, $stdout -Encoding utf8 | Add-Content -Path $log -Encoding utf8
Remove-Item -Force $stdout, $stderr
exit $run.ExitCode
