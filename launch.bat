@echo off
cd /d "C:\Users\aladi\Snowball_Weekly_Summary"

:: Check if port 5500 is already in use
netstat -ano | findstr ":5500 " >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting server on http://localhost:5500 ...
    start "" /min cmd /c "python -m http.server 5500"
    timeout /t 2 /nobreak >nul
) else (
    echo Server already running on port 5500.
)

:: Open in default browser
start "" "http://localhost:5500"
