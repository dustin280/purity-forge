# Restarts the SynthesyxInstrumentFeedAgent scheduled task (so it picks up an
# updated agilent_tap_agent.py) only once no run is in progress, judged from
# the agent's own log: the last "run completed" is newer than the last "run
# started" and at least -IdleMinutes old.
#
# Agent >= 1.4.0 keeps the next sample's run information and the open sequence
# on disk, so a restart in the ~2 min gap between injections loses nothing
# (-IdleMinutes 0). Restarting an older agent needs a longer gap — the gap
# between two OpenLab sequences — because it holds the next injection's
# SetRunInformation in memory only (-IdleMinutes 4).
#
#   powershell -ExecutionPolicy Bypass -File C:\SyxLab\restart-agent-when-idle.ps1 [-IdleMinutes 0] [-MaxHours 4]
param([double]$IdleMinutes = 0, [double]$MaxHours = 4)

$task = "SynthesyxInstrumentFeedAgent"
$log = "C:\SyxLab\agilent-tap-agent\agent.log"
$deadline = (Get-Date).AddHours($MaxHours)

function Test-Idle {
    $lines = @(Get-Content $log -Tail 4000 -ErrorAction SilentlyContinue)
    $runStart = -1; $runEnd = -1; $runEndAt = $null
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $l = $lines[$i]
        if ($l -match '\] run started') { $runStart = $i }
        elseif ($l -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ .*\] run completed') {
            $runEnd = $i
            $runEndAt = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd HH:mm:ss', $null)
        }
    }
    if ($runStart -ge 0 -and $runEnd -lt $runStart) { return $false }   # a run is in progress
    if ($runEndAt -ne $null -and $IdleMinutes -gt 0) {
        if (((Get-Date) - $runEndAt).TotalMinutes -lt $IdleMinutes) { return $false }
    }
    return $true
}

$waited = 0
while (-not (Test-Idle)) {
    if ((Get-Date) -gt $deadline) {
        Write-Output "TIMEOUT: no idle gap of $IdleMinutes min within $MaxHours h; agent NOT restarted. Re-run this script later."
        exit 2
    }
    # Poll tightly so the restart lands in the gap (a restart is safe until the next run starts).
    Start-Sleep -Seconds 3
    $waited += 3
}
Write-Output "Idle at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (waited $waited s); restarting task $task"

Stop-ScheduledTask -TaskName $task -ErrorAction Stop
Start-Sleep -Seconds 3
# The task stop ends pythonw; make sure its tshark child is gone too so the
# new agent does not run beside an orphaned capture.
Get-CimInstance Win32_Process -Filter "Name = 'tshark.exe' OR Name = 'pythonw.exe'" |
    Where-Object { $_.Name -eq 'tshark.exe' -or $_.CommandLine -match 'agilent_tap_agent' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $task -ErrorAction Stop
Start-Sleep -Seconds 25

Write-Output "Processes:"
Get-Process pythonw, tshark -ErrorAction SilentlyContinue | Select-Object Name, Id, StartTime | Format-Table -AutoSize | Out-String
Write-Output "Log tail:"
Get-Content $log -Tail 8
