@echo off
setlocal
cd /d "%~dp0"
node scripts\check-node.mjs
if errorlevel 1 goto fail
if "%~1"=="" (
 echo Feche o PDV e arraste um arquivo .sqlite sobre RESTAURAR.bat.
 goto fail
)
echo Os dados atuais serao substituidos pelo backup informado.
echo Uma copia dos dados atuais sera salva antes da restauracao.
choice /C SN /N /M "Continuar? [S/N] "
if errorlevel 2 exit /b 0
node server\restore.mjs "%~1"
if errorlevel 1 goto fail
pause
exit /b 0
:fail
pause
exit /b 1
