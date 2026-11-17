@echo off
rem Aplicador de atualizacao do SuperPROC (contrato v1). Executado FORA da pasta de instalacao, depois que o
rem aplicativo fecha. Contrato por variaveis de ambiente (ver atualizacao-instalador.js):
rem   SP_INSTALL / SP_INSTALL_NOME   pasta instalada e seu nome (ex.: C:\SuperPROC e SuperPROC)
rem   SP_NOVO                        pasta da versao nova, ja extraida e conferida, no MESMO diretorio pai
rem   SP_ANTERIOR / SP_ANTERIOR_NOME copia da versao atual (guardada para voltar atras)
rem   SP_EXE                         executavel dentro da pasta instalada
rem   SP_REABRIR                     1 = abre a versao nova e espera a confirmacao; 0 = so troca
rem   SP_MARCADOR                    arquivo que a versao nova cria quando inicia bem
rem   SP_REMOVER (opcional)           arquivo a apagar depois da troca (o atualizador original, que passou a morar na pasta nova)
rem   SP_LOG / SP_FALHA              log e arquivo com o CODIGO da falha (ANTERIOR_NAO_REMOVIDA, NAO_FECHOU, NAO_ATIVOU,
rem                                  NAO_INICIOU), lido pelo aplicativo na proxima abertura
rem   SP_ESPERA_ENCERRAR / SP_ESPERA_CONFIRMAR   segundos (padroes 120 e 90)
rem Sem "timeout": ele falha quando a entrada padrao esta redirecionada; o intervalo vem do ping.
setlocal enableextensions
if "%SP_INSTALL%"=="" exit /b 2
if "%SP_NOVO%"=="" exit /b 2
if "%SP_ESPERA_ENCERRAR%"=="" set "SP_ESPERA_ENCERRAR=120"
if "%SP_ESPERA_CONFIRMAR%"=="" set "SP_ESPERA_CONFIRMAR=90"

call :log "inicio: troca para %SP_NOVO%"

rem 1) remove sobra de uma atualizacao anterior (a copia .anterior da versao passada)
if exist "%SP_ANTERIOR%" rmdir /s /q "%SP_ANTERIOR%" 2>nul
if exist "%SP_ANTERIOR%" (
  call :falha ANTERIOR_NAO_REMOVIDA "nao foi possivel remover a copia anterior; versao atual mantida"
  goto :reabrir_atual
)

rem 2) instalacao nova: nao ha pasta atual para renomear
if not exist "%SP_INSTALL%" goto :renomear_novo
rem    renomeia a instalacao atual; falha enquanto o aplicativo ainda estiver aberto, entao tenta ate ele fechar
set /a n=0
:renomear_atual
ren "%SP_INSTALL%" "%SP_ANTERIOR_NOME%" 2>nul
if not errorlevel 1 goto :renomear_novo
set /a n+=1
if %n% geq %SP_ESPERA_ENCERRAR% (
  call :falha NAO_FECHOU "o aplicativo nao fechou a tempo; versao atual mantida"
  goto :reabrir_atual
)
ping -n 2 127.0.0.1 >nul
goto :renomear_atual

rem 3) coloca a versao nova no lugar; se falhar, devolve a anterior
:renomear_novo
ren "%SP_NOVO%" "%SP_INSTALL_NOME%" 2>nul
if errorlevel 1 (
  call :log "falha ao ativar a versao nova; restaurando a anterior"
  ren "%SP_ANTERIOR%" "%SP_INSTALL_NOME%" 2>nul
  call :falha NAO_ATIVOU "nao foi possivel ativar a versao nova; anterior restaurada"
  goto :reabrir_atual
)
call :log "troca concluida"
if not "%SP_REMOVER%"=="" call :remover
if not "%SP_REABRIR%"=="1" goto :fim

rem 4) abre a versao nova e espera ela confirmar que iniciou
if exist "%SP_MARCADOR%" del "%SP_MARCADOR%" 2>nul
start "" /D "%SP_INSTALL%" %SP_EXE% "--atualizacao-marcador=%SP_MARCADOR%"
set /a n=0
:esperar_confirmacao
if exist "%SP_MARCADOR%" goto :confirmada
set /a n+=1
if %n% geq %SP_ESPERA_CONFIRMAR% goto :desfazer
ping -n 2 127.0.0.1 >nul
goto :esperar_confirmacao

:confirmada
call :log "versao nova confirmou a inicializacao"
goto :fim

rem 5) a versao nova nao confirmou: fecha, volta a anterior e avisa
:desfazer
call :log "sem confirmacao em %SP_ESPERA_CONFIRMAR%s; desfazendo"
taskkill /F /IM "%SP_EXE%" >nul 2>&1
ping -n 4 127.0.0.1 >nul
set /a n=0
:devolver
ren "%SP_INSTALL%" "%SP_INSTALL_NOME%.falhou" 2>nul
if not errorlevel 1 goto :devolver_ok
set /a n+=1
if %n% geq 20 goto :devolver_ok
ping -n 2 127.0.0.1 >nul
goto :devolver
:devolver_ok
ren "%SP_ANTERIOR%" "%SP_INSTALL_NOME%" 2>nul
if exist "%SP_INSTALL%.falhou" rmdir /s /q "%SP_INSTALL%.falhou" 2>nul
call :falha NAO_INICIOU "a versao nova nao confirmou a inicializacao; anterior restaurada"
goto :reabrir_atual

:reabrir_atual
if "%SP_REABRIR%"=="1" if exist "%SP_INSTALL%\%SP_EXE%" start "" /D "%SP_INSTALL%" %SP_EXE%
goto :fim

:fim
endlocal
exit /b 0

:remover
set /a r=0
:remover_tentar
del /f /q "%SP_REMOVER%" 2>nul
if not exist "%SP_REMOVER%" exit /b 0
set /a r+=1
if %r% geq 30 exit /b 0
ping -n 2 127.0.0.1 >nul
goto :remover_tentar

:log
if not "%SP_LOG%"=="" echo %date% %time% %~1 >>"%SP_LOG%"
exit /b 0

:falha
call :log "%~1 - %~2"
if not "%SP_FALHA%"=="" echo %~1 >"%SP_FALHA%"
exit /b 0
