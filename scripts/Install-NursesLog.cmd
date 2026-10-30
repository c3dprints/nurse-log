@echo off
rem One-click install (or update) of Nurse's Log for this Windows user.
rem Downloads the app from GitHub, then runs scripts\install.ps1 from it.
rem Needs Git and Node.js LTS; the repo is private, so Git asks to sign in to GitHub once.
setlocal
title Install Nurse's Log
echo Installing Nurse's Log...
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install it with the default options, then run this file again.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version, then run this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

set "SRC=%TEMP%\nurse-log-setup"
if exist "%SRC%\.git" (
  git -C "%SRC%" pull --quiet
) else (
  echo A GitHub sign-in window may open. Sign in with an account that can see the Nurse's Log repo.
  git clone --quiet https://github.com/c3dprints/nurse-log.git "%SRC%"
)
if errorlevel 1 (
  echo.
  echo Could not download Nurse's Log from GitHub. Check the internet connection and the GitHub sign-in.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC%\scripts\install.ps1"
if errorlevel 1 (
  echo.
  echo The install stopped with an error, shown above.
  pause
  exit /b 1
)

echo.
echo Done. Open Nurse's Log from the shortcut on the Desktop.
pause
