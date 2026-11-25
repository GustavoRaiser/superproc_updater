'use strict';
// Recursos do eproc portados da extensão para o navegador SuperPROC (camada: host). 100% do navegador, sem a extensão.
// Chaves em CFG > Configurações > Navegador:
//   - "Smart Localizadores & Eventos" (smartLocsEventos): eproc-recursos/smart-localizadores.js (mundo isolado) e
//     eproc-recursos/smart-eventos.js (mundo principal, usa o jQuery da página);
//   - Editor: Botões Visíveis (editor_limpar_painel): eproc-recursos/editor-botoes.js (mundo isolado 1105), só em acao=minuta_editar;
//   - Editor: Arrumar Altura (editor_arrumar_altura): eproc-recursos/editor-altura.js (mesmo mundo 1105), só em acao=minuta_editar;
//   - "Localizadores Coloridos" (localizadoresColoridos): eproc-recursos/localizadores-coloridos.js (mundo isolado).
// Os dados ficam na base comum do localStorage do eproc (docs/ia/POOL-COMUM.md), compartilhada com a extensão.
//
// Módulos controlados pelo navegador: a lista vai para o localStorage do eproc (__superproc_navegador_modulos) e o
// tab-preload.js a publica no início de cada página em <html data-superproc-navegador-modulos="id1 id2">, com os MESMOS ids
// dos módulos equivalentes da extensão. Uma versão futura da extensão poderá ler essa marca e mostrar
// "CONTROLADO PELO NAVEGADOR" nesses módulos. Desligar uma chave vale a partir do próximo carregamento da página.

const fs = require('node:fs');
const path = require('node:path');

const MUNDO_SMART = 1101;
const MUNDO_COLORIDOS = 1102;
const MUNDO_MARCA = 1103;
const MUNDO_PAINEL = 1104;
const MUNDO_EDITOR = 1105;
const CHAVE_MODULOS = '__superproc_navegador_modulos';
const MODULOS_SMART = ['geral_smart_localizadores', 'geral_smart_eventos'];
const MODULOS_COLORIDOS = ['painel_localizadores_coloridos'];
const MODULOS_BARRA = ['painel_menu_lateral_locs'];
const MODULOS_PAINEL = ['painel_principal']; // Painel livre: sempre do navegador (engrenagem no painel da secretaria)
const MODULOS_EDITOR = ['editor_limpar_painel', 'editor_arrumar_altura']; // Editor: Botões Visíveis (barra do CKEditor) e Arrumar Altura (ajuste à janela + fecha o Lembrete da abertura), sempre do navegador na tela minuta_editar

function permitido(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && /controlador\.php$/i.test(u.pathname);
  } catch (_) { return false; }
}
const acaoDe = (url) => { try { return new URL(url).searchParams.get('acao') || ''; } catch (_) { return ''; } };

const fontes = {};
function fonte(arquivo) {
  if (!fontes[arquivo]) fontes[arquivo] = fs.readFileSync(path.join(__dirname, 'eproc-recursos', arquivo), 'utf8');
  return fontes[arquivo];
}
const comBase = (arquivo) => `(() => { ${fonte('base.js')}\n;${fonte(arquivo)}\n; return true; })()`;

