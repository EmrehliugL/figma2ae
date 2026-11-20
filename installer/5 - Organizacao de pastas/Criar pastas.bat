@echo off
chcp 65001 >nul
rem Cria a estrutura de pastas do Figma2AE em Documentos (o INSTALAR.bat ja faz isso).
set "DOCS=%USERPROFILE%\Documents\Figma2AE"
for %%P in ("Recebidos" "Biblioteca" "figma-plugin") do if not exist "%DOCS%\%%~P" mkdir "%DOCS%\%%~P"
echo Pastas criadas em %DOCS%
explorer "%DOCS%"
pause
