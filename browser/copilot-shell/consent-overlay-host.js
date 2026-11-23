'use strict';
// Cartão "O Copilot deseja usar o conteúdo no seu navegador". Camada: host (processo principal).
// No Edge 157 esse cartão é a sobreposição edge://copilot-sidepane-overlay no estado kConsent, desenhada pelo
// navegador sobre o painel do Copilot. Aqui é uma WebContentsView local, com arquivo próprio, empilhada sobre a
// parte de baixo da coluna. A página do Copilot não desenha, não lê e não clica neste cartão.
// Se a coluna estiver oculta, a pergunta vira um diálogo nativo com as mesmas opções.
// `mostrar` resolve com 'permitir', 'negar' ou null (fechado sem escolha: nada deve ser gravado).
const path = require('node:path');

const ARQUIVO_HTML = path.join(__dirname, 'consent-overlay.html');
const PRELOAD = path.join(__dirname, 'consent-overlay-preload.js');
const CANAL_DECISAO = 'copilot-consentimento-decisao';
const ALTURA = 250;

function limitesDoCartao(area) {
  if (!area || !(area.width >= 200) || !(area.height >= 160)) return null;
  const altura = Math.min(ALTURA, area.height);
  return { x: Math.round(area.x), y: Math.round(area.y + area.height - altura), width: Math.round(area.width), height: Math.round(altura) };
}

function criarCartaoConsentimento({ WebContentsView, dialog, getMainWindow, getAreaDaColuna, getSession, log = () => {} }) {
  const reg = (m) => { try { log('COPILOT_PONTE_CONSENTIMENTO', m); } catch (_) { /* log nunca derruba o fluxo */ } };
  let view = null;
  let resolver = null;

  const janela = () => { const w = getMainWindow(); return w && !w.isDestroyed() ? w : null; };
  const viva = () => !!view && !!view.webContents && !view.webContents.isDestroyed();

  function fechar(resposta) {
    const v = view;
    const r = resolver;
    view = null;
    resolver = null;
    if (v) {
      const w = janela();
      if (w) { try { w.contentView.removeChildView(v); } catch (_) { /* já removida */ } }
      try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch (_) { /* já fechada */ }
    }
    if (r) r(resposta);
  }

  function reposicionar() {
    if (!viva()) return;
    const limites = limitesDoCartao(getAreaDaColuna());
    // A coluna foi ocultada ou ficou pequena demais com o cartão aberto: fecha sem decisão.
    if (!limites) { fechar(null); return; }
    try { view.setBounds(limites); } catch (_) { /* janela em encerramento */ }
  }

  async function perguntarNativo() {
    const w = janela();
    if (!w || !dialog) return null;
    const { response } = await dialog.showMessageBox(w, {
      type: 'question', title: 'Copilot no SuperPROC', noLink: true,
      message: 'O Copilot deseja usar o conteúdo no seu navegador',
      detail: 'O Copilot pode dar respostas melhores com base na página atual e nas abas abertas no SuperPROC. O texto das abas é enviado ao serviço Copilot da Microsoft quando ele consulta uma aba.\n\nVocê pode mudar isso depois em CFG → Configurações.',
      buttons: ['Permitir', 'Não permitir', 'Agora não'], defaultId: 2, cancelId: 2
    });
    return response === 0 ? 'permitir' : response === 1 ? 'negar' : null;
  }

  function mostrar({ aoCancelar } = {}) {
    if (resolver) return Promise.resolve(null); // um cartão por vez; o motor de consentimento já agrupa os pedidos
    const w = janela();
    const limites = limitesDoCartao(getAreaDaColuna());
    if (!w || !limites || !WebContentsView) {
      reg('PERGUNTA_NATIVA');
      return perguntarNativo().catch(() => null);
    }
    return new Promise((resolve) => {
      resolver = resolve;
      aoCancelar?.(() => fechar(null));
      try {
        view = new WebContentsView({ webPreferences: { ...(getSession ? { session: getSession() } : {}), preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
        try { view.setBackgroundColor('#00000000'); } catch (_) { /* fundo opaco não impede o uso */ }
        const wc = view.webContents;
        wc.setWindowOpenHandler(() => ({ action: 'deny' }));
        wc.on('will-navigate', (e) => e.preventDefault());
        wc.on('render-process-gone', () => fechar(null));
        w.contentView.addChildView(view);
        view.setBounds(limites);
        wc.loadFile(ARQUIVO_HTML).catch(() => fechar(null));
      } catch (_) { reg('CARTAO_INDISPONIVEL'); fechar(null); }
    });
  }

  // Chamado pelo IPC guardado. Só vale com o cartão aberto, vindo do próprio cartão, com um booleano.
  function receberDecisao(event, permitir) {
    if (!viva() || !resolver || !event || event.sender !== view.webContents || typeof permitir !== 'boolean') return;
    fechar(permitir ? 'permitir' : 'negar');
  }

  return { mostrar, reposicionar, receberDecisao, fechar: () => fechar(null), getView: () => (viva() ? view : null), aberto: () => !!resolver };
}

module.exports = { ARQUIVO_HTML, PRELOAD, CANAL_DECISAO, limitesDoCartao, criarCartaoConsentimento };
