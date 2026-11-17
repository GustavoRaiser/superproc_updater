; SuperPROC v2 - Instalador Web Nativo (NSIS + WinINet)
; Sem PowerShell, sem scripts .bat, sem necessidade de privilégios administrativos.
; Baixa o pacote assinado diretamente do Google Cloud Storage (superproc_updater).

Unicode True
!include "MUI2.nsh"

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.2.0"
!endif

!define PRODUCT_NAME "SuperPROC v2"
!define PRODUCT_PUBLISHER "SuperPROC Team"
!define DOWNLOAD_URL "https://storage.googleapis.com/superproc_updater/SuperPROC-latest.zip"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SuperPROC_v2"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\exports\SuperPROC-Setup.exe"
InstallDir "$LOCALAPPDATA\SuperPROC"
InstallDirRegKey HKCU "Software\SuperPROC_v2" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "..\ICO_BROWSER.ico"
!define MUI_UNICON "..\ICO_BROWSER.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\SuperPROC_v2.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o SuperPROC v2 agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador do ${PRODUCT_NAME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright" "Open Source (ISC)"

Section "Instalar SuperPROC v2" SecMain
  SetOutPath "$INSTDIR"
  DetailPrint "Baixando pacote oficial do SuperPROC v2..."
  nsExec::ExecToLog '"$SYSDIR\curl.exe" -fSL --retry 3 -A "SuperPROC-Setup/${PRODUCT_VERSION}" -o "$TEMP\SuperPROC-latest.zip" "${DOWNLOAD_URL}"'
  Pop $0
  StrCmp $0 "0" +3
    MessageBox MB_ICONSTOP|MB_OK "Não foi possível baixar o SuperPROC v2 (código $0). Verifique sua conexão de rede."
    Abort

  DetailPrint "Extraindo arquivos para $INSTDIR..."
  nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$TEMP\SuperPROC-latest.zip" --strip-components=1 -C "$INSTDIR"'
  Pop $1
  Delete "$TEMP\SuperPROC-latest.zip"
  StrCmp $1 "0" +3
    MessageBox MB_ICONSTOP|MB_OK "Falha ao extrair os arquivos do SuperPROC v2 (código $1)."
    Abort

  IfFileExists "$INSTDIR\SuperPROC_v2.exe" +3
    MessageBox MB_ICONSTOP|MB_OK "O executável SuperPROC_v2.exe não foi encontrado após a extração."
    Abort

  WriteRegStr HKCU "Software\SuperPROC_v2" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\SuperPROC_v2.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\SuperPROC_v2.exe" "" "$INSTDIR\SuperPROC_v2.exe" 0
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\SuperPROC_v2.exe" "" "$INSTDIR\SuperPROC_v2.exe" 0
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\SuperPROC_v2"
SectionEnd
