@echo off
chcp 65001 >nul
py -m pip install --upgrade pywin32 Pillow msoffcrypto-tool openpyxl
pause
