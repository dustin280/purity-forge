' Runs a program with no visible window, so scheduled tasks that launch console
' programs (cmd.exe, powershell.exe, .NET console apps) never flash a window or
' steal focus. wscript.exe itself has no console, and window style 0 starts the
' child hidden; the exit code is passed through. Point a task's action at:
'   wscript.exe "C:\SyxLab\hidden-run.vbs" "C:\path\program.exe" [args...]
' (GUI-subsystem programs such as pythonw.exe don't need this.)
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
