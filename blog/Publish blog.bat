@echo off
REM Double-click this after adding or editing a post.
REM It rebuilds the blog index page and the sitemap.

cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node isn't installed, so the blog can't rebuild itself.
  echo   Get it from https://nodejs.org - the LTS button - then run this again.
  echo.
  pause
  exit /b 1
)

node "blog\build.js"

echo   Press any key to close.
pause >nul
