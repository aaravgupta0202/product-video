@echo off
rem Double-click to record the CanopyAI launch film -> output\canopy-launch.mp4
rem Optional: drag a music file onto this .bat to add a soundtrack.
cd /d "%~dp0"
if "%~1"=="" (
  node run.js
) else (
  node run.js --music "%~1"
)
pause
