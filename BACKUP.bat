@echo off
setlocal
cd /d "%~dp0"
node scripts\check-node.mjs
if errorlevel 1 goto fail
echo Para fazer backup com o PDV aberto, use o botao dentro do sistema.
echo Este comando exige o PDV fechado.
node server\backup.mjs
if errorlevel 1 goto fail
pause
exit /b 0
:fail
pause
exit /b 1
