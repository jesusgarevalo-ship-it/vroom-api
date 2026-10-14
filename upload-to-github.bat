@echo off
REM VROOM API - Upload Script
REM Run this script to push to GitHub

cd /d "%~dp0"

echo.
echo ========================================
echo VROOM Repuestos - GitHub Upload
echo ========================================
echo.
echo Before running this script:
echo 1. Make sure you have a valid GitHub token
echo 2. Replace YOUR_TOKEN_HERE with your token
echo.

set GITHUB_TOKEN=YOUR_TOKEN_HERE
set GITHUB_USER=jesusgarevalo-ship-it

echo Creating GitHub repository...
curl -X POST -H "Authorization: token %GITHUB_TOKEN%" \
  -d "{\"name\":\"vroom-api\",\"description\":\"VROOM Repuestos MVP API\",\"public\":true}" \
  https://api.github.com/user/repos

echo.
echo Pushing code...
git remote set-url origin https://%GITHUB_USER%:%GITHUB_TOKEN%@github.com/%GITHUB_USER%/vroom-api.git
git push -u origin main --force

echo.
echo Done!
pause
