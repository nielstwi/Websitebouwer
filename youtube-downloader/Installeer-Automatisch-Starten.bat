@echo off
cd /d "%~dp0"
set "SC=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTube Downloader.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:SC);$s.TargetPath=\"%~dp0Start-Verborgen.vbs\";$s.WorkingDirectory=\"%~dp0\";$s.Save()"
wscript "%~dp0Start-Verborgen.vbs"
echo.
echo Klaar! De downloader start voortaan vanzelf met Windows en draait nu al.
echo Je kunt je opgeslagen tabblad (127.0.0.1:8000) gebruiken.
echo.
pause
