@echo off
rem Starts the Trading Journal at http://localhost:3000 and opens it in the browser.
rem Keep this window open while you use the journal; close it to stop.
title Trading Journal (keep this window open)
cd /d "%~dp0"

rem Rebuild only when the code has changed since the last build.
for /f %%h in ('git rev-parse HEAD 2^>nul') do set HEAD=%%h
set /p BUILT=<.next\journal-built-from 2>nul
if not exist .next\BUILD_ID set BUILT=
if not "%HEAD%"=="%BUILT%" (
  echo Preparing the journal - this takes a minute or two after an update...
  call npm run build
  if errorlevel 1 (
    echo.
    echo The build failed. Ask Claude to look at the messages above.
    pause
    exit /b 1
  )
  >.next\journal-built-from echo %HEAD%
)

echo.
echo Trading Journal is running at http://localhost:3000
echo Keep this window open. Close it to stop the journal.
echo.
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start -- --port 3000
pause
