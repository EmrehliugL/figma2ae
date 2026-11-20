@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Instalador Figma2AE 2.3
cd /d "%~dp0"

rem ------------------------------------------------------------------
rem  Uso:  INSTALAR.bat          instalacao normal (com pausas)
rem        INSTALAR.bat /auto    sem pausas nem janelas (para o Claude ou scripts)
rem  Codigos de saida: 0 = ok | 2 = After Effects ou Studio aberto | 3 = arquivos do pacote faltando | 4 = erro ao copiar
rem  Log: Documentos\Figma2AE\instalacao.log
rem ------------------------------------------------------------------

set "AUTO=0"
if /i "%~1"=="/auto" set "AUTO=1"
if /i "%~1"=="--auto" set "AUTO=1"

rem pasta Documentos de verdade (com OneDrive ela nao e %USERPROFILE%\Documents)
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "MYDOCS=%%D"
if not defined MYDOCS set "MYDOCS=%USERPROFILE%\Documents"
set "DOCS=%MYDOCS%\Figma2AE"
set "EXT=%APPDATA%\Adobe\CEP\extensions\com.iug.figma2ae"
set "STUDIO=%LOCALAPPDATA%\Programs\Figma2AE Studio"
if not exist "%DOCS%" mkdir "%DOCS%"
set "LOG=%DOCS%\instalacao.log"
echo ==== Figma2AE 2.3 - %DATE% %TIME% ==== > "%LOG%"

echo.
echo  ================================================
echo     Figma2AE 2.3  -  instalador
echo  ================================================
echo.
echo  Vai instalar: extensao do After Effects, Figma2AE Studio,
echo  plugin do Figma e as pastas de trabalho.
echo.

rem --- confere se o pacote esta completo
for %%F in ("1 - Plugin Figma\manifest.json" "2 - Extensao After Effects\com.iug.figma2ae\CSXS\manifest.xml" "4 - Figma2AE Studio\Figma2AE Studio.exe") do (
  if not exist %%F (
    echo  ERRO: falta %%~F. Extraia o zip inteiro antes de instalar.
    echo FALTA %%~F >> "%LOG%"
    if "%AUTO%"=="0" pause
    exit /b 3
  )
)

rem --- After Effects e Studio precisam estar fechados
:checar
set "ABERTO="
tasklist /fi "imagename eq AfterFX.exe" 2>nul | find /i "AfterFX.exe" >nul && set "ABERTO=After Effects"
tasklist /fi "imagename eq Figma2AE Studio.exe" 2>nul | find /i "Figma2AE Studio.exe" >nul && set "ABERTO=%ABERTO% Figma2AE Studio"
if defined ABERTO (
  echo  Feche antes de continuar: %ABERTO%
  echo ABERTO %ABERTO% >> "%LOG%"
  if "%AUTO%"=="1" exit /b 2
  echo  Salve o seu projeto, feche e aperte uma tecla para tentar de novo.
  pause >nul
  goto checar
)
if "%AUTO%"=="0" pause

echo  [1/4] Pastas de trabalho...
for %%P in ("Recebidos" "Biblioteca" "figma-plugin") do if not exist "%DOCS%\%%~P" mkdir "%DOCS%\%%~P"
echo OK pastas >> "%LOG%"

echo  [2/4] Plugin do Figma...
robocopy "1 - Plugin Figma" "%DOCS%\figma-plugin" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto erro_copia
echo OK plugin >> "%LOG%"

echo  [3/4] Extensao do After Effects...
robocopy "2 - Extensao After Effects\com.iug.figma2ae" "%EXT%" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto erro_copia
rem extensoes sem assinatura precisam do modo de desenvolvedor do CEP (so no seu usuario)
for %%V in (9 10 11 12) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo OK extensao >> "%LOG%"

echo  [4/4] Figma2AE Studio...
robocopy "4 - Figma2AE Studio" "%STUDIO%" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP >> "%LOG%"
if errorlevel 8 goto erro_copia
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$app = Join-Path $env:LOCALAPPDATA 'Programs\Figma2AE Studio';" ^
  "foreach ($d in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {" ^
  "  $s = $w.CreateShortcut((Join-Path $d 'Figma2AE Studio.lnk'));" ^
  "  $s.TargetPath = Join-Path $app 'Figma2AE Studio.exe'; $s.WorkingDirectory = $app;" ^
  "  $s.IconLocation = Join-Path $app 'icon.ico'; $s.Save() }" >> "%LOG%" 2>&1
echo OK studio >> "%LOG%"

echo.
echo  ================================================
echo     Pronto! Tudo instalado.
echo  ================================================
echo.
echo  Falta so 1 passo, no Figma de desktop:
echo    Plugins  ^>  Desenvolvimento  ^>  Importar plugin do manifesto...
echo    e escolha:  %DOCS%\figma-plugin\manifest.json
echo.
echo  Depois abra o After Effects: Janela ^> Extensoes ^> Figma2AE.
echo  Para conferir a instalacao, rode VERIFICAR.bat.
echo.
echo CONCLUIDO >> "%LOG%"
if "%AUTO%"=="0" (
  explorer "%DOCS%\figma-plugin"
  pause
)
exit /b 0

:erro_copia
echo.
echo  ERRO ao copiar arquivos. Veja o log: %LOG%
echo ERRO copia >> "%LOG%"
if "%AUTO%"=="0" pause
exit /b 4
