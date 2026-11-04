#define MyAppName "WaCalls Chat"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "WaCalls"
#define MyAppExeName "wacalls.exe"

[Setup]
AppId={{9F64B34C-234E-4DFE-8DF3-6BA89C433431}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist-installer
OutputBaseFilename=WaCalls_Setup_v{#MyAppVersion}
SetupIconFile=assets\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UsedUserAreasWarning=no
UninstallDisplayIcon={app}\assets\app.ico

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Iniciar o WaCalls automaticamente ao ligar o Windows"; GroupDescription: "Outras opções:"; Flags: unchecked

[Dirs]
Name: "{app}"; Permissions: users-modify
Name: "{app}\media"; Permissions: users-modify

[Files]
; Executável principal Go compilado
Source: "wacalls.exe"; DestDir: "{app}"; Flags: ignoreversion
; Frontend Web SPA React
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
; Scripts de controle e inicialização
Source: "WaCalls.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "parar.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "iniciar.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "parar.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "status.bat"; DestDir: "{app}"; Flags: ignoreversion
; Configuração inicial (.env é copiado somente se não existir, preservando configurações existentes em atualizações)
Source: ".env.default"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist
; Ícones da aplicação
Source: "assets\app.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

[Icons]
; Atalho na Área de Trabalho (inicia wacalls.exe oculto e abre em janela de aplicativo limpa)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\WaCalls.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon
; Atalhos no Menu Iniciar
Name: "{group}\{#MyAppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\WaCalls.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"
Name: "{group}\Parar Servidor WaCalls"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\parar.vbs"""; WorkingDir: "{app}"; IconFilename: "{sys}\imageres.dll"; IconIndex: 98
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "WaCalls"; ValueData: """{sys}\wscript.exe"" ""{app}\WaCalls.vbs"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\WaCalls.vbs"""; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/IM wacalls.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/IM wacalls.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
