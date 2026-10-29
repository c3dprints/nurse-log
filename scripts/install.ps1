# Installs (or repairs) Nurse's Log for this Windows user.
#   - needs Git and Node.js 20 LTS or newer
#   - clones the repo to %LOCALAPPDATA%\NursesLog\app and checks out the newest release tag
#   - installs the node packages
#   - restarts the server if it is running
#   - puts a "Nurse's Log" shortcut on the Desktop
# Student records are kept in %APPDATA%\NurseLog, separate from the app, and are never touched here.
param([string]$Repo = 'https://github.com/c3dprints/nurse-log.git')
$ErrorActionPreference = 'Stop'

foreach ($tool in 'git', 'node', 'npm') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed (get Git from git-scm.com and Node.js LTS from nodejs.org)" }
}

$root = Join-Path $env:LOCALAPPDATA 'NursesLog'
$app = Join-Path $root 'app'
New-Item -ItemType Directory -Force $root | Out-Null

if (-not (Test-Path (Join-Path $app '.git'))) {
  git clone --quiet $Repo $app
  if ($LASTEXITCODE) { throw 'git clone failed' }
}
git -C $app fetch --tags --force --quiet origin
if ($LASTEXITCODE) { throw 'git fetch failed' }
$tag = git -C $app tag -l 'v*' | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Substring(1) } | Select-Object -Last 1
if (-not $tag) { throw 'the repo has no release tags yet' }
git -C $app checkout --quiet "refs/tags/$tag"
if ($LASTEXITCODE) { throw "checkout of $tag failed" }

# npm prints warnings on stderr, which Windows PowerShell 5.1 turns into a
# terminating error under 'Stop'; only the exit code counts here.
Push-Location $app
$ErrorActionPreference = 'Continue'
try {
  cmd /c "npm ci --omit=dev --no-audit --no-fund 2>&1"
  if ($LASTEXITCODE) { throw 'npm ci failed' }
} finally {
  $ErrorActionPreference = 'Stop'
  Pop-Location
}
Write-Host "Installed $tag in $app"

# Stop a running copy so the launcher starts the new code.
$serverJs = Join-Path $app 'server.js'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverJs) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop "Nurse's Log.lnk"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments = '"' + (Join-Path $app 'scripts\launch.vbs') + '"'
$s.WorkingDirectory = $app
$s.IconLocation = Join-Path $app 'public\icon.ico'
$s.Description = "Nurse's Log, school nurse office records"
$s.Save()
Write-Host "Desktop shortcut: $lnk"

Start-Process (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $app 'scripts\launch.vbs') + '"')
