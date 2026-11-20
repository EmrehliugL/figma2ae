@echo off
chcp 65001 >nul
rem Remove a extensao e o Studio. NAO apaga Documentos\Figma2AE (historico, Biblioteca e plugin).
title Desinstalar Figma2AE
echo.
echo  Vai remover a extensao do After Effects e o Figma2AE Studio.
echo  Documentos\Figma2AE (historico, Biblioteca e plugin) fica intacto.
echo  Feche o After Effects e o Studio antes.
echo.
if /i not "%~1"=="/auto" pause
rmdir /s /q "%APPDATA%\Adobe\CEP\extensions\com.iug.figma2ae" 2>nul
rmdir /s /q "%LOCALAPPDATA%\Programs\Figma2AE Studio" 2>nul
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Figma2AE Studio.lnk'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Figma2AE Studio.lnk')"
echo  Removido. No Figma, remova o plugin em Plugins ^> Gerenciar plugins.
if /i not "%~1"=="/auto" pause
