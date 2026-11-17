'use strict';
// Fast Copilot no Editor (host): janela da caixa de instruções. Uma por vez; resolve com o pedido do usuário
// ou { cancelado: true } (Esc, Cancelar, fechar a janela). Dependências injetadas para testar sem Electron.
const path = require('node:path');

const CAMPOS = ['instrucao', 'alteracao', 'destacar', 'selecao', 'pdf', 'minuta', 'nova'];
const LIMITE_INSTRUCAO = 20000;

// Valida o que veio da janela (nunca confia no renderer): só campos conhecidos, tipos e tamanhos.
function normalizarPedido(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const instrucao = typeof bruto.instrucao === 'string' ? bruto.instrucao.trim() : '';
  if (!instrucao || instrucao.length > LIMITE_INSTRUCAO) return null;
  const pedido = { instrucao };
  for (const campo of CAMPOS.slice(1)) pedido[campo] = bruto[campo] === true;
  return pedido;
}

function criarCaixa({ BrowserWindow, getParent, getLimites, getAreaDeTrabalho, icon } = {}) {
  let win = null, dados = null, resolver = null;

  function concluir(resultado) {
    const r = resolver; resolver = null; dados = null;
    if (r) r(resultado);
    const pai = getParent && getParent();
    if (pai && !pai.isDestroyed() && !(pai.isMinimized && pai.isMinimized())) { try { pai.focus(); } catch (_) {} } // sem isso o Windows ativa outra janela
    if (win && !win.isDestroyed()) { const w = win; win = null; w.destroy(); } else win = null;
  }

  function abrir(info) {
    if (resolver) return Promise.resolve({ cancelado: true, motivo: 'ja-aberta' });
    return new Promise((resolve) => {
      resolver = resolve; dados = info;
      const pai = getParent && getParent();
      const l = (getLimites && getLimites()) || { x: 100, y: 100, width: 900, height: 600 };
      const compacto = !!(info && info.modo === 'alteracao');
      const largura = compacto ? 600 : Math.min(600, Math.max(380, l.width - 40)), altura = compacto ? 126 : 545;
      let px = Math.round(l.x + (l.width - largura) / 2), py = Math.round(l.y + Math.min(60, Math.max(10, l.height * 0.1)));
      const ps = compacto && info.posicao;
      if (ps && Number.isFinite(ps.y) && Number.isFinite(ps.esq)) { // nasce no fim do texto selecionado; se não couber, no ponto mais baixo possível da tela
        const a = (getAreaDeTrabalho && getAreaDeTrabalho(ps.x, ps.y)) || { x: l.x, y: l.y, width: l.width, height: l.height };
        px = Math.round(Math.max(a.x + 8, Math.min(ps.esq, a.x + a.width - largura - 8)));
        py = Math.round(Math.max(a.y + 8, Math.min(ps.y + 6, a.y + a.height - altura - 8)));
      }
      win = new BrowserWindow({
        parent: pai || undefined, frame: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true,
        show: false, alwaysOnTop: false, icon, backgroundColor: '#ffffff',
        x: px, y: py, width: largura, height: altura,
        webPreferences: { preload: path.join(__dirname, 'fast-copilot-box/box-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: true }
      });
      win.setMenuBarVisibility && win.setMenuBarVisibility(false);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (e) => e.preventDefault());
      win.once('ready-to-show', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
      win.on('closed', () => { win = null; if (resolver) { const r = resolver; resolver = null; dados = null; r({ cancelado: true }); } });
      win.loadFile(path.join(__dirname, 'fast-copilot-box/box.html'));
    });
  }

  // Canais da janela. hostIPC valida que o remetente é a própria janela local.
  function installIpc(hostIPC) {
    hostIPC.handle('fc-box-get', () => dados || {});
    hostIPC.on('fc-box-submit', (event, bruto) => {
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      const pedido = normalizarPedido(bruto);
      if (pedido) concluir({ cancelado: false, pedido });
    });
    hostIPC.on('fc-box-cancel', (event) => {
      if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
      concluir({ cancelado: true });
    });
  }

  return { abrir, installIpc, getWindow: () => (win && !win.isDestroyed() ? win : null), fechar: () => concluir({ cancelado: true }), estaAberta: () => !!resolver };
}

module.exports = { criarCaixa, normalizarPedido, LIMITE_INSTRUCAO };
