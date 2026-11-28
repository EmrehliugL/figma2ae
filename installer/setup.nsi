; Instalador universal do Figma2AE (um .exe só): plugin do Figma + extensão do After Effects + Figma2AE Studio.
; Gerado pelo tools/montar_setup.py:  makensis -DVERSION=x.y.z -DSRC=<pasta preparada> -DOUTFILE=<exe> installer/setup.nsi
; Instala só pro usuário atual (não pede administrador).
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
ManifestDPIAware true

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define APPNAME "Figma2AE"
!define STUDIO_DIR "$LOCALAPPDATA\Programs\Figma2AE Studio"
!define EXT_DIR "$APPDATA\Adobe\CEP\extensions\com.iug.figma2ae"
!define DOCS_DIR "$DOCUMENTS\Figma2AE"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Figma2AE"

Name "${APPNAME} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "${STUDIO_DIR}"
BrandingText "Figma2AE ${VERSION}"
Icon "${SRC}\icon.ico"
UninstallIcon "${SRC}\icon.ico"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Figma2AE"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do Figma2AE"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1046 "CompanyName" "Iug"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Iug"

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "${SRC}\icon.ico"
!define MUI_UNICON "${SRC}\icon.ico"
!define MUI_ABORTWARNING
!define MUI_COMPONENTSPAGE_SMALLDESC

!define MUI_WELCOMEPAGE_TITLE "Figma2AE ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Leva as telas do Figma para o After Effects como camadas nativas e editáveis.$\r$\n$\r$\nEste instalador coloca tudo de uma vez:$\r$\n$\r$\n   •  Plugin do Figma$\r$\n   •  Extensão do After Effects$\r$\n   •  Figma2AE Studio$\r$\n$\r$\nAntes de continuar, salve o seu projeto e feche o After Effects.$\r$\n$\r$\nDepois de instalado, as atualizações chegam sozinhas (botão Atualizar)."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "Pronto! Figma2AE instalado"
!define MUI_FINISHPAGE_TEXT "Falta só um passo, uma única vez, no Figma de desktop:$\r$\n$\r$\nPlugins  ›  Development  ›  Import plugin from manifest…$\r$\n$\r$\nNa janela que abrir, cole o caminho (Ctrl+V, ele já está copiado) e confirme:$\r$\n${DOCS_DIR}\figma-plugin\manifest.json$\r$\n$\r$\nNo After Effects: Janela › Extensões › Figma2AE."
!define MUI_FINISHPAGE_RUN "${STUDIO_DIR}\Figma2AE Studio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Figma2AE Studio"
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Abrir o tutorial"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION AbrirTutorial
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"


; ------------------------------------------------------------------ programas abertos
Function Fechados
  checar:
  StrCpy $1 ""
  nsExec::ExecToStack 'cmd /c tasklist /fi "imagename eq AfterFX.exe" /nh | find /i "AfterFX.exe"'
  Pop $0
  Pop $2
  ${If} $0 == 0
    StrCpy $1 "After Effects"
  ${EndIf}
  nsExec::ExecToStack 'cmd /c tasklist /fi "imagename eq Figma2AE Studio.exe" /nh | find /i "Figma2AE Studio.exe"'
  Pop $0
  Pop $2
  ${If} $0 == 0
    ${If} $1 != ""
      StrCpy $1 "$1 e Figma2AE Studio"
    ${Else}
      StrCpy $1 "Figma2AE Studio"
    ${EndIf}
  ${EndIf}
  ${If} $1 != ""
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Feche o $1 antes de continuar (salve o seu projeto primeiro).$\r$\n$\r$\nDepois clique em Repetir." IDRETRY checar
    Abort
  ${EndIf}
FunctionEnd

Function AbrirTutorial
  ExecShell "open" "${DOCS_DIR}\Tutorial\Tutorial Figma2AE.pdf"
FunctionEnd

