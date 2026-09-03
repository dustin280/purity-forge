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
# Run under pythonw.exe (GUI subsystem: no console window, so nothing flashes
# or steals focus when the task starts) and let the agent write its own log
# file. Falls back to python.exe if pythonw.exe isn't next to it.
$pythonw = Join-Path (Split-Path $PythonExe -Parent) "pythonw.exe"
$exe = if (Test-Path $pythonw) { $pythonw } else { $PythonExe }
$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $PSScriptRoot `
    -Argument "`"$agent`" --config `"$ConfigPath`" --service --log-file `"$log`""

# Two triggers: start at logon, and a 5-minute repeating keep-alive. With
# MultipleInstances=IgnoreNew the keep-alive is a no-op while the agent is
# running and relaunches it within 5 minutes if it ever exits.
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$keepAlive = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atLogon, $keepAlive) -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started scheduled task '$TaskName' (log: $log)."
Write-Host "Stop:   Stop-ScheduledTask -TaskName $TaskName"
Write-Host "Remove: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
