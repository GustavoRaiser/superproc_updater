'use strict';
// Janela flutuante dentro da janela principal (Textos Padrão e Minuta Área de Trabalho do editor).
// Não é uma janela do sistema: são duas views empilhadas por cima de TUDO (editor, árvore, PDF):
//  - "quadro": barra de título, bordas e alças de redimensionar (HTML local);
//  - "conteúdo": a própria página aberta pelo eproc via window.open (mantém opener, sessão e formulários).
// Uma por vez. Posição e tamanho ficam memorizados em arquivo. Dependências injetadas para testar sem Electron.
const path = require('node:path');
const fs = require('node:fs');

const BORDA = 6;
const BARRA = 32;
const MIN_W = 420;
const MIN_H = 300;
const LADOS = new Set(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']);

const inteiro = (v) => Math.round(Number(v));
const finito = (v) => Number.isFinite(Number(v));

/** Mantém o retângulo dentro da área: tamanho mínimo, nunca maior que a área, barra sempre visível. */
function limitarGeometria(g, area) {
  const w = Math.min(Math.max(inteiro(g.w), MIN_W), area.width);
  const h = Math.min(Math.max(inteiro(g.h), MIN_H), area.height);
  const x = Math.min(Math.max(inteiro(g.x), area.x), area.x + area.width - w);
  const y = Math.min(Math.max(inteiro(g.y), area.y), area.y + area.height - BARRA);
  return { x, y, w: Math.min(w, area.width), h: Math.min(h, area.y + area.height - y) };
}

function geometriaPadrao(area) {
  const w = Math.min(1000, Math.round(area.width * 0.7));
  const h = Math.round(area.height * 0.85);
  return limitarGeometria({ x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round(area.height * 0.05), w, h }, area);
}

/** Calcula a nova geometria de um arrasto: 'mover' ou um dos lados/cantos de redimensionar. */
function aplicarArrasto(ini, modo, dx, dy, area) {
  let { x, y, w, h } = ini;
  if (modo === 'mover') { x += dx; y += dy; }
  else {
    if (modo.includes('e')) w = Math.max(MIN_W, ini.w + dx);
    if (modo.includes('s')) h = Math.max(MIN_H, ini.h + dy);
    if (modo.includes('w')) { w = Math.max(MIN_W, ini.w - dx); x = ini.x + ini.w - w; }
    if (modo.includes('n')) { h = Math.max(MIN_H, ini.h - dy); y = ini.y + ini.h - h; }
  }
  return limitarGeometria({ x, y, w, h }, area);
}

function limitesDoConteudo(g) {
  return { x: g.x + BORDA, y: g.y + BARRA, width: Math.max(0, g.w - 2 * BORDA), height: Math.max(0, g.h - BARRA - BORDA) };
}

// CSS que o eproc mostraria numa janela própria e que não faz sentido dentro do quadro.
const ESTILOS = [
  { quando: /texto_padrao_listar/, css: '.navbar-wrapper { display: none !important; }' },
  { quando: /minuta_area_trabalho/, css: '.navbar-wrapper, #divInfraBarraLocalizacao { display: none !important; }' }
];

function criarJanelaFlutuante({ WebContentsView, ipcMain, getMainWindow, getArea, arquivoGeometria, log = () => {} } = {}) {
  let atual = null; // { quadro, conteudo, origem, geom, anterior, visivel, ini }

  const janelaOk = () => { const j = getMainWindow(); return j && !j.isDestroyed() ? j : null; };
  const vivo = (view) => !!(view && view.webContents && !view.webContents.isDestroyed());

  function lerGeometria() {
    try {
      const g = JSON.parse(fs.readFileSync(arquivoGeometria, 'utf8'));
      if (g && ['x', 'y', 'w', 'h'].every((k) => finito(g[k]))) return g;
    } catch (_) { /* primeira vez ou arquivo ilegível: usa o padrão */ }
    return null;
  }
  function gravarGeometria(g) {
    if (!arquivoGeometria) return;
    try { fs.writeFileSync(arquivoGeometria, JSON.stringify({ x: g.x, y: g.y, w: g.w, h: g.h })); } catch (_) { /* só deixa de memorizar */ }
  }

  function aplicarLimites() {
    if (!atual) return;
    atual.geom = limitarGeometria(atual.geom, getArea());
    const { x, y, w, h } = atual.geom;
    if (vivo(atual.quadro)) atual.quadro.setBounds({ x, y, width: w, height: h });
    if (vivo(atual.conteudo)) atual.conteudo.setBounds(limitesDoConteudo(atual.geom));
  }

  function anexar() {
    const janela = janelaOk();
    if (!janela || !atual) return;
    try { janela.contentView.addChildView(atual.quadro); } catch (_) { /* já anexada */ }
    try { janela.contentView.addChildView(atual.conteudo); } catch (_) { /* já anexada */ }
    atual.visivel = true;
    aplicarLimites();
  }
  function desanexar() {
    const janela = janelaOk();
    if (!janela || !atual) return;
    try { janela.contentView.removeChildView(atual.conteudo); } catch (_) { /* já fora */ }
    try { janela.contentView.removeChildView(atual.quadro); } catch (_) { /* já fora */ }
    atual.visivel = false;
  }

  function fechar() {
    if (!atual) return;
    const a = atual; atual = null;
    const janela = janelaOk();
    for (const v of [a.conteudo, a.quadro]) {
      try { if (janela) janela.contentView.removeChildView(v); } catch (_) { /* já fora */ }
      try { if (vivo(v)) v.webContents.destroy(); } catch (_) { /* já destruída */ }
    }
    try { if (vivo(a.origem)) a.origem.webContents.focus(); } catch (_) { /* editor já descartado */ }
    log('JANELA_FLUTUANTE_FECHADA', 'Janela flutuante fechada');
  }

  /** `view`: a view que adota a página aberta por window.open. `origem`: a view do editor que a abriu. */
  function abrir({ view, titulo, origem }) {
    if (!janelaOk()) return;
    fechar();
    const quadro = new WebContentsView({
      webPreferences: { preload: path.join(__dirname, 'janela-flutuante', 'quadro-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false }
    });
    const memorizada = lerGeometria();
    atual = { quadro, conteudo: view, origem, titulo, geom: memorizada || geometriaPadrao(getArea()), anterior: null, visivel: false, ini: null };
    const a = atual;

    quadro.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    quadro.webContents.on('will-navigate', (e) => e.preventDefault());
    quadro.webContents.once('did-finish-load', () => { if (vivo(quadro)) quadro.webContents.send('jf-dados', { titulo }); });
    quadro.webContents.loadFile(path.join(__dirname, 'janela-flutuante', 'quadro.html')).catch(() => {});

    const wc = view.webContents;
    // Navegar para outra janela de dentro da página (window.open) mantém tudo no mesmo quadro.
    wc.setWindowOpenHandler(({ url }) => { try { wc.loadURL(url).catch(() => {}); } catch (_) { /* página destruída */ } return { action: 'deny' }; });
    wc.on('dom-ready', () => {
      const url = wc.getURL();
      for (const e of ESTILOS) if (e.quando.test(url)) wc.insertCSS(e.css).catch(() => {});
    });
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && atual === a) { event.preventDefault(); fechar(); }
    });
    wc.once('destroyed', () => { if (atual === a) fechar(); }); // a própria página chamou window.close()
    const wcOrigem = origem && origem.webContents;
    if (wcOrigem && !wcOrigem.isDestroyed()) wcOrigem.once('destroyed', () => { if (atual === a) fechar(); });

    anexar();
    log('JANELA_FLUTUANTE_ABERTA', 'Janela flutuante aberta', { titulo });
  }

  /** Chamado a cada recálculo de layout: mantém a janela no topo e só a mostra com o editor de origem visível. */
  function sincronizar(origemVisivel) {
    if (!atual) return;
    if (!origemVisivel) { if (atual.visivel) desanexar(); return; }
    const janela = janelaOk();
    if (!janela) return;
    if (!atual.visivel) { anexar(); return; }
    aplicarLimites();
    const filhos = janela.contentView.children || [];
    if (filhos[filhos.length - 1] !== atual.conteudo || filhos[filhos.length - 2] !== atual.quadro) {
      try { janela.contentView.addChildView(atual.quadro); janela.contentView.addChildView(atual.conteudo); } catch (_) { /* janela fechando */ }
    }
  }

  function alternarMaximizada() {
    if (!atual) return;
    if (atual.anterior) { atual.geom = atual.anterior; atual.anterior = null; }
    else { atual.anterior = { ...atual.geom }; const a = getArea(); atual.geom = { x: a.x + 6, y: a.y + 6, w: a.width - 12, h: a.height - 12 }; }
    aplicarLimites();
    if (!atual.anterior) gravarGeometria(atual.geom);
  }

  function instalarIpc() {
    const doQuadro = (event) => atual && vivo(atual.quadro) && event.sender === atual.quadro.webContents;
    ipcMain.on('jf-fechar', (event) => { if (doQuadro(event)) fechar(); });
    ipcMain.on('jf-maximizar', (event) => { if (doQuadro(event)) alternarMaximizada(); });
    ipcMain.on('jf-arrasto', (event, dado) => {
      if (!doQuadro(event) || !dado || typeof dado !== 'object') return;
      if (dado.fase === 'inicio') {
        if (atual.anterior) return; // maximizada: não arrasta
        if (dado.modo !== 'mover' && !LADOS.has(dado.modo)) return;
        atual.ini = { geom: { ...atual.geom }, modo: dado.modo };
      } else if (dado.fase === 'mover' && atual.ini && finito(dado.dx) && finito(dado.dy)) {
        atual.geom = aplicarArrasto(atual.ini.geom, atual.ini.modo, inteiro(dado.dx), inteiro(dado.dy), getArea());
        aplicarLimites();
      } else if (dado.fase === 'fim' && atual.ini) {
        atual.ini = null;
        gravarGeometria(atual.geom);
      }
    });
  }
  if (ipcMain) instalarIpc();

  return {
    abrir, fechar, sincronizar,
    aberta: () => !!atual,
    origem: () => (atual ? atual.origem : null),
    conteudo: () => (atual ? atual.conteudo : null)
  };
}

module.exports = { criarJanelaFlutuante, limitarGeometria, geometriaPadrao, aplicarArrasto, limitesDoConteudo, BORDA, BARRA, MIN_W, MIN_H };
