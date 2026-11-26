'use strict';
// Botões do eproc na barra (camada: host). Chave em CFG > Configurações > Navegador ("Início e Meus Localizadores na barra"),
// ligada por padrão. 100% do navegador: não depende da extensão SuperPROC.
//
// Depois do login, a página do eproc tem na navbar #btn-home e #btn-meus-localizadores. O host os "rapta": esconde-os na
// página (estilo injetado em mundo isolado próprio) e a barra do navegador mostra dois botões equivalentes:
//   - Início: clica no #btn-home original (escondido), então segue exatamente a lógica dele;
//   - Meus Localizadores: abre o painel em colunas por hover ou clique. O painel é uma janela da shell
//     (locs-painel-host.js), fora das páginas: não é reinjetado nem recarregado quando uma página do eproc carrega.
// Na tela de login esses botões não existem: nada é raptado e a barra não mostra nada.

const MUNDO_BOTOES_EPROC = 1098;
const ESTILO_ID = 'sp-botoes-eproc-barra';
// Marca no localStorage do eproc: o tab-preload.js a lê no início de cada página (antes de qualquer desenho) e já injeta o
// CSS que esconde os botões. Assim eles nunca aparecem, nem por um instante, enquanto a chave estiver ligada.
const MARCA_STORAGE = '__superproc_botoes_eproc_barra';
// Qualquer elemento construído com a identificação dos botões, e o contêiner que só os agrupa, fica oculto.
const CSS_OCULTAR = '#btn-home, #btn-meus-localizadores { display: none !important; }'
  + ' div:has(> #btn-home):has(> #btn-meus-localizadores) { display: none !important; }';

// Só páginas do eproc (controlador.php) em http/https.
function permitido(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && /controlador\.php$/i.test(u.pathname);
  } catch (_) { return false; }
}

// Páginas do eproc onde os botões NÃO são raptados (ficam como o eproc os mostra): edição da minuta.
const ACOES_SEM_RAPTO = ['minuta_editar'];
function raptoExcluido(url) {
  try { return ACOES_SEM_RAPTO.includes((new URL(String(url || '')).searchParams.get('acao') || '').toLowerCase()); } catch (_) { return false; }
}

const scripts = {
  // Esconde os botões da navbar e devolve os endereços absolutos (ou null, se a página não os tem: login, iframes etc.).
  raptar: () => `(() => {
  try { localStorage.setItem(${JSON.stringify(MARCA_STORAGE)}, '1'); } catch (_) {}
  if (!document.getElementById(${JSON.stringify(ESTILO_ID)})) {
    const st = document.createElement('style');
    st.id = ${JSON.stringify(ESTILO_ID)};
    st.textContent = ${JSON.stringify(CSS_OCULTAR)};
    (document.head || document.documentElement).appendChild(st);
  }
  const home = document.getElementById('btn-home');
  const locs = document.getElementById('btn-meus-localizadores');
  if (!home || !locs) return null;
  return { home: home.href || '', locs: locs.href || '' };
})()`,
  devolver: () => `(() => {
  try { localStorage.removeItem(${JSON.stringify(MARCA_STORAGE)}); } catch (_) {}
  document.getElementById(${JSON.stringify(ESTILO_ID)})?.remove();
  document.getElementById('sp-botoes-eproc-barra-cedo')?.remove(); // estilo posto cedo pelo tab-preload.js
  return true;
})()`,
  clicarInicio: (href) => `(() => {
  const b = document.getElementById('btn-home');
  if (b) { b.click(); return true; }
  const destino = ${JSON.stringify(String(href || ''))};
  if (destino) { location.assign(destino); return true; }
  return false;
})()`
};

// deps: { ativo()->bool, aoMudar(), aoCarregar(wc), log(tipo, msg), noIsolado(wc, codigo) }
function criarBotoesEproc(deps = {}) {
  const ativo = deps.ativo || (() => false);
  const aoMudar = deps.aoMudar || (() => {});
  const aoCarregar = deps.aoCarregar || (() => {});
  const log = deps.log || (() => {});
  const noIsolado = deps.noIsolado || ((wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_BOTOES_EPROC, [{ code: codigo }]));
  const abas = new Set();
  const estados = new WeakMap(); // wc -> { home, locs } quando a página atual tem os botões

  async function rodar(wc, codigo) {
    if (!wc || wc.isDestroyed() || !permitido(wc.getURL())) return undefined;
    try { return await noIsolado(wc, codigo); } catch (_) { return undefined; }
  }

  async function raptar(wc) {
    // Chave desligada: devolve os botões (o preload pode tê-los escondido por uma marca de quando estava ligada).
    if (!ativo()) { await rodar(wc, scripts.devolver()); if (estados.has(wc)) { estados.delete(wc); aoMudar(); } return; }
    // Página excluída (edição da minuta): não esconde nada nesta página.
    if (raptoExcluido(wc.getURL())) { if (estados.has(wc)) { estados.delete(wc); aoMudar(); } return; }
    const r = await rodar(wc, scripts.raptar());
    const novo = r && typeof r.home === 'string' && typeof r.locs === 'string' && r.home && r.locs ? { home: r.home, locs: r.locs } : null;
    const antes = estados.get(wc) || null;
    if (novo) estados.set(wc, novo); else estados.delete(wc);
    if (JSON.stringify(antes) !== JSON.stringify(novo)) aoMudar();
  }

  function ligarNaAba(wc) {
    if (!wc || wc.isDestroyed() || abas.has(wc)) return;
    abas.add(wc);
    wc.once('destroyed', () => { abas.delete(wc); aoMudar(); });
    wc.on('dom-ready', () => { raptar(wc); });
    // Página pronta: além de raptar, avisa o painel de localizadores (renova o espelho da base comum).
    wc.on('did-finish-load', () => { raptar(wc); aoCarregar(wc); });
  }

  // Clica no #btn-home original (escondido) se a página o tem; senão vai ao endereço de Início memorizado na sessão.
  function clicarInicio(wc, href) { return rodar(wc, scripts.clicarInicio(href)); }

  // Chave mudou: rapta ou devolve os botões na hora em todas as abas acompanhadas.
  function sincronizar() {
    const ligado = ativo();
    for (const wc of [...abas]) {
      if (!wc || wc.isDestroyed()) { abas.delete(wc); continue; }
      if (ligado) raptar(wc);
      else { estados.delete(wc); rodar(wc, scripts.devolver()); }
    }
    aoMudar();
    log('BOTOES_EPROC', ligado ? 'Botões do eproc na barra ligados' : 'Botões do eproc na barra desligados');
  }

  return { ligarNaAba, sincronizar, estado: (wc) => estados.get(wc) || null, clicarInicio, permitido };
}

module.exports = { criarBotoesEproc, permitido, raptoExcluido, ACOES_SEM_RAPTO, scripts, MUNDO_BOTOES_EPROC, MARCA_STORAGE, CSS_OCULTAR };
