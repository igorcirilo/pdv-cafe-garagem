@echo off
setlocal
cd /d "%~dp0"
node scripts\check-node.mjs
if errorlevel 1 goto fail
call npm run check
if errorlevel 1 goto fail
echo Todos os testes e a compilacao passaram.
pause
exit /b 0
:fail
echo Verificacao interrompida. Leia o erro acima.
pause
exit /b 1
