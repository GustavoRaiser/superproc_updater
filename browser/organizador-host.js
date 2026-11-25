'use strict';
// Organizador do navegador SuperPROC (camada: host). Janela própria (browser/organizador/) que edita os grupos do Smart
// Localizadores/Eventos e as cores dos localizadores. 100% do navegador: não depende da extensão.
//
// A base fica no localStorage da origem do eproc (docs/ia/POOL-COMUM.md); só uma página daquela origem a alcança. Por isso
// cada leitura/gravação roda, em mundo isolado próprio, numa aba do eproc aberta daquela origem. Depois de gravar, todas as
// abas da origem recebem o evento DOM 'superproc:base-mudou' e redesenham (as outras abas também recebem o evento 'storage').
// Abre por CFG > "Organizar grupos" e pelos botões Organizar dos recursos na página.

const path = require('node:path');
const fs = require('node:fs');

const MUNDO_ORGANIZADOR = 1100;
const LIMITE_BYTES = 1.5 * 1024 * 1024;

function origemEproc(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && /controlador\.php$/i.test(u.pathname) ? u.origin : '';
  } catch (_) { return ''; }
}

let fonteBase = null;
function base() {
  if (fonteBase === null) fonteBase = fs.readFileSync(path.join(__dirname, 'eproc-recursos', 'base.js'), 'utf8');
  return fonteBase;
}
// Roda `corpo` (que enxerga SPBase) na página; `args` vai como JSON.
const naPagina = (corpo, args) => `(() => { ${base()}\n; const ARGS = ${JSON.stringify(args === undefined ? null : args)}; ${corpo} })()`;

const scripts = {
  ler: (tipo) => naPagina(`
    const d = SPBase.lerLocal(ARGS.tipo);
    if (ARGS.tipo === 'loc') d.catalogo = SPBase.lerPool().catalogoLoc;
    return d;`, { tipo }),
  gravar: (tipo, dados) => naPagina(`
    SPBase.gravarLocal(ARGS.tipo, ARGS.dados);
    return true;`, { tipo, dados }),
  lerCores: () => naPagina(`
    const p = SPBase.lerPool();
    return { regras: p.regrasGrupos, proprias: p.proprias, az: p.az };`),
  gravarRegras: (regras) => naPagina(`
    SPBase.mudarPool(p => { p.regrasGrupos = ARGS.regras || {}; });
    return true;`, { regras }),
  gravarCor: (nome, regra) => naPagina(`
    SPBase.mudarPool(p => { if (ARGS.nome && ARGS.nome !== '__proto__') { if (ARGS.regra) p.proprias[ARGS.nome] = ARGS.regra; else delete p.proprias[ARGS.nome]; } });
    return true;`, { nome, regra }),
  avisar: () => `(() => { window.dispatchEvent(new CustomEvent('superproc:base-mudou')); return true; })()`
};

