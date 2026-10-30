' Runs launch.js with no console window. Desktop and Startup shortcuts point here.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
args = ""
If WScript.Arguments.Count > 0 Then args = " " & WScript.Arguments(0)
' Copies installed from Setup.exe carry their own Node.js next to the app folder.
node = dir & "\..\..\node\node.exe"
If CreateObject("Scripting.FileSystemObject").FileExists(node) Then node = """" & node & """" Else node = "node"
sh.Run node & " """ & dir & "\..\launch.js""" & args, 0, False
