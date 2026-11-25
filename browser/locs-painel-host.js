'use strict';
// Painel "Meus Localizadores" na shell (camada: host). Janela própria (browser/locs-painel/), fora das páginas do eproc: não é
// reinjetada a cada navegação, então não recarrega nem pisca quando uma página do eproc carrega.
//
// Dados: a base comum no localStorage da origem do eproc (docs/ia/POOL-COMUM.md). Só uma página daquela origem a alcança, por
// isso o host lê as chaves numa aba do eproc (mundo isolado) e guarda um espelho por origem. O espelho é renovado a cada carga
// de página do eproc e entregue ao painel; o que o painel grava (organização e cache da lista) volta para a base pela aba.
// A lista vem da página nativa de Meus Localizadores, buscada numa aba do eproc a cada abertura do painel (sempre atualizada).
//
// Hover: a barra avisa entrada/saída do botão; o painel avisa entrada/saída da janela. Fecha 400 ms depois de o ponteiro sair
// dos dois, salvo se o painel estiver "preso" (arrastando ou digitando). Aberto por clique, ganha o foco e fecha ao perdê-lo.

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const MUNDO = 1098; // mesmo mundo isolado dos botões do eproc na barra (botoes-eproc-barra.js)
const CHAVES_LEITURA = [
  'eproc_locs_grupos_lista', 'eproc_locs_estrutura_ordem', 'eproc_locs_dados_cache', 'eproc_locs_ocultar_vazios',
  'superproc_pool_cores_v1', 'eproc_smartloc_grupos', 'eproc_smartloc_estrutura'
];
// O painel só grava a própria organização e o cache da lista; cores e grupos do Smart são de quem os edita.
const CHAVES_GRAVACAO = new Set(['eproc_locs_grupos_lista', 'eproc_locs_estrutura_ordem', 'eproc_locs_dados_cache', 'eproc_locs_ocultar_vazios']);
const LIMITE = 1024 * 1024;
const LEITURA_VALIDA_MS = 3000;
const FECHAR_MS = 400;
const MARGEM = 0; // sem sombra: a janela transparente a desenhava como um retângulo cinza em volta do painel

const scripts = {
  ler: () => `(() => {
  const o = {};
  for (const k of ${JSON.stringify(CHAVES_LEITURA)}) {
    try { const v = localStorage.getItem(k); if (v !== null && v.length < ${LIMITE}) o[k] = v; } catch (_) {}
  }
  return o;
})()`,
  gravar: (chave, valor) => `(() => { try { localStorage.setItem(${JSON.stringify(chave)}, ${JSON.stringify(valor)}); return true; } catch (_) { return false; } })()`,
  // Busca a página nativa com a sessão desta aba e devolve só nome, quantidade e link de cada localizador.
  buscar: (url) => `(async () => {
  try {
    const destino = ${JSON.stringify(url)};
    const r = await fetch(destino, { credentials: 'same-origin' });
    if (!r.ok) return { erro: 'HTTP ' + r.status };
    const doc = new DOMParser().parseFromString(new TextDecoder('iso-8859-1').decode(await r.arrayBuffer()), 'text/html');
    const linhas = Array.from(doc.querySelectorAll('table.infraTable tr, table[summary*="Localizadores"] tr'));
    const lista = [];
    for (const tr of linhas) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 2) continue;
      const nomeCompleto = tds[0].textContent.trim();
      const link = tds[1].querySelector('a');
      const qtdTexto = tds[1].textContent.trim();
      lista.push({
        nomeCompleto,
        nomeCurto: nomeCompleto.split(/\\s+-\\s+/)[0].trim(),
        qtdTexto,
        link: link && link.getAttribute('href') ? new URL(link.getAttribute('href'), destino).href : null,
        isEmpty: qtdTexto === '0' || !link || !link.getAttribute('href')
      });
    }
    return { lista };
  } catch (e) { return { erro: String(e && e.message || e) }; }
})()`
};

function origemDe(url) { try { return new URL(String(url || '')).origin; } catch (_) { return ''; } }

