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
    echo Python on this computer was not found.
    echo Install Python 3 and run this file again.
    pause
    exit /b 1
  )
)

if not exist "bridge_parts" mkdir "bridge_parts"
if not exist "core_b64" mkdir "core_b64"

call :need "outlook_bridge.py" "outlook_bridge.py"
call :need "bridge_parts/bridge_01.part" "bridge_parts\bridge_01.part"
call :need "bridge_parts/bridge_02.part" "bridge_parts\bridge_02.part"
call :need "core_b64/core_01.b64" "core_b64\core_01.b64"
call :need "core_b64/core_02.b64" "core_b64\core_02.b64"
call :need "core_b64/core_03.b64" "core_b64\core_03.b64"
call :need "core_b64/core_04.b64" "core_b64\core_04.b64"
call :need "core_b64/core_05.b64" "core_b64\core_05.b64"
call :need "core_b64/core_06.b64" "core_b64\core_06.b64"
call :need "core_b64/core_07.b64" "core_b64\core_07.b64"
call :need "core_b64/core_08.b64" "core_b64\core_08.b64"
call :need "sticker-default.js" "sticker-default.js"
if errorlevel 1 goto :download_failed

echo Checking required Python packages...
%PY% -c "import win32com.client, PIL, msoffcrypto, openpyxl" >nul 2>&1
if errorlevel 1 (
  echo Installing required packages. This is only needed the first time...
  %PY% -m pip install --user --upgrade pywin32 Pillow msoffcrypto-tool openpyxl
  if errorlevel 1 (
    echo Package installation failed.
    echo Run Setup_Outlook_Bridge.bat once, then run this file again.
    pause
    exit /b 1
  )
)

echo.
echo Keep Outlook desktop open.
echo When Windows Firewall or Chrome asks for local-network access, choose Allow.
echo Starting local bridge on http://127.0.0.1:8765 ...
echo.
%PY% outlook_bridge.py
set "RC=%errorlevel%"
echo.
echo Bridge stopped with code %RC%.
pause
exit /b %RC%

:need
if exist "%~2" exit /b 0
echo Downloading %~1 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing '%BASEURL%/%~1' -OutFile '%~2'; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 exit /b 1
exit /b 0

:download_failed
echo.
echo The Windows Bridge files could not be downloaded from GitHub.
echo Check your internet connection and try again.
pause
exit /b 1
