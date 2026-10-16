@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTube Downloader.lnk"
taskkill /f /im pythonw.exe
echo Uitgeschakeld.
pause
