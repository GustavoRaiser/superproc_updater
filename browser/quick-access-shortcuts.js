'use strict';
/**
 * SuperPROC - Atalhos do Acesso Rápido no host.
 * Escuta as teclas de todas as páginas da janela principal (abas, painel lateral, barra superior)
 * ANTES de a página recebê-las. Um atalho que combina com um único link abre o painel direto;
 * combinando com 2 ou mais, abre uma janela de escolha centralizada no mouse.
 */
const path = require('path');
const core = require('./quick-shortcut-core');
const { ehColunaCopilot } = require('./copilot-column');

const ESPERA_FECHAR_MS = 1000;

function create({ app, BrowserWindow, screen, webContents, ipcMain, getMainWindow, getConfig, openLink, isOpenLink, closeLink, beforeOpen, ignorarTecla }) {
  let win = null;
  let pendente = [];
  let seq = 0;
  let temporizador = null;
  let vigia = null;
  let posicao = null; // { cursor, workArea, height, seq } aguardando a largura medida pela janela
  const ligados = new WeakSet();

  function esconder() {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide();
    pendente = [];
    posicao = null;
    clearTimeout(temporizador);
    clearInterval(vigia);
    vigia = null;
  }

  /** Fecha o menu se o mouse ficar fora dele por 1 s seguido; voltar para cima dele zera a contagem. */
  function vigiarMouse(bounds) {
    clearInterval(vigia);
    let foraDesde = null;
    vigia = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      const dentro = c.x >= bounds.x && c.x < bounds.x + bounds.width && c.y >= bounds.y && c.y < bounds.y + bounds.height;
      if (dentro) { foraDesde = null; return; }
      if (foraDesde === null) foraDesde = Date.now();
      else if (Date.now() - foraDesde >= ESPERA_FECHAR_MS) esconder();
    }, 100);
    if (vigia.unref) vigia.unref();
  }

  function exibir(largura) {
    clearTimeout(temporizador);
    if (!posicao || !win || win.isDestroyed()) return;
    const l = Math.max(80, Math.min(Number(largura) || 0, posicao.workArea.width));
    const bounds = core.posicionarMenu({ cursor: posicao.cursor, workArea: posicao.workArea, width: l, height: posicao.height });
    win.setBounds(bounds);
    win.show();
    win.focus();
    vigiarMouse(bounds);
  }

  function obterJanela() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      parent: getMainWindow() || undefined,
      frame: false, roundedCorners: false, transparent: true, hasShadow: false, show: false,
      skipTaskbar: true, resizable: false, alwaysOnTop: true, width: 280, height: 100,
      webPreferences: { preload: path.join(__dirname, 'quick-chooser', 'preload-chooser.js'), contextIsolation: true, backgroundThrottling: false }
    });
    win.on('blur', esconder);
    win.on('closed', () => { win = null; pendente = []; });
    win.loadFile(path.join(__dirname, 'quick-chooser', 'chooser.html'));
    return win;
  }

  function mostrarMenu(achados) {
    if (beforeOpen) beforeOpen();
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const layout = core.organizarMenu(achados);
    // Os índices do layout (e do clique) valem para a ordem do menu: links sem grupo primeiro.
    pendente = layout.ordem.map(i => achados[i]);
    const tam = core.tamanhoMenu(layout);
    const janela = obterJanela();
    // Provisório e oculto: a largura final é medida pela janela (maior item) e só então ela aparece.
    janela.setBounds({ x: display.workArea.x, y: display.workArea.y, width: tam.width, height: tam.height });
    posicao = { cursor, workArea: display.workArea, height: tam.height, seq: ++seq, estimada: tam.width };
    // Rede de segurança: se a janela não responder a medição, abre com a largura estimada.
    clearTimeout(temporizador);
    temporizador = setTimeout(() => exibir(posicao && posicao.estimada), 300);
    if (temporizador.unref) temporizador.unref();
    const dados = {
      seq, colunas: tam.colunas, linhas: tam.linhas, agrupado: layout.agrupado, linhasSolto: layout.linhasSolto, layout: layout.colunas,
      itens: pendente.map(a => ({ nome: a.nome }))
    };
    const enviar = () => {
      if (janela.isDestroyed()) return;
      janela.webContents.send('quick-chooser-data', dados);
    };
    if (janela.webContents.isLoading()) janela.webContents.once('did-finish-load', enviar);
    else enviar();
  }

  /** Retorna true se a tecla foi tratada (e já bloqueada para a página). */
  function tratarTecla(event, input, wc) {
    if (!input || input.type !== 'keyDown' || input.isAutoRepeat) return false;
    if (ehColunaCopilot(wc)) return false; // a coluna do Copilot só aceita F5
    if (ignorarTecla && ignorarTecla(input)) return false; // combinação reservada a outra função (ex.: colar PDF no Copilot)
    const principal = getMainWindow();
    if (!principal || principal.isDestroyed()) return false;
    // Diálogos, menus flutuantes e janelas de aba nativa são janelas próprias: não disparam.
    const dono = wc ? BrowserWindow.fromWebContents(wc) : null;
    if (dono && dono !== principal) return false;
    const achados = core.coletarCorrespondencias(getConfig(), input);
    if (!achados.length) return false;
    event.preventDefault();
    if (achados.length === 1) {
      if (beforeOpen) beforeOpen();
      // Repetir o atalho do link que já está no painel fecha o painel (alterna).
      if (isOpenLink && closeLink && isOpenLink(achados[0])) closeLink(achados[0]);
      else openLink(achados[0]);
    } else {
      mostrarMenu(achados);
    }
    return true;
  }

  function ligar(wc) {
    if (!wc || ligados.has(wc)) return;
    ligados.add(wc);
    wc.on('before-input-event', (event, input) => tratarTecla(event, input, wc));
  }

  function instalar() {
    app.on('web-contents-created', (_e, wc) => ligar(wc));
    for (const wc of webContents.getAllWebContents()) ligar(wc);
    const allowed = event => require('./ipc-policy').isLocalFrame(event, win?.webContents, path.join(__dirname, 'quick-chooser/chooser.html'));
    ipcMain.on('quick-chooser-pick', (event, indice) => {
      if (!allowed(event) || !Number.isInteger(indice) || indice < 0) return;
      const escolhido = pendente[indice];
      esconder();
      if (escolhido) openLink(escolhido);
    });
    ipcMain.on('quick-chooser-size', (event, dados) => {
      if (!allowed(event)) return;
      if (!posicao || !dados || dados.seq !== posicao.seq) return;
      exibir(dados.width);
    });
    ipcMain.on('quick-chooser-close', event => { if (allowed(event)) esconder(); });
  }

  return { instalar, tratarTecla, mostrarMenu, esconder };
}

module.exports = { create };
