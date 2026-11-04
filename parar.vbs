Option Explicit

Dim WshShell, objWMIService, colProcesses
Set WshShell = CreateObject("WScript.Shell")
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'wacalls.exe'")

If colProcesses.Count > 0 Then
    WshShell.Run "taskkill.exe /IM wacalls.exe /F", 0, True
    MsgBox "O servidor WaCalls foi finalizado com sucesso.", vbInformation, "WaCalls Chat"
Else
    MsgBox "O servidor WaCalls não está em execução.", vbInformation, "WaCalls Chat"
End If

