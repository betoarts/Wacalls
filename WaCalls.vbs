Option Explicit

Dim WshShell, fso, strDir, objWMIService, colProcesses
Dim edgePath, chromePath, appUrl, port

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

port = "8080"

' Detecta a porta configurada no .env (se existir)
If fso.FileExists(strDir & "\.env") Then
    Dim envFile, line, parts
    On Error Resume Next
    Set envFile = fso.OpenTextFile(strDir & "\.env", 1)
    If Err.Number = 0 Then
        Do Until envFile.AtEndOfStream
            line = Trim(envFile.ReadLine())
            If Left(line, 5) = "PORT=" Then
                port = Trim(Mid(line, 6))
            ElseIf Left(line, 13) = "WACALLS_ADDR=" Then
                parts = Split(line, "=")
                If UBound(parts) >= 1 Then
                    port = Replace(Trim(parts(1)), ":", "")
                End If
            End If
        Loop
        envFile.Close
    End If
    On Error GoTo 0
End If

appUrl = "http://localhost:" & port

' 1. Verifica se o backend wacalls.exe ja esta rodando
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'wacalls.exe'")

If colProcesses.Count = 0 Then
    ' Inicia wacalls.exe em segundo plano (0 = oculto, sem janela preta de cmd)
    WshShell.CurrentDirectory = strDir
    WshShell.Run Chr(34) & strDir & "\wacalls.exe" & Chr(34), 0, False
    ' Aguarda 1.5s para o servidor HTTP subir
    WScript.Sleep 1500
End If

' 2. Procura pelo Microsoft Edge para abrir em modo Janela de Aplicativo (Desktop App)
edgePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
If Not fso.FileExists(edgePath) Then
    edgePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
End If

' 3. Procura pelo Google Chrome como alternativa
chromePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe")
If Not fso.FileExists(chromePath) Then
    chromePath = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
End If
If Not fso.FileExists(chromePath) Then
    chromePath = WshShell.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe")
End If

' 4. Abre em modo App (janela limpa e dedicada sem abas) ou no navegador padrao
If fso.FileExists(edgePath) Then
    WshShell.Run Chr(34) & edgePath & Chr(34) & " --app=" & appUrl & " --window-size=1280,820", 1, False
ElseIf fso.FileExists(chromePath) Then
    WshShell.Run Chr(34) & chromePath & Chr(34) & " --app=" & appUrl & " --window-size=1280,820", 1, False
Else
    WshShell.Run appUrl, 1, False
End If

