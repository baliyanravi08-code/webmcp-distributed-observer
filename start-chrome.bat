@echo off
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 2 >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="D:\webmcp-distributed-observer\chrome-profile" https://app.godark-dex.com/
