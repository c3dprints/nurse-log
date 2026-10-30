' Runs launch.js with no console window. Desktop and Startup shortcuts point here.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
args = ""
If WScript.Arguments.Count > 0 Then args = " " & WScript.Arguments(0)
' A nurseslog: link (a Windows notification was clicked): bring the open window to the
' front, or open one on that page. Only the known pages get through.
If WScript.Arguments.Count > 0 Then
  If LCase(Left(WScript.Arguments(0), 10)) = "nurseslog:" Then
    If sh.AppActivate("Nurse" & ChrW(8217) & "s Log") Then WScript.Quit
    page = LCase(Mid(WScript.Arguments(0), 11))
    If page <> "calendar" Then page = "today"
    args = " nurseslog:" & page
  End If
End If
' Copies installed from Setup.exe carry their own Node.js next to the app folder.
node = dir & "\..\..\node\node.exe"
If CreateObject("Scripting.FileSystemObject").FileExists(node) Then node = """" & node & """" Else node = "node"
sh.Run node & " """ & dir & "\..\launch.js""" & args, 0, False
