<#
Registers a Windows scheduled task that runs the chromatogram converter
periodically. Run this once, elevated (Right-click -> Run as Administrator
in PowerShell), from the folder containing the published
ChromatogramConverter.exe (see README.md for the publish step).
#>
param(
    [string]$TaskName = "SynthesyxChromatogramConverter",
    [int]$IntervalMinutes = 5
)

$exePath = Join-Path $PSScriptRoot "ChromatogramConverter.exe"
if (-not (Test-Path $exePath)) {
    Write-Error "ChromatogramConverter.exe not found next to this script. Publish the project first (see README.md)."
    exit 1
}

$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force

Write-Host "Registered scheduled task '$TaskName' — runs every $IntervalMinutes minute(s)."
Write-Host "To remove it later: Unregister-ScheduledTask -TaskName $TaskName"