// deps: { abasEproc() -> webContents[] (preferência primeiro), janelaPai() -> BrowserWindow, topo() -> px da barra de título,
//         aoFechar(), log(tipo, msg) }
function criarOrganizadorHost(deps = {}) {
  const log = deps.log || (() => {});
  let janela = null;

  const noIsolado = (wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_ORGANIZADOR, [{ code: codigo }]);

  // Uma aba por origem do eproc (a primeira da lista, que o main ordena pela aba ativa).
  function abasPorOrigem() {
    const mapa = new Map();
    for (const wc of deps.abasEproc() || []) {
      if (!wc || wc.isDestroyed()) continue;
      const o = origemEproc(wc.getURL());
      if (o && !mapa.has(o)) mapa.set(o, wc);
    }
    return mapa;
  }
  function todasDaOrigem(origem) {
    return (deps.abasEproc() || []).filter(wc => wc && !wc.isDestroyed() && origemEproc(wc.getURL()) === origem);
  }
  async function naOrigem(origem, codigo) {
    const wc = abasPorOrigem().get(origem);
    if (!wc) return undefined;
    try { return await noIsolado(wc, codigo); } catch (_) { return undefined; }
  }
  function avisarOrigem(origem) {
    for (const wc of todasDaOrigem(origem)) noIsolado(wc, scripts.avisar()).catch(() => {});
  }
  const tamanhoOk = (v) => { try { return JSON.stringify(v).length <= LIMITE_BYTES; } catch (_) { return false; } };
  const tipoOk = (t) => t === 'loc' || t === 'evt';
  const objeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  const acoes = {
    origens: async () => [...abasPorOrigem().keys()],
    ler: async (tipo) => {
      if (!tipoOk(tipo)) return {};
      const saida = {};
      for (const [o, wc] of abasPorOrigem()) {
        try {
          const d = await noIsolado(wc, scripts.ler(tipo));
          if (d && (d.at || (Array.isArray(d.grupos) && d.grupos.length) || (d.catalogo && d.catalogo.length))) saida[o] = d;
        } catch (_) { /* aba navegando: fica de fora desta leitura */ }
      }
      return saida;
    },
    gravar: async ({ tipo, origem, dados } = {}) => {
      if (!tipoOk(tipo) || !objeto(dados) || !tamanhoOk(dados) || !Array.isArray(dados.grupos) || !objeto(dados.estrutura)) return false;
      const limpo = { grupos: dados.grupos, gruposOcultos: Array.isArray(dados.gruposOcultos) ? dados.gruposOcultos : [], estrutura: dados.estrutura, at: Number(dados.at) || Date.now() };
      const ok = await naOrigem(origem, scripts.gravar(tipo, limpo));
      if (ok) { avisarOrigem(origem); log('ORGANIZADOR', 'Grupos gravados (' + tipo + ')'); }
      return ok === true;
    },
    lerCores: async (origem) => (await naOrigem(origem, scripts.lerCores())) || { regras: {}, proprias: {}, az: {} },
    gravarRegras: async ({ origem, regras } = {}) => {
      if (!objeto(regras) || !tamanhoOk(regras)) return false;
      const ok = await naOrigem(origem, scripts.gravarRegras(regras));
      if (ok) avisarOrigem(origem);
      return ok === true;
    },
    gravarCor: async ({ origem, nome, regra } = {}) => {
      if (typeof nome !== 'string' || !nome || nome.length > 500 || (regra !== null && !objeto(regra))) return false;
      const ok = await naOrigem(origem, scripts.gravarCor(nome, regra));
      if (ok) avisarOrigem(origem);
      return ok === true;
    }
  };

  // O Organizador é um painel DENTRO da janela do navegador (WebContentsView sobre a área abaixo da barra de título), nunca
  // uma janela própria na barra de tarefas. Fecha pelo X do cabeçalho ou por Esc.
  const pai = () => { const w = deps.janelaPai && deps.janelaPai(); return w && !w.isDestroyed() ? w : null; };
  const vivo = () => !!janela && !janela.webContents.isDestroyed();
  function ajustar() {
    const w = pai();
    if (!vivo() || !w) return;
    const [largura, altura] = w.getContentSize();
    const topo = Math.max(0, Number(deps.topo && deps.topo()) || 0);
    w.contentView.addChildView(janela); // já filho: só volta ao topo (acima das abas reposicionadas)
    janela.setBounds({ x: 0, y: topo, width: largura, height: Math.max(0, altura - topo) });
  }
  function fechar() {
    if (!janela) return;
    const v = janela;
    janela = null;
    const w = pai();
    try { if (w) w.contentView.removeChildView(v); } catch (_) {}
    try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch (_) {}
    if (deps.aoFechar) { try { deps.aoFechar(); } catch (_) {} }
    log('ORGANIZADOR', 'Organizador fechado');
  }

  function abrir(modulo = 'loc') {
    const m = modulo === 'evt' ? 'evt' : 'loc';
    const w = pai();
    if (!w) return;
    if (vivo()) {
      try { janela.webContents.send('org-modulo', m); } catch (_) {}
      ajustar();
      janela.webContents.focus();
      return;
    }
    const { WebContentsView } = require('electron');
    janela = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'organizador', 'preload-organizador.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const v = janela;
    v.setBackgroundColor('#f3f4f7');
    v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    v.webContents.on('will-navigate', (e) => e.preventDefault());
    v.webContents.once('did-finish-load', () => { if (janela === v) v.webContents.focus(); });
    v.webContents.once('destroyed', () => { if (janela === v) janela = null; });
    ajustar();
    v.webContents.loadFile(path.join(__dirname, 'organizador', 'organizador.html'), { query: { m } });
    log('ORGANIZADOR', 'Organizador aberto (' + m + ')');
  }

  return { abrir, fechar, ajustar, acoes, getWindow: () => (vivo() ? janela : null), origemEproc };
}

module.exports = { criarOrganizadorHost, origemEproc, MUNDO_ORGANIZADOR };
