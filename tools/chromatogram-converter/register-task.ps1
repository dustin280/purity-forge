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
    throw "ChromatogramConverter.exe not found next to this script. Publish the project first (see README.md)."
}

# Launch through a hidden-window wrapper: the converter is a console app, and a
# task that starts a console app directly flashes a window and steals focus
# every interval. wscript.exe has no console and starts the child hidden
# (window style 0) while passing its exit code through. Same launcher as
# tools/hidden-run.vbs, written next to the exe so the task is self-contained.
$vbs = Join-Path $PSScriptRoot "hidden-run.vbs"
@'
Set sh = CreateObject("WScript.Shell")
Set a = WScript.Arguments
If a.Count = 0 Then WScript.Quit 2
cmd = ""
For i = 0 To a.Count - 1
    s = a(i)
    If InStr(s, " ") > 0 Then s = """" & s & """"
    cmd = cmd & " " & s
Next
WScript.Quit sh.Run(Trim(cmd), 0, True)
'@ | Set-Content -Path $vbs -Encoding ASCII
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '" "' + $exePath + '"') -WorkingDirectory $PSScriptRoot
# [TimeSpan]::MaxValue produces a duration Task Scheduler's XML schema
# rejects outright ("out of range"). 10 years is effectively permanent
# for this purpose and well within the accepted range.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

# -ErrorAction Stop turns a failed registration into a terminating error,
# which stops the script and prints the error without closing the
# PowerShell window it's running in (unlike exit, which would).
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
Write-Host "Registered scheduled task '$TaskName' - runs every $IntervalMinutes minute(s)."
Write-Host "To remove it later: Unregister-ScheduledTask -TaskName $TaskName"