// ---- Base embutida (eproc-recursos/base-embutida.json) ----
// Eventos da "Base do Tribunal" e localizadores de sistema, para o Smart e o Organizador já terem as listas antes da primeira
// captura. Só vale na origem em que foi capturada e só semeia o que estiver vazio: nada do que o usuário organizou é tocado.
// Depois, a captura nas páginas (localizadores) e a verificação diária na minuta (eventos) mantêm tudo atualizado.
let baseEmbutida;
function lerBaseEmbutida() {
  if (baseEmbutida !== undefined) return baseEmbutida;
  try {
    const b = JSON.parse(fs.readFileSync(path.join(__dirname, 'eproc-recursos', 'base-embutida.json'), 'utf8'));
    baseEmbutida = b && b.versao === 1 && typeof b.origem === 'string' ? b : null;
  } catch (_) { baseEmbutida = null; }
  return baseEmbutida;
}
// Leve: diz só o que falta. A base (130 KB) só vai à página quando há algo a semear.
const scriptFaltaSemente = () => `(() => { ${fonte('base.js')}
  const evt = SPBase.lerLocal('evt');
  const base = evt.estrutura && evt.estrutura[SPBase.GRUPO_BASE_EVENTOS];
  const loc = SPBase.lerLocal('loc');
  const locVazio = !SPBase.lerPool().catalogoLoc.length && !Object.values(loc.estrutura || {}).some(l => Array.isArray(l) && l.length);
  return { evt: !(Array.isArray(base) && base.length), loc: locVazio };
})()`;
const scriptSemear = (b, falta) => `(() => { ${fonte('base.js')}
  const B = ${JSON.stringify({ em: b.em, eventos: falta.evt ? b.eventos : [], locs: falta.loc ? b.localizadoresSistema : [] })};
  const agora = Date.now();
  if (B.eventos.length) {
    const d = SPBase.lerLocal('evt');
    const grupos = Array.isArray(d.grupos) ? d.grupos.slice() : [];
    if (!grupos.includes(SPBase.GRUPO_BASE_EVENTOS)) grupos.push(SPBase.GRUPO_BASE_EVENTOS);
    const estrutura = d.estrutura && typeof d.estrutura === 'object' ? d.estrutura : {};
    if (!Array.isArray(estrutura[SPBase.GRUPO_BASE_EVENTOS]) || !estrutura[SPBase.GRUPO_BASE_EVENTOS].length) estrutura[SPBase.GRUPO_BASE_EVENTOS] = B.eventos;
    if (!estrutura[SPBase.SEM_GRUPO]) estrutura[SPBase.SEM_GRUPO] = [];
    SPBase.gravarLocal('evt', { grupos, estrutura, at: agora });
    // Data da base embutida, não a de hoje: a verificação diária na minuta continua conferindo a lista do eproc.
    try { localStorage.setItem('eproc_smarteventos_base_em', B.em); } catch (_) {}
  }
  if (B.locs.length) {
    SPBase.mudarPool(p => { if (!p.catalogoLoc.length) p.catalogoLoc = B.locs; });
    const d = SPBase.lerLocal('loc');
    if (!Object.values(d.estrutura || {}).some(l => Array.isArray(l) && l.length)) {
      // Mesma regra da captura (smart-localizadores.js): nome todo em maiúsculas vai para SISTEMA.
      SPBase.gravarLocal('loc', { grupos: ['SISTEMA'], estrutura: { [SPBase.SEM_GRUPO]: [], SISTEMA: B.locs.map(l => l.value) }, at: agora });
    }
  }
  return true;
})()`;

