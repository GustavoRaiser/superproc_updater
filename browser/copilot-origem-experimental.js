'use strict';
// Somente demonstração visual explícita; não fornece APIs do Edge ou contexto.
const ARG = '--copilot-origem-edge';
const URL_HOST = 'edge://discover-chat-v2/';
const URL_SITE = 'https://copilot.microsoft.com/';
const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Copilot — teste visual</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src https://copilot.microsoft.com https://copilot.com">
<style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font:13px system-ui}header{padding:10px;background:#fff4ce;color:#333}#falha{padding:14px;color:#822;background:#fff0f0}iframe{border:0;flex:1;width:100%}</style></head>
<body><header>Teste visual experimental do Copilot no SuperPROC. A leitura das abas ainda não está conectada.</header><div id="falha" hidden>O carregamento do Copilot foi bloqueado pela resposta do serviço. Para voltar à coluna habitual, feche o SuperPROC e execute iniciar-browser.bat.</div><iframe title="Copilot" src="https://copilot.microsoft.com/"></iframe></body></html>`;
function registrarEsquema(protocol) {
  protocol.registerSchemesAsPrivileged([{scheme:'edge', privileges:{standard:true,secure:true}}]);
}
function criarSessao(session) {
  // Partição em memória, sem acesso ao perfil principal ou cookies existentes.
  const ses = session.fromPartition('copilot-origem-experimental');
  ses.protocol.handle('edge', req => {
    if (req.url !== URL_HOST) return new Response('Não encontrado', {status:404});
    return new Response(HTML, {headers:{'Content-Type':'text/html; charset=utf-8'}});
  });
  return ses;
}
module.exports={ARG,URL_HOST,URL_SITE,HTML,registrarEsquema,criarSessao};
