@echo off
title YouTube Downloader (sluit dit venster om te stoppen)
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000"
echo YouTube Downloader draait. Laat dit venster open staan zolang je downloadt.
python server.py
pause