// deps: { smartLigado(), coloridosLigado(), barraLigada(), log(tipo, msg) }
function criarRecursosEproc(deps = {}) {
  const smartLigado = deps.smartLigado || (() => false);
  const coloridosLigado = deps.coloridosLigado || (() => false);
  const barraLigada = deps.barraLigada || (() => false);
  const log = deps.log || (() => {});
  const abas = new Set();

  function modulosControlados() {
    return [...(smartLigado() ? MODULOS_SMART : []), ...(coloridosLigado() ? MODULOS_COLORIDOS : []), ...(barraLigada() ? MODULOS_BARRA : []), ...MODULOS_PAINEL, ...MODULOS_EDITOR];
  }
  const scriptMarca = () => {
    const lista = modulosControlados();
    return `(() => {
  const lista = ${JSON.stringify(lista)};
  try { if (lista.length) localStorage.setItem(${JSON.stringify(CHAVE_MODULOS)}, JSON.stringify(lista)); else localStorage.removeItem(${JSON.stringify(CHAVE_MODULOS)}); } catch (_) {}
  if (lista.length) document.documentElement.setAttribute('data-superproc-navegador-modulos', lista.join(' '));
  else document.documentElement.removeAttribute('data-superproc-navegador-modulos');
  return true;
})()`;
  };

  // Painel livre: CSS inicial (véu e blocos ocultos), compilado pela engrenagem e guardado no localStorage da origem. É lido e
  // injetado na confirmação da navegação, antes de a página pintar (o tab-preload.js não está ligado às abas), e removido assim
  // que o módulo reorganiza o painel. Só vive entre a navegação e o dom-ready; nada fica guardado no host.
  const cssCedo = new WeakMap();      // wc -> chave do insertCSS
  const painelPronto = new WeakSet(); // wc cujo módulo já terminou nesta navegação
  async function cssInicialDoPainel(wc, url) {
    if (!wc || wc.isDestroyed()) return;
    painelPronto.delete(wc);
    if (acaoDe(url) !== 'painel_secretaria_listar' || !permitido(url)) return;
    try {
      const css = await wc.executeJavaScriptInIsolatedWorld(MUNDO_PAINEL, [{ code: "(() => { try { return localStorage.getItem('superproc_painel_livre_css_v1') || ''; } catch (_) { return ''; } })()" }]);
      if (typeof css !== 'string' || !css || css.length > 8000 || wc.isDestroyed() || wc.getURL() !== url) return;
      const chave = await wc.insertCSS(css);
      // Medido: o CSS pode chegar depois de o painel já estar no DOM. Se o módulo já terminou, ele não serve mais e sai na hora
      // (senão o véu esconderia o painel já organizado).
      if (painelPronto.has(wc)) wc.removeInsertedCSS(chave).catch(() => {}); else cssCedo.set(wc, chave);
    } catch (_) { /* sem CSS inicial: o módulo reorganiza no dom-ready, com um piscar */ }
  }
  function tirarCssCedo(wc) {
    const chave = cssCedo.get(wc);
    if (!chave) return;
    cssCedo.delete(wc);
    wc.removeInsertedCSS(chave).catch(() => {});
  }

  async function injetar(wc) {
    if (!wc || wc.isDestroyed()) return;
    const url = wc.getURL();
    if (!permitido(url)) return;
    const iso = (mundo, codigo) => wc.executeJavaScriptInIsolatedWorld(mundo, [{ code: codigo }]).catch(() => {});
    iso(MUNDO_MARCA, scriptMarca());
    // Painel livre: só na tela do painel da secretaria. O código é lido do disco a cada ativação e não fica guardado no host.
    if (acaoDe(url) === 'painel_secretaria_listar') {
      let codigo = '';
      try { codigo = fs.readFileSync(path.join(__dirname, 'eproc-recursos', 'painel-livre.js'), 'utf8'); } catch (_) { codigo = ''; }
      if (codigo) await iso(MUNDO_PAINEL, `(() => { ${codigo}
; return true; })()`);
      painelPronto.add(wc);
      tirarCssCedo(wc);
    }
    // Editor: Botões Visíveis, só na tela da minuta (acao=minuta_editar). Lido do disco a cada ativação; o próprio script tem a guarda
    // contra repetição (dom-ready e did-finish-load chamam esta função duas vezes) e vive só enquanto a página existir.
    if (acaoDe(url) === 'minuta_editar') {
      for (const arquivo of ['editor-botoes.js', 'editor-altura.js']) {
        let codigoEditor = '';
        try { codigoEditor = fs.readFileSync(path.join(__dirname, 'eproc-recursos', arquivo), 'utf8'); } catch (_) { codigoEditor = ''; }
        if (codigoEditor) iso(MUNDO_EDITOR, `(() => { ${codigoEditor}
; return true; })()`);
      }
    }
    if (smartLigado()) {
      await semearSePreciso(wc, url);
      if (wc.isDestroyed() || wc.getURL() !== url) return;
      if (acaoDe(url) !== 'processo_selecionar') iso(MUNDO_SMART, comBase('smart-localizadores.js'));
      // Mundo principal (como na extensão): o lançamento do evento usa o jQuery do eproc. Guarda própria contra repetição.
      wc.executeJavaScript(`(() => { ${fonte('smart-eventos.js')}\n; return true; })()`, false).catch(() => {});
    }
    if (coloridosLigado()) iso(MUNDO_COLORIDOS, comBase('localizadores-coloridos.js'));
  }

  // Semeia a base embutida onde a lista local ainda está vazia (primeiro uso do perfil naquela origem do eproc).
  async function semearSePreciso(wc, url) {
    const b = lerBaseEmbutida();
    if (!b) return;
    let origem = '';
    try { origem = new URL(url).origin; } catch (_) { return; }
    if (origem !== b.origem) return;
    try {
      const falta = await wc.executeJavaScriptInIsolatedWorld(MUNDO_SMART, [{ code: scriptFaltaSemente() }]);
      if (!falta || (!falta.evt && !falta.loc)) return;
      await wc.executeJavaScriptInIsolatedWorld(MUNDO_SMART, [{ code: scriptSemear(b, falta) }]);
      log('SMART_BASE_EMBUTIDA', 'Base embutida semeada: ' + [falta.evt && 'eventos', falta.loc && 'localizadores de sistema'].filter(Boolean).join(' e '));
    } catch (_) { /* página no meio de uma navegação: tenta na próxima carga */ }
  }

  function ligarNaAba(wc) {
    if (!wc || wc.isDestroyed() || abas.has(wc)) return;
    abas.add(wc);
    wc.once('destroyed', () => abas.delete(wc));
    const aoCarregar = () => { injetar(wc); };
    wc.on('dom-ready', aoCarregar);
    wc.on('did-finish-load', aoCarregar);
    wc.on('did-navigate', (_evento, url) => { cssInicialDoPainel(wc, url); });
  }

  // Chave mudou: liga na hora nas abas abertas; desligar vale a partir do próximo carregamento (a marca muda já).
  function sincronizar() {
    for (const wc of [...abas]) {
      if (!wc || wc.isDestroyed()) { abas.delete(wc); continue; }
      injetar(wc);
    }
    log('RECURSOS_EPROC', 'Smart: ' + (smartLigado() ? 'ligado' : 'desligado') + '; Coloridos: ' + (coloridosLigado() ? 'ligado' : 'desligado'));
  }

  return { ligarNaAba, sincronizar, modulosControlados, permitido };
}

module.exports = { criarRecursosEproc, permitido, CHAVE_MODULOS, MODULOS_SMART, MODULOS_COLORIDOS, MODULOS_BARRA, MODULOS_PAINEL, MODULOS_EDITOR };
