@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
set "BASEURL=https://raw.githubusercontent.com/nazanin-ghaemizadeh/BAMCO-TASK-MANAGEMENT/main"

echo.
echo BAMCO TASK MANAGEMENT - Windows Bridge
echo ======================================

where py >nul 2>&1
if %errorlevel%==0 (
  set "PY=py"
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    set "PY=python"
  ) else (
    echo Python 3 was not found.
    pause
    exit /b 1
  )
)

if not exist "bridge_parts" mkdir "bridge_parts"
if not exist "core_b64" mkdir "core_b64"

echo Refreshing bridge code...
call :refresh "outlook_bridge.py" "outlook_bridge.py"
call :refresh "bridge_parts/bridge_01.part" "bridge_parts\bridge_01.part"
call :refresh "bridge_parts/bridge_02.part" "bridge_parts\bridge_02.part"
call :refresh "sticker-default.js" "sticker-default.js"
call :need "core_b64/core_01.b64" "core_b64\core_01.b64"
call :need "core_b64/core_02.b64" "core_b64\core_02.b64"
call :need "core_b64/core_03.b64" "core_b64\core_03.b64"
call :need "core_b64/core_04.b64" "core_b64\core_04.b64"
call :need "core_b64/core_05.b64" "core_b64\core_05.b64"
call :need "core_b64/core_06.b64" "core_b64\core_06.b64"
call :need "core_b64/core_07.b64" "core_b64\core_07.b64"
call :need "core_b64/core_08.b64" "core_b64\core_08.b64"
if errorlevel 1 goto :download_failed

echo Checking required Python packages...
%PY% -c "import win32com.client, PIL, msoffcrypto, openpyxl" >nul 2>&1
if errorlevel 1 (
  echo Installing required packages. This is only needed the first time...
  %PY% -m pip install --user --upgrade pywin32 Pillow msoffcrypto-tool openpyxl
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)

echo Repairing Outlook sticker assets from the original BAMCO desktop folder/ZIP...
%PY% -c "import outlook_bridge; r=outlook_bridge.ensure_exact_stickers(); print('Sticker assets:',r,'/10')"

echo Checking for an already running bridge...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8765/health; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Bridge is already running and its sticker files have been repaired.
  echo Return to the website and try Outlook again.
  pause
  exit /b 0
)

echo.
echo Keep Outlook desktop open.
echo Starting local bridge on http://127.0.0.1:8765 ...
echo.
%PY% outlook_bridge.py
set "RC=%errorlevel%"
echo.
echo Bridge stopped with code %RC%.
pause
exit /b %RC%

:refresh
echo Downloading %~1 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing '%BASEURL%/%~1?v=20260905-5' -OutFile '%~2'; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 exit /b 1
exit /b 0

:need
if exist "%~2" exit /b 0
call :refresh "%~1" "%~2"
exit /b %errorlevel%

:download_failed
echo.
echo Required Bridge files could not be downloaded.
echo Check the internet connection and run this file again.
pause
exit /b 1
