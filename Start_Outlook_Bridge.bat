@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "BAMCO Outlook Bridge" /min py outlook_bridge.py
