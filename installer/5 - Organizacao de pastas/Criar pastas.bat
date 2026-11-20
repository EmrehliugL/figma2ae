@echo off
chcp 65001 >nul
rem Cria a estrutura de pastas do Figma2AE em Documentos (o INSTALAR.bat ja faz isso).
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "MYDOCS=%%D"
if not defined MYDOCS set "MYDOCS=%USERPROFILE%\Documents"
set "DOCS=%MYDOCS%\Figma2AE"
for %%P in ("Recebidos" "Biblioteca" "figma-plugin") do if not exist "%DOCS%\%%~P" mkdir "%DOCS%\%%~P"
echo Pastas criadas em %DOCS%
explorer "%DOCS%"
pause
