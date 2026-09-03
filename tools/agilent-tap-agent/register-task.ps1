<#
Registers a Windows scheduled task that keeps the Agilent live-feed agent
running on the OpenLab PC: starts at logon of the lab user, no time limit,
restarts on failure. Run once from an elevated PowerShell in the folder that
holds agilent_tap_agent.py and config.json (see README.md).

The task runs as the current (interactive) user because live capture needs
the same Npcap access that Wireshark already has for that account.
#>
param(
    [string]$TaskName = "SynthesyxInstrumentFeedAgent",
    [string]$PythonExe = "",
    [string]$ConfigPath = ""
)

$agent = Join-Path $PSScriptRoot "agilent_tap_agent.py"
if (-not (Test-Path $agent)) { throw "agilent_tap_agent.py not found next to this script." }
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot "config.json" }
if (-not (Test-Path $ConfigPath)) { throw "config.json not found. Copy config.example.json and paste the feed key from Admin -> Instruments." }
if (-not $PythonExe) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "python not found on PATH; pass -PythonExe C:\path\to\python.exe" }
    $PythonExe = $cmd.Source
}

$log = Join-Path $PSScriptRoot "agent.log"
# cmd /c so stdout/stderr land in a log file next to the agent.
$action = New-ScheduledTaskAction -Execute "cmd.exe" -WorkingDirectory $PSScriptRoot `
    -Argument "/c `"`"$PythonExe`" `"$agent`" --config `"$ConfigPath`" >> `"$log`" 2>&1`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started scheduled task '$TaskName' (log: $log)."
Write-Host "Stop:   Stop-ScheduledTask -TaskName $TaskName"
Write-Host "Remove: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
