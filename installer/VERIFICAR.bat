@echo off
chcp 65001 >nul
rem Confere se o Figma2AE esta instalado. Cada linha sai como [OK] ou [FALTA].
rem Codigo de saida: 0 = tudo ok | 1 = algo falta
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok = $true; function T($n, $c) { if ($c) { Write-Host ('[OK]    ' + $n) } else { Write-Host ('[FALTA] ' + $n); $script:ok = $false } }" ^
  "$docs = Join-Path $env:USERPROFILE 'Documents\Figma2AE';" ^
  "T 'Plugin do Figma (Documentos\Figma2AE\figma-plugin\manifest.json)' (Test-Path (Join-Path $docs 'figma-plugin\manifest.json'));" ^
  "T 'Pastas Recebidos e Biblioteca' ((Test-Path (Join-Path $docs 'Recebidos')) -and (Test-Path (Join-Path $docs 'Biblioteca')));" ^
  "T 'Extensao do After Effects' (Test-Path (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.iug.figma2ae\CSXS\manifest.xml'));" ^
  "$dbg = @(9,10,11,12) | Where-Object { (Get-ItemProperty -Path ('HKCU:\Software\Adobe\CSXS.' + $_) -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode -eq '1' };" ^
  "T 'Extensoes sem assinatura liberadas (PlayerDebugMode)' ($dbg.Count -ge 1);" ^
  "T 'Figma2AE Studio' (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\Figma2AE Studio\Figma2AE Studio.exe'));" ^
  "T 'Atalho do Studio na Area de Trabalho' (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Figma2AE Studio.lnk'));" ^
  "if (Get-Process AfterFX -ErrorAction SilentlyContinue) {" ^
  "  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:7452/ping'; T ('Receptor rodando no After Effects: ' + $r.Content) $true } catch { T 'Receptor rodando no After Effects (feche e abra o After uma vez)' $false }" ^
  "} else { Write-Host '[--]    After Effects fechado: abra para testar o receptor' }" ^
  "Write-Host '[--]    Plugin no Figma: confira em Plugins > Desenvolvimento > Figma2AE (passo manual)';" ^
  "if ($ok) { exit 0 } else { exit 1 }"
set "RC=%ERRORLEVEL%"
if /i not "%~1"=="/auto" pause
exit /b %RC%
