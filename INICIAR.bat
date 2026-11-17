@echo off
setlocal
cd /d "%~dp0"
node scripts\check-node.mjs
if errorlevel 1 goto fail
if not exist dist\index.html (
 echo Execute INSTALAR.bat primeiro.
 goto fail
)
echo Abra http://127.0.0.1:3210 no navegador.
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
node server\index.mjs
if errorlevel 1 goto fail
exit /b 0
:fail
pause
exit /b 1