; ------------------------------------------------------------------ partes
Section "-preparar"
  Call Fechados
  CreateDirectory "${DOCS_DIR}"
  CreateDirectory "${DOCS_DIR}\Recebidos"
  CreateDirectory "${DOCS_DIR}\Biblioteca"
  SetOutPath "${DOCS_DIR}\Tutorial"
  File /r "${SRC}\tutorial\*"
SectionEnd

Section "Plugin do Figma" SecPlugin
  SectionIn RO
  DetailPrint "Instalando o plugin do Figma…"
  SetOutPath "${DOCS_DIR}\figma-plugin"
  File /r "${SRC}\plugin\*"
  ; deixa o caminho do manifesto copiado, pra colar no Figma
  nsExec::Exec `powershell -NoProfile -WindowStyle Hidden -Command "Set-Clipboard -Value '${DOCS_DIR}\figma-plugin\manifest.json'"`
SectionEnd

Section "Extensão do After Effects" SecExt
  DetailPrint "Instalando a extensão do After Effects…"
  RMDir /r "${EXT_DIR}"
  SetOutPath "${EXT_DIR}"
  File /r "${SRC}\extension\*"
  ; extensões sem assinatura precisam do modo desenvolvedor do CEP (só no seu usuário)
  WriteRegStr HKCU "Software\Adobe\CSXS.9" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.13" "PlayerDebugMode" "1"
SectionEnd

Section "Figma2AE Studio" SecStudio
  DetailPrint "Instalando o Figma2AE Studio…"
  RMDir /r "${STUDIO_DIR}"
  SetOutPath "${STUDIO_DIR}"
  File /r "${SRC}\studio\*"
  File "${SRC}\icon.ico"
  CreateShortcut "$DESKTOP\Figma2AE Studio.lnk" "${STUDIO_DIR}\Figma2AE Studio.exe" "" "${STUDIO_DIR}\icon.ico"
  CreateDirectory "$SMPROGRAMS\Figma2AE"
  CreateShortcut "$SMPROGRAMS\Figma2AE\Figma2AE Studio.lnk" "${STUDIO_DIR}\Figma2AE Studio.exe" "" "${STUDIO_DIR}\icon.ico"
SectionEnd

Section "-registrar"
  CreateDirectory "${STUDIO_DIR}"
  SetOutPath "${STUDIO_DIR}"
  ${IfNot} ${FileExists} "${STUDIO_DIR}\icon.ico"
    File "${SRC}\icon.ico"
  ${EndIf}
  WriteUninstaller "${STUDIO_DIR}\Desinstalar Figma2AE.exe"
  CreateDirectory "$SMPROGRAMS\Figma2AE"
  CreateShortcut "$SMPROGRAMS\Figma2AE\Desinstalar Figma2AE.lnk" "${STUDIO_DIR}\Desinstalar Figma2AE.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Figma2AE"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Iug"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "${STUDIO_DIR}\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"${STUDIO_DIR}\Desinstalar Figma2AE.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  FileOpen $0 "${DOCS_DIR}\instalacao.log" w
  FileWrite $0 "Figma2AE ${VERSION} instalado pelo Figma2AE_Setup.exe$\r$\n"
  FileClose $0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecPlugin} "Plugin do Figma (Figma2AE e Quick Import). Vai pra Documentos\Figma2AE\figma-plugin."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecExt} "Painel e receptor dentro do After Effects (Janela › Extensões › Figma2AE)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStudio} "App pra separar as tomadas e montar no After. Cria atalho na área de trabalho."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ------------------------------------------------------------------ desinstalar
Section "Uninstall"
  RMDir /r "${EXT_DIR}"
  Delete "$DESKTOP\Figma2AE Studio.lnk"
  RMDir /r "$SMPROGRAMS\Figma2AE"
  RMDir /r "${DOCS_DIR}\figma-plugin"
  DeleteRegKey HKCU "${UNINST_KEY}"
  ; a Biblioteca fica: os projetos do After montados pelo Figma2AE usam as imagens de lá
  RMDir /r "${STUDIO_DIR}"
SectionEnd
