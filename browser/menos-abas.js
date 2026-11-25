'use strict';
// Menos abertura de abas (camada: host). Chave em CFG > Configurações > Navegador ("Menos abertura de abas"), ligada por padrão.
//
// Na lista de processos do eproc (lista de um localizador, pesquisas), o clique no número do processo abre o processo NA MESMA
// ABA. Scripts de gestos (de outras extensões ou da própria página) costumam transformar esse clique em aba nova, mesmo com
// target=_self; aqui o clique é capturado em `window` (antes de qualquer ouvinte de documento, inclusive os das extensões),
// cancelado e a navegação é feita na própria aba. Vale também para Ctrl/Shift+clique; o clique do meio (auxclick) não é tocado.
//
// Antes de parar o clique, o script dispara no link o evento `superproc-navegacao-processo` (bolha): é por ele que a extensão
// SuperPROC (módulo "Localizadores - Navegação & Feito Rápido") captura a lista e fecha a árvore, já que o clique original
// deixa de chegar a ela.
//
// Origem: trecho que ficava em extensao-superproc/modules/painel/localizadores_lista.js (movido para a shell em 2026-11-23).
// Segurança: roda em mundo isolado próprio; não lê nem envia nada ao host.

const MUNDO_MENOS_ABAS = 1097;
const EVENTO_NAVEGACAO = 'superproc-navegacao-processo';

// Só páginas do eproc (controlador.php) em http/https.
function permitido(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && /controlador\.php$/i.test(u.pathname);
  } catch (_) { return false; }
}

const scripts = {
  instalar: () => `(() => {
  if (window.__spMenosAbas) return true;
  const CNJ = /\\d{7}-\\d{2}\\.\\d{4}\\.\\d\\.\\d{2}\\.\\d{4}/;
  const aoClicar = (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const link = e.target.closest('a[href*="acao=processo_selecionar"]');
    if (!link || !link.href || !link.closest('table') || !CNJ.test(link.textContent.trim())) return;
    try { link.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTO_NAVEGACAO)}, { bubbles: true })); } catch (_) {}
    e.preventDefault();
    e.stopImmediatePropagation();
    link.setAttribute('target', '_self');
    window.location.assign(link.href);
  };
  window.addEventListener('click', aoClicar, true);
  window.__spMenosAbas = () => window.removeEventListener('click', aoClicar, true);
  return true;
})()`,
  retirar: () => `(() => {
  if (typeof window.__spMenosAbas === 'function') window.__spMenosAbas();
  window.__spMenosAbas = null;
  return true;
})()`
};

// deps: { ativo()->bool, noIsolado(wc, codigo)->Promise, log(tipo, msg) }
function criarMenosAbas(deps = {}) {
  const ativo = deps.ativo || (() => false);
  const noIsolado = deps.noIsolado || ((wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_MENOS_ABAS, [{ code: codigo }]));
  const log = deps.log || (() => {});
  const abas = new Set();

  async function rodar(wc, codigo) {
    try {
      if (!wc || wc.isDestroyed() || !permitido(wc.getURL())) return false;
      await noIsolado(wc, codigo);
      return true;
    } catch (_) { return false; }
  }

  // Acompanha a aba: a cada carga, instala se a chave estiver ligada.
  function ligarNaAba(wc) {
    if (!wc || wc.isDestroyed() || abas.has(wc)) return;
    abas.add(wc);
    wc.once('destroyed', () => abas.delete(wc));
    const instalar = () => { if (ativo()) rodar(wc, scripts.instalar()); };
    wc.on('dom-ready', instalar);
    wc.on('did-finish-load', instalar);
  }

  // Chave mudou: instala ou retira na hora em todas as abas acompanhadas.
  function sincronizar() {
    const ligado = ativo();
    for (const wc of [...abas]) {
      if (!wc || wc.isDestroyed()) { abas.delete(wc); continue; }
      rodar(wc, ligado ? scripts.instalar() : scripts.retirar());
    }
    log('MENOS_ABAS', ligado ? 'Menos abertura de abas ligado' : 'Menos abertura de abas desligado');
  }

  return { ligarNaAba, sincronizar };
}

module.exports = { criarMenosAbas, permitido, scripts, MUNDO_MENOS_ABAS, EVENTO_NAVEGACAO };
