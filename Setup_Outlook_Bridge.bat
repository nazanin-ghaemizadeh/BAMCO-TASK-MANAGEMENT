@echo off
setlocal
chcp 65001 >nul
where py >nul 2>&1
if %errorlevel%==0 (set "PY=py") else (set "PY=python")
%PY% -m pip install --user --upgrade pywin32 Pillow msoffcrypto-tool openpyxl
if errorlevel 1 (
  echo Setup failed. Make sure Python 3 is installed and available in PATH.
) else (
  echo Setup completed successfully.
)
pause
