'use strict';

const { criarGraph } = require('./graph');

// O MSAL recebe o retorno OAuth em loopback e faz a troca do código com PKCE.
function abrirAutorizacaoSilenciosa(BrowserWindow, coluna, endereco) {
  const autorizacao = new URL(endereco);
  const retorno = new URL(autorizacao.searchParams.get('redirect_uri'));
  if (autorizacao.origin !== 'https://login.microsoftonline.com' ||
      autorizacao.searchParams.get('prompt') !== 'none' ||
      retorno.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(retorno.hostname) || !retorno.port) {
    throw Error('Endereço de autorização inválido');
  }
  const janela = new BrowserWindow({
    show: false,
    webPreferences: { session: coluna.session, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const wc = janela.webContents;
  const ehRetorno = (url) => {
    const u = new URL(url);
    return u.origin === retorno.origin && u.pathname === retorno.pathname;
  };
  const validarNavegacao = (detalhes) => {
    if (!ehRetorno(detalhes.url) && new URL(detalhes.url).origin !== autorizacao.origin) detalhes.preventDefault();
  };
  wc.on('will-navigate', validarNavegacao);
  wc.on('will-redirect', validarNavegacao);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  return new Promise((resolve, reject) => {
    const cancelar = () => reject(Error('Autorização indisponível'));
    const prazo = setTimeout(cancelar, 20000);
    coluna.once('destroyed', cancelar);
    janela.once('closed', cancelar);
    wc.on('did-finish-load', () => { if (ehRetorno(wc.getURL())) resolve(); });
    janela.loadURL(autorizacao.href).catch(cancelar);
  }).finally(() => {
    clearTimeout(prazo);
    coluna.removeListener('destroyed', cancelar);
    if (!janela.isDestroyed()) janela.destroy();
  });
}

function observarConversaWeb({ coluna, BrowserWindow, clientId, tenant, log, criarProvedor = criarGraph, abrir = abrirAutorizacaoSilenciosa }) {
  let graph;
  let emAndamento = false;
  let novoCarregamento = false;
  let criada = false;
  let encerrou = false;
  const registrar = (codigo) => log('COPILOT_GRAPH_WEB', codigo);
  function ehPaginaInicial() {
    const url = URL.parse(coluna.getURL());
    return url?.origin === 'https://copilot.cloud.microsoft' && ['/', '/home', '/home/'].includes(url.pathname);
  }
  async function aoCarregar() {
    if (encerrou || criada || !ehPaginaInicial()) return;
    if (emAndamento) { novoCarregamento = true; return; }
    emAndamento = true;
    try {
      graph ||= criarProvedor({ clientId, tenant, abrirBrowser: (url) => abrir(BrowserWindow, coluna, url) });
      await graph.account.entrar({ silencioso: true });
      if (encerrou || !ehPaginaInicial()) return;
      await graph.criarConversa();
      criada = true;
      registrar('CONVERSA_CRIADA');
    } catch (e) {
      if (!encerrou) registrar(e?.codigo || 'FALHA_INICIALIZACAO_GRAPH');
    } finally {
      emAndamento = false;
      if (novoCarregamento) { novoCarregamento = false; void aoCarregar(); }
    }
  }
  coluna.on('did-finish-load', aoCarregar);
  coluna.once('destroyed', () => {
    encerrou = true;
    if (graph) graph.encerrar().catch(() => {});
  });
}

module.exports = { observarConversaWeb };
