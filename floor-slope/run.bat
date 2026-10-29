@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Elfarida Construction - Bathroom Floor Slope Reel Builder
echo ============================================================
echo.

where ffmpeg >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] FFmpeg is not installed or not in your Windows PATH.
    echo.
    echo To install FFmpeg quickly on Windows:
    echo   1. Open PowerShell or Command Prompt and run:
    echo        winget install Gyan.FFmpeg
    echo   2. Close and reopen this window, then double-click run.bat again.
    echo   (Alternatively, download ffmpeg-release-essentials.zip from https://www.gyan.dev/ffmpeg/builds/ and add its bin\ folder to your PATH^)
    echo.
    pause
    exit /b 1
)

echo [1/4] Installing Python packages (playwright, numpy, scipy)...
pip install playwright numpy scipy
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install Python packages. Make sure Python and pip are installed.
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Playwright Chromium...
python -m playwright install chromium
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install Playwright Chromium.
    pause
    exit /b 1
)

echo.
echo [3/4] Generating synthesized score and SFX (audio/score.wav)...
python audio/make_audio.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Audio generation failed.
    pause
    exit /b 1
)

echo.
echo [4/4] Rendering QA stills, 6-second video chunks, and mixing final MP4...
python render.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Video rendering failed. Run run.bat again to resume from the last completed chunk.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   DONE! Check:
echo     - QA Stills : qa\
echo     - Final MP4 : out\final.mp4
echo ============================================================
pause
