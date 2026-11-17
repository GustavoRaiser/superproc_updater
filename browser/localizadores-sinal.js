'use strict';
/**
 * Sinal universal "vai mudar / mudou" dos localizadores do processo.
 *
 * Qualquer escritor (eProc nativo, AZFLOW, SuperPROC) altera localizadores com um POST em
 * controlador_ajax.php?acao_ajax=alterar_localizadores. O host observa só esse pedido, que já passa
 * pelos listeners de rede da sessão, e avisa a página com dois eventos DOM no frame de origem:
 *   superproc:localizadores-vai-mudar    ao sair o pedido
 *   superproc:localizadores-atualizados  ao terminar a resposta (ou falhar)
 * `detail` é uma STRING JSON ({ id, origem, ok }): objetos não atravessam mundos isolados.
 * Custo ocioso: nenhum. Por requisição, uma busca de texto na URL; sem timer nem observador.
 */
const EVENTO_VAI_MUDAR = 'superproc:localizadores-vai-mudar';
const EVENTO_ATUALIZADOS = 'superproc:localizadores-atualizados';
const MARCA = 'acao_ajax=alterar_localizadores';
const PADRAO = /controlador_ajax\.php\?(?:[^#]*&)?acao_ajax=alterar_localizadores(?:&|#|$)/;

function ehAlteracaoLocalizadores(url) {
  return typeof url === 'string' && url.includes(MARCA) && PADRAO.test(url);
}

function scriptDoEvento(evento, id, ok) {
  const detail = JSON.stringify({ id: `host-${id}`, origem: 'host', ok });
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(evento)},{detail:${JSON.stringify(detail)}}));`;
}

// Frame que originou o pedido; se não houver (ou já foi destruído), o frame principal da aba.
function resolverAlvoPadrao(details) {
  const { webContents } = require('electron');
  try { if (details.frame && !details.frame.detached) return details.frame; } catch { /* frame destruído */ }
  const contents = webContents.fromId(details.webContentsId);
  return contents && !contents.isDestroyed() ? contents.mainFrame : null;
}

function criarSinalLocalizadores({ resolverAlvo = resolverAlvoPadrao } = {}) {
  function avisar(evento, details, ok) {
    if (!details || !ehAlteracaoLocalizadores(details.url)) return false;
    try {
      const alvo = resolverAlvo(details);
      if (!alvo) return false;
      const execucao = alvo.executeJavaScript(scriptDoEvento(evento, details.id, ok));
      if (execucao && typeof execucao.catch === 'function') execucao.catch(() => {});
      return true;
    } catch { return false; } // O aviso nunca pode afetar o carregamento da página.
  }
  return {
    inicio: details => avisar(EVENTO_VAI_MUDAR, details, true),
    fim: (details, ok = true) => avisar(EVENTO_ATUALIZADOS, details, !!ok)
  };
}

module.exports = { criarSinalLocalizadores, ehAlteracaoLocalizadores, scriptDoEvento, EVENTO_VAI_MUDAR, EVENTO_ATUALIZADOS };
