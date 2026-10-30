; Windows installer for Nurse's Log, built by scripts\build-setup.js (npm run build:setup).
; Installs for the current user only (no admin), with its own Node.js, into
; %LOCALAPPDATA%\Programs\NursesLog\{app,node}. Student records live in
; %APPDATA%\NurseLog and are never touched by install, update or uninstall.
; The app's updater runs this silently (/VERYSILENT) to move to a new version.

#ifndef AppVer
  #error Pass the version: ISCC /DAppVer=1.2.3 nurse-log.iss
#endif

[Setup]
AppId={{6F3B2C8E-5A41-4D7B-9E2A-7C1D3F0B8A64}
AppName=Nurse's Log
AppVersion={#AppVer}
AppVerName=Nurse's Log {#AppVer}
AppPublisher=c3dprints
VersionInfoVersion={#AppVer}
DefaultDirName={localappdata}\Programs\NursesLog
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=NursesLog-Setup-{#AppVer}
SetupIconFile=..\public\icon.ico
UninstallDisplayIcon={app}\app\public\icon.ico
UninstallDisplayName=Nurse's Log
LicenseFile=..\LICENSE
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Tasks]
Name: "desktopicon"; Description: "Put a Nurse's Log shortcut on the Desktop"

[InstallDelete]
; Old app files go first so files removed in a new version do not linger.
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "..\build\stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; AppUserModelID matches the one scripts\window-icon.ps1 gives the app window, so the
; taskbar ties the window to this shortcut: pinning it keeps this icon and launcher
; instead of the browser's.
Name: "{userprograms}\Nurse's Log"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\launch.vbs"""; WorkingDir: "{app}\app"; IconFilename: "{app}\app\public\icon.ico"; Comment: "Nurse's Log, school nurse office records"; AppUserModelID: "c3dprints.NursesLog"
Name: "{userdesktop}\Nurse's Log"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\launch.vbs"""; WorkingDir: "{app}\app"; IconFilename: "{app}\app\public\icon.ico"; Comment: "Nurse's Log, school nurse office records"; Tasks: desktopicon; AppUserModelID: "c3dprints.NursesLog"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\launch.vbs"""; Description: "Open Nurse's Log"; Flags: postinstall nowait skipifsilent
; After a silent update from inside the app, start the server again; the open window reloads itself.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\app\scripts\launch.vbs"" --background"; Flags: nowait; Check: WizardSilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// Stops this install's server (the bundled node.exe) so its files can be replaced or removed.
// Setup is 32-bit, so its PowerShell cannot read a 64-bit process's path with Get-Process;
// Win32_Process.ExecutablePath works from either.
procedure StopServer();
var
  Node: String;
  Code: Integer;
begin
  Node := ExpandConstant('{app}\node\node.exe');
  StringChangeEx(Node, '''', '''''', True);
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq ''' + Node + ''' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Start-Sleep -Milliseconds 500"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopServer();
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then StopServer();
end;