// deps: { janelaPai() -> BrowserWindow, abasDaOrigem(origem) -> webContents[] (preferida primeiro), permitido(url) -> bool,
//         navegar(url), log(tipo, msg) }
function criarLocsPainel(deps = {}) {
  const log = deps.log || (() => {});
  const abasDaOrigem = deps.abasDaOrigem || (() => []);
  const permitido = deps.permitido || (() => false);
  let janela = null;
  let pronta = false;           // página do painel carregada
  let atual = null;             // { origem, urlLocs, rect, foco } da abertura em curso
  let esperandoTamanho = false; // aberto, aguardando o primeiro tamanho para mostrar a janela já no lugar
  let noBotao = false, noPainel = false, preso = false;
  let timerFechar = null;
  let mostradoEm = 0;
  const paisLigados = new WeakSet();
  const espelhos = new Map();   // origem -> { chaves: {}, lidoEm }
  const pendentes = new Map();  // origem -> Map(chave -> valor) ainda não gravados (nenhuma aba da origem à mão)

  const viva = () => !!janela && !janela.isDestroyed();
  const enviar = (canal, dados) => { if (viva() && pronta && !janela.webContents.isDestroyed()) janela.webContents.send(canal, dados); };
  const noIsolado = (wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: codigo }]);
  const abasProntas = (origem) => abasDaOrigem(origem).filter(wc => wc && !wc.isDestroyed() && permitido(wc.getURL()) && origemDe(wc.getURL()) === origem);

  function preparar() {
    if (viva()) return janela;
    const pai = deps.janelaPai && deps.janelaPai();
    if (!pai || pai.isDestroyed()) return null;
    pronta = false;
    janela = new BrowserWindow({
      parent: pai, frame: false, roundedCorners: false, transparent: true, hasShadow: false, show: false,
      skipTaskbar: true, resizable: false, focusable: true, alwaysOnTop: true, width: 400, height: 300,
      webPreferences: {
        preload: path.join(__dirname, 'locs-painel', 'preload-locs.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        backgroundThrottling: false // mede e desenha antes de aparecer, com a janela ainda escondida
      }
    });
    // Com foco (clique no botão ou no painel), clicar fora fecha. Logo após mostrar, o foco pode oscilar: ignora.
    janela.on('blur', () => { if (atual && Date.now() - mostradoEm > 400) fechar(); });
    janela.on('closed', () => { janela = null; pronta = false; atual = null; esperandoTamanho = false; });
    janela.webContents.on('did-finish-load', () => { pronta = true; if (atual) entregarAbertura(); });
    janela.loadFile(path.join(__dirname, 'locs-painel', 'locs-painel.html'));
    // A janela do navegador mudou de lugar ou de estado: o painel ficaria solto na tela.
    if (!paisLigados.has(pai)) {
      paisLigados.add(pai);
      for (const ev of ['move', 'resize', 'minimize', 'hide']) pai.on(ev, () => fechar());
    }
    return janela;
  }

  // ---- Espelho da base comum ----
  async function lerBase(origem, forcar) {
    const esp = espelhos.get(origem);
    if (!forcar && esp && Date.now() - esp.lidoEm < LEITURA_VALIDA_MS) return esp.chaves;
    for (const wc of abasProntas(origem)) {
      try {
        const r = await noIsolado(wc, scripts.ler());
        if (r && typeof r === 'object') {
          const chaves = {};
          for (const k of CHAVES_LEITURA) if (typeof r[k] === 'string') chaves[k] = r[k];
          // Gravações ainda não entregues continuam valendo sobre o que foi lido.
          const pend = pendentes.get(origem);
          if (pend) for (const [k, v] of pend) chaves[k] = v;
          espelhos.set(origem, { chaves, lidoEm: Date.now(), lido: true });
          return chaves;
        }
      } catch (_) { /* aba no meio de uma navegação: tenta a próxima */ }
    }
    return esp ? esp.chaves : {};
  }

  async function entregarPendentes(origem) {
    const pend = pendentes.get(origem);
    if (!pend || !pend.size) return;
    const abas = abasProntas(origem);
    if (!abas.length) return;
    // Uma gravação por sessão basta: as abas da mesma sessão e origem dividem o localStorage.
    const sessoes = new Set();
    let gravou = false;
    for (const wc of abas) {
      if (sessoes.has(wc.session)) continue;
      sessoes.add(wc.session);
      let ok = true;
      for (const [k, v] of pend) { try { if (await noIsolado(wc, scripts.gravar(k, v)) !== true) ok = false; } catch (_) { ok = false; } }
      gravou = gravou || ok;
    }
    if (gravou) pendentes.delete(origem);
  }

  function gravar(chave, valor) {
    if (!atual || !CHAVES_GRAVACAO.has(chave) || typeof valor !== 'string' || valor.length >= LIMITE) return;
    const origem = atual.origem;
    const esp = espelhos.get(origem);
    // Sem leitura confirmada da base (nenhuma aba do eproc respondeu), o painel desenhou com dados vazios: gravar agora
    // apagaria a organização guardada. Só grava por cima do que de fato foi lido.
    if (!esp || !esp.lido) { log('LOCS_PAINEL', 'Gravação ignorada: base do eproc ainda não lida'); return; }
    esp.chaves[chave] = valor;
    espelhos.set(origem, esp);
    if (!pendentes.has(origem)) pendentes.set(origem, new Map());
    pendentes.get(origem).set(chave, valor);
    entregarPendentes(origem).catch(() => {});
  }

  // Uma página do eproc terminou de carregar: entrega gravações pendentes e renova o espelho (cores ou grupos podem ter mudado).
  async function aoCarregarPagina(wc) {
    if (!wc || wc.isDestroyed() || !permitido(wc.getURL())) return;
    const origem = origemDe(wc.getURL());
    if (!origem) return;
    await entregarPendentes(origem).catch(() => {});
    const antes = JSON.stringify((espelhos.get(origem) || {}).chaves || null);
    const chaves = await lerBase(origem, true);
    if (atual && atual.origem === origem && viva() && janela.isVisible() && JSON.stringify(chaves) !== antes) enviar('locs-chaves', chaves);
  }

  // ---- Geometria ----
  function geometria(rect) {
    const pai = deps.janelaPai && deps.janelaPai();
    if (!pai || pai.isDestroyed()) return null;
    const cb = pai.getContentBounds();
    const direita = Math.round(cb.x + rect.right);
    const topo = Math.round(cb.y + rect.bottom);
    const area = screen.getDisplayNearestPoint({ x: direita, y: topo }).workArea;
    return {
      direita, topo, minX: Math.max(cb.x, area.x),
      larguraMax: Math.max(300, cb.width - 20 - 2 * MARGEM),
      alturaMax: Math.max(200, area.y + area.height - topo - 8 - MARGEM)
    };
  }

  function entregarAbertura() {
    if (!atual || !pronta) return;
    const g = geometria(atual.rect);
    if (!g) return;
    atual.geo = g;
    esperandoTamanho = true;
    enviar('locs-abrir', { urlLocs: atual.urlLocs, chaves: (espelhos.get(atual.origem) || {}).chaves || {}, larguraMax: g.larguraMax, alturaMax: g.alturaMax, foco: !!atual.foco });
  }

  function aplicarTamanho(dim) {
    if (!atual || !atual.geo || !viva()) return;
    const w = Math.max(1, Math.min(4000, Math.round(Number(dim && dim.w) || 0)));
    const h = Math.max(1, Math.min(4000, Math.round(Number(dim && dim.h) || 0)));
    const g = atual.geo;
    // Borda direita do painel alinhada à do botão; sem espaço, encosta na esquerda da janela do navegador.
    const x = Math.max(g.minX, g.direita + MARGEM - (w + 2 * MARGEM));
    const bounds = { x, y: g.topo, width: w + 2 * MARGEM, height: h + MARGEM };
    const b = janela.getBounds();
    if (b.x !== bounds.x || b.y !== bounds.y || b.width !== bounds.width || b.height !== bounds.height) janela.setBounds(bounds);
    if (esperandoTamanho) {
      esperandoTamanho = false;
      mostradoEm = Date.now();
      if (atual.foco) { janela.show(); janela.focus(); } else janela.showInactive();
    }
  }

  // ---- Abrir, fechar, hover ----
  function cancelarFechamento() { clearTimeout(timerFechar); timerFechar = null; }
  function reavaliar() {
    if (!atual) return;
    if (noBotao || noPainel || preso || (atual.foco && viva() && janela.isFocused())) { cancelarFechamento(); return; }
    if (timerFechar) return;
    timerFechar = setTimeout(() => { timerFechar = null; if (!noBotao && !noPainel && !preso && !(atual && atual.foco && viva() && janela.isFocused())) fechar(); }, FECHAR_MS);
  }

  async function abrir(pedido, foco) {
    if (!pedido || typeof pedido.urlLocs !== 'string' || !permitido(pedido.urlLocs)) return false;
    const r = pedido.rect;
    if (!r || ![r.left, r.right, r.bottom].every(Number.isFinite)) return false;
    const origem = origemDe(pedido.urlLocs);
    noBotao = true;
    cancelarFechamento();
    // Já aberto pelo hover e agora clicado: só passa a ter foco (filtro pronto para digitar).
    if (atual && atual.origem === origem && viva() && janela.isVisible()) {
      if (foco && !atual.foco) { atual.foco = true; mostradoEm = Date.now(); janela.focus(); enviar('locs-abrir', { urlLocs: atual.urlLocs, chaves: (espelhos.get(origem) || {}).chaves || {}, larguraMax: atual.geo.larguraMax, alturaMax: atual.geo.alturaMax, foco: true }); }
      return true;
    }
    atual = { origem, urlLocs: pedido.urlLocs, rect: { left: r.left, right: r.right, bottom: r.bottom }, foco: !!foco };
    if (!preparar()) { atual = null; return false; }
    await lerBase(origem, false);
    if (!atual || atual.urlLocs !== pedido.urlLocs) return false; // fechado enquanto lia a base
    entregarAbertura();
    return true;
  }

  function alternar(pedido) {
    if (atual && viva() && janela.isVisible() && atual.foco) { fechar(); return false; }
    return abrir(pedido, true);
  }

  function saiuDoBotao() { noBotao = false; reavaliar(); }

  function fechar() {
    cancelarFechamento();
    const estava = !!atual;
    atual = null; esperandoTamanho = false; noBotao = false; noPainel = false; preso = false;
    if (viva()) { if (janela.isVisible()) janela.hide(); if (estava) enviar('locs-fechar'); }
  }

  async function buscar(urlLocs) {
    if (!atual || urlLocs !== atual.urlLocs) return { erro: 'Painel fechado.' };
    for (const wc of abasProntas(atual.origem)) {
      try {
        const r = await noIsolado(wc, scripts.buscar(urlLocs));
        if (r && Array.isArray(r.lista)) return { lista: r.lista.slice(0, 2000) };
        if (r && r.erro) return { erro: String(r.erro).slice(0, 200) };
      } catch (_) { /* aba no meio de uma navegação: tenta a próxima */ }
    }
    return { erro: 'Nenhuma aba do eproc pronta para buscar a lista.' };
  }

  function navegar(url) {
    if (!atual || typeof url !== 'string') return;
    let ok = false;
    try { ok = new URL(url).origin === atual.origem && permitido(url); } catch (_) { ok = false; }
    fechar();
    if (ok) deps.navegar(url);
    else log('LOCS_PAINEL', 'Navegação recusada: endereço fora do eproc da sessão');
  }

  // Canais da janela do painel (o papel 'locs' em ipc-policy.js só aceita esta janela, neste documento).
  function instalarIpc(ipc) {
    ipc.on('locs-gravar', (_e, d) => { if (d && typeof d === 'object') gravar(String(d.chave || ''), d.valor); });
    ipc.handle('locs-buscar', (_e, url) => buscar(typeof url === 'string' ? url : ''));
    ipc.on('locs-navegar', (_e, url) => navegar(url));
    ipc.on('locs-fechar', () => fechar());
    ipc.on('locs-tamanho', (_e, dim) => aplicarTamanho(dim));
    ipc.on('locs-ponteiro', (_e, est) => {
      if (!est || typeof est !== 'object') return;
      noPainel = est.dentro === true; preso = est.preso === true;
      reavaliar();
    });
  }

  return { preparar, abrir, alternar, saiuDoBotao, fechar, aoCarregarPagina, instalarIpc, getWindow: () => (viva() ? janela : null) };
}

module.exports = { criarLocsPainel, scripts, CHAVES_LEITURA, CHAVES_GRAVACAO };
