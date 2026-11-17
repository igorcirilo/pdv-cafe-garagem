@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto node_missing
node scripts\check-node.mjs
if errorlevel 1 goto fail
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
echo.
echo Instalacao concluida. Abra INICIAR.bat.
pause
exit /b 0
:node_missing
echo Instale Node.js 24.x LTS de https://nodejs.org/ e tente novamente.
:fail
echo Instalacao interrompida. Leia o erro acima.
pause
exit /b 1
