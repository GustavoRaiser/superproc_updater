'use strict';
/**
 * SuperPROC - Busca na página (Ctrl+F): motor próprio e controlador.
 *
 * - A busca nativa do Electron (webContents.findInPage) só oferece "diferenciar maiúsculas de minúsculas".
 *   Não existe "palavras inteiras". Quando essa opção está ativa, a busca é feita por este motor, que varre o
 *   texto de cada frame e pinta as ocorrências com a API de realce do Chromium (CSS Custom Highlight API).
 * - O mesmo varredor atende o Glossário (lista de ocorrências com contexto e salto até uma delas), para que
 *   contagem, realce e Glossário usem sempre a mesma regra de correspondência.
 * - O controlador reúne a lógica de "pesquisar / próximo / parar" para a busca nativa e para o motor próprio.
 */

// ---------------------------------------------------------------------------
// Código executado DENTRO de cada frame (serializado com toString; precisa ser autocontido).
// ---------------------------------------------------------------------------
// `recortar` = superprocRecortarContexto (recorte-contexto.js), passado junto no código injetado.
function superprocFindFrame(op, arg, recortar) {
  const STYLE_ID = '__superproc-find-style';
  const state = window.__superprocFind || (window.__superprocFind = { ranges: [], active: -1 });
  const WORD = '[\\p{L}\\p{N}_]';
  const hasHighlights = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';
  arg = arg || {};

  function buildRegex(term, matchCase, wholeWord) {
    const text = String(term || '').trim();
    if (!text) return null;
    const escaped = text.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&').replace(/\s+/g, '\\s+');
    const startsWord = new RegExp('^' + WORD, 'u').test(text);
    const endsWord = new RegExp(WORD + '$', 'u').test(text);
    const pattern = (wholeWord && startsWord ? '(?<!' + WORD + ')' : '') + escaped +
      (wholeWord && endsWord ? '(?!' + WORD + ')' : '');
    return new RegExp(pattern, matchCase ? 'gu' : 'giu');
  }

  function isRendered(el, cache) {
    if (cache.has(el)) return cache.get(el);
    let ok = true;
    try {
      if (typeof el.checkVisibility === 'function') {
        ok = el.checkVisibility({ visibilityProperty: true });
      } else {
        const style = window.getComputedStyle(el);
        ok = style.display !== 'none' && style.visibility !== 'hidden';
      }
    } catch (_) { ok = true; }
    cache.set(el, ok);
    return ok;
  }

  // Percorredor de texto visível (ignora script, style, ocultos etc.).
  function makeWalker() {
    const root = document.body || document.documentElement;
    if (!root) return null;
    const cache = new Map();
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest && parent.closest('script, style, noscript, svg, canvas, iframe, textarea')) {
          return NodeFilter.FILTER_REJECT;
        }
        return isRendered(parent, cache) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
  }

  // Ferramentas do contexto do Glossário: percorredor de texto visível + <br>, bloco de cada nó e texto do nó
  // com '\n' só onde o CSS preserva quebras (mesmo comprimento do original, para manter os índices).
  function contextTools() {
    const root = document.body || document.documentElement;
    const visible = new Map();
    const blocks = new Map();
    const preserves = new Map();
    const style = (el) => { try { return window.getComputedStyle(el); } catch (_) { return null; } };
    const walker = root ? document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches('script, style, noscript, svg, canvas, iframe, textarea')) return NodeFilter.FILTER_REJECT;
          // display:contents não tem caixa própria (checkVisibility = false), mas os filhos aparecem.
          if (!isRendered(node, visible) && (style(node) || {}).display !== 'contents') return NodeFilter.FILTER_REJECT;
          return node.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        return node.parentElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }) : null;

    // Bloco = ancestral mais próximo que não é "inline". Na camada de texto de um PDF (pdf.js), os trechos são
    // posicionados de forma absoluta (viram "block"), mas formam o texto corrido da página: a camada é o bloco.
    function blockOf(node) {
      let el = node.nodeType === 1 ? node : node.parentElement;
      const start = el;
      if (blocks.has(start)) return blocks.get(start);
      let found = root;
      while (el && el !== root) {
        if (el.classList && el.classList.contains('textLayer')) { found = el; break; }
        const s = style(el);
        const display = s ? s.display : 'inline';
        if (display && !display.startsWith('inline') && display !== 'contents' &&
            !(el.closest && el.closest('.textLayer'))) { found = el; break; }
        el = el.parentElement;
      }
      blocks.set(start, found);
      return found;
    }

    function textOf(node) {
      const value = node.nodeValue || '';
      const parent = node.parentElement;
      if (!preserves.has(parent)) {
        const s = parent ? style(parent) : null;
        preserves.set(parent, !!s && /^(pre|pre-wrap|pre-line|break-spaces)$/.test(s.whiteSpace));
      }
      return preserves.get(parent) ? value.replace(/\r/g, ' ') : value.replace(/[\r\n]/g, ' ');
    }

    return { walker, blockOf, textOf };
  }

  // Percorre as ocorrências em ordem de documento. O callback devolve false para interromper.
  function forEachMatch(regex, callback) {
    const walker = regex ? makeWalker() : null;
    if (!walker) return;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !text.trim()) continue;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (!match[0].length) { regex.lastIndex++; continue; }
        if (callback(node, match.index, match[0].length) === false) return;
      }
    }
  }

  function ensureStyle() {
    if (!hasHighlights || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '::highlight(superproc-find){background-color:#ffe066;color:#000}' +
      '::highlight(superproc-find-active){background-color:#ff8c1a;color:#000}';
    (document.head || document.documentElement).appendChild(style);
  }

  function paint() {
    if (hasHighlights) {
      CSS.highlights.delete('superproc-find');
      CSS.highlights.delete('superproc-find-active');
      if (state.ranges.length) {
        const others = new Highlight();
        state.ranges.forEach((range, i) => { if (i !== state.active) others.add(range); });
        CSS.highlights.set('superproc-find', others);
        if (state.active >= 0 && state.ranges[state.active]) {
          const current = new Highlight(state.ranges[state.active]);
          current.priority = 1;
          CSS.highlights.set('superproc-find-active', current);
        }
      }
    } else if (state.active >= 0 && state.ranges[state.active]) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(state.ranges[state.active]);
    }
  }

  function reveal(range) {
    const element = range.startContainer && range.startContainer.parentElement;
    if (element && element.scrollIntoView) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
      window.scrollBy(0, rect.top - window.innerHeight / 2);
    }
  }

  switch (op) {
    case 'search': {
      const regex = buildRegex(arg.term, arg.matchCase, arg.wholeWord);
      const ranges = [];
      forEachMatch(regex, (node, start, length) => {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + length);
        ranges.push(range);
      });
      state.ranges = ranges;
      state.active = -1;
      ensureStyle();
      paint();
      return { count: ranges.length };
    }
    case 'activate': {
      const index = Number(arg.index);
      state.active = index >= 0 && index < state.ranges.length ? index : -1;
      paint();
      if (state.active >= 0) reveal(state.ranges[state.active]);
      return true;
    }
    case 'clear': {
      state.ranges = [];
      state.active = -1;
      paint();
      return true;
    }
    case 'list': {
      // Contexto da linha do Glossário: completa com o texto vizinho do mesmo bloco, marcando quebras de linha
      // (<br>, texto pré-formatado) com '\n' e a troca de bloco com BLOCO (U+2029). O recorte por frase é feito
      // por superprocRecortarContexto (recorte-contexto.js), a mesma regra usada no leitor de PDF.
      const BLOCO = String.fromCharCode(0x2029);
      const regex = buildRegex(arg.term, arg.matchCase, arg.wholeWord);
      const CTX = 90;
      const LIMITE = CTX * 2;
      const ctx = contextTools();
      const entries = [];
      forEachMatch(regex, (node, start, length) => {
        const text = ctx.textOf(node);
        let before = text.substring(0, start);
        let after = text.substring(start + length);
        const block = ctx.blockOf(node);
        if (ctx.walker) {
          let n; let guard = 0; let sep = '';
          ctx.walker.currentNode = node;
          while (before.length < LIMITE && guard++ < 60 && (n = ctx.walker.previousNode())) {
            if (n.nodeType !== 3) { sep = '\n'; continue; }
            if (ctx.blockOf(n) !== block) { before = BLOCO + before; break; }
            before = ctx.textOf(n) + sep + before;
            sep = '';
          }
          guard = 0; sep = '';
          ctx.walker.currentNode = node;
          while (after.length < LIMITE && guard++ < 60 && (n = ctx.walker.nextNode())) {
            if (n.nodeType !== 3) { sep = '\n'; continue; }
            if (ctx.blockOf(n) !== block) { after += BLOCO; break; }
            after += sep + ctx.textOf(n);
            sep = '';
          }
        }
        entries.push(recortar(before, text.substring(start, start + length), after, CTX));
        return true;
      });
      return entries;
    }
    default:
      return null;
  }
}

const { RECORTE_SOURCE } = require('./recorte-contexto');
const FRAME_SOURCE = superprocFindFrame.toString();

function frameCode(op, arg) {
  return '(' + FRAME_SOURCE + ')(' + JSON.stringify(op) + ',' + JSON.stringify(arg || {}) + ',(' + RECORTE_SOURCE + '))';
}

function runInFrame(frame, op, arg) {
  const code = frameCode(op, arg);
  try {
    return Promise.resolve(frame.executeJavaScript(code)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}

function framesOf(webContents) {
  try { return webContents.mainFrame.framesInSubtree.slice(); } catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Motor próprio ("palavras inteiras"): conta e navega entre ocorrências de todos os frames.
// ---------------------------------------------------------------------------
function createEngine() {
  let token = 0;
  let frames = [];
  let total = 0;
  let active = -1;
  let activeFrame = -1;
  let dirty = false;

  const summary = () => ({ activeMatchOrdinal: total ? active + 1 : 0, matches: total });

  async function activate(currentToken) {
    if (!total || currentToken !== token) return;
    let index = active;
    let frameIndex = 0;
    while (frameIndex < frames.length && index >= frames[frameIndex].count) {
      index -= frames[frameIndex].count;
      frameIndex++;
    }
    const jobs = [];
    if (activeFrame !== -1 && activeFrame !== frameIndex && frames[activeFrame]) {
      jobs.push(runInFrame(frames[activeFrame].frame, 'activate', { index: -1 }));
    }
    if (frames[frameIndex]) jobs.push(runInFrame(frames[frameIndex].frame, 'activate', { index }));
    activeFrame = frameIndex;
    await Promise.all(jobs);
  }

  return {
    // Devolve o resumo { activeMatchOrdinal, matches } ou null se uma busca mais nova tomou o lugar.
    async search(webContents, term, { matchCase = false, wholeWord = true } = {}) {
      const mine = ++token;
      const list = framesOf(webContents);
      const counts = await Promise.all(list.map((frame) =>
        runInFrame(frame, 'search', { term, matchCase, wholeWord }).then((r) => (r && r.count) || 0)));
      if (mine !== token) return null;
      dirty = true;
      frames = list.map((frame, i) => ({ frame, count: counts[i] }));
      total = counts.reduce((a, b) => a + b, 0);
      active = total ? 0 : -1;
      activeFrame = -1;
      await activate(mine);
      return mine === token ? summary() : null;
    },
    async step(webContents, forward = true) {
      if (!total) return summary();
      const mine = ++token;
      active = (active + (forward ? 1 : -1) + total) % total;
      await activate(mine);
      return mine === token ? summary() : null;
    },
    // Vai direto à ocorrência de índice global `index` (0 = primeira).
    async goTo(webContents, index) {
      if (!total) return summary();
      const mine = ++token;
      active = Math.min(Math.max(0, Math.floor(Number(index) || 0)), total - 1);
      await activate(mine);
      return mine === token ? summary() : null;
    },
    async clear(webContents) {
      token++;
      total = 0;
      active = -1;
      activeFrame = -1;
      frames = [];
      if (!dirty) return;
      dirty = false;
      await Promise.all(framesOf(webContents).map((frame) => runInFrame(frame, 'clear')));
    }
  };
}

// ---------------------------------------------------------------------------
// Glossário: lista de ocorrências com contexto e salto até uma delas (mesma regra de correspondência).
// ---------------------------------------------------------------------------
async function listGlossary(webContents, term, { matchCase = false, wholeWord = false } = {}) {
  const results = [];
  for (const frame of framesOf(webContents)) {
    const entries = await runInFrame(frame, 'list', { term, matchCase, wholeWord });
    (entries || []).forEach((entry) => results.push(entry));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Controlador: pesquisar / próximo / parar, nativo ou motor próprio.
// ---------------------------------------------------------------------------
// Electron: findNext=true inicia uma nova sessão de busca (pedido inicial); false é pedido de acompanhamento
// (ir para a ocorrência seguinte/anterior). Concentrado aqui para ser trivial de inverter se necessário.
const PEDIDO_INICIAL = { findNext: true };
const PEDIDO_SEGUINTE = { findNext: false };

function createFindController({ getTargetWebContents, sendResult }) {
  const engine = createEngine();
  let query = '';
  let options = { matchCase: false, wholeWord: false, forceEngine: false };
  // Com "palavras inteiras" ou com o Glossário aberto, contagem, realce e lista usam o mesmo motor próprio.
  const usesEngine = () => options.wholeWord || options.forceEngine;
  let latestRequestId = 0;
  let sequence = 0;
  const alive = (wc) => !!wc && !(typeof wc.isDestroyed === 'function' && wc.isDestroyed());

  async function stop() {
    sequence++;
    query = '';
    latestRequestId = 0;
    const wc = getTargetWebContents();
    if (!alive(wc)) return;
    try { wc.stopFindInPage('clearSelection'); } catch (_) { /* aba pode estar fechando */ }
    await engine.clear(wc).catch(() => {});
  }

  async function search(text, opts = {}) {
    const mine = ++sequence;
    query = String(text || '');
    options = { matchCase: !!opts.matchCase, wholeWord: !!opts.wholeWord, forceEngine: !!opts.forceEngine };
    const forward = opts.forward !== false;
    const wc = getTargetWebContents();
    if (!alive(wc)) return;
    if (!query) { await stop(); return; }

    if (usesEngine()) {
      latestRequestId = 0;
      try { wc.stopFindInPage('clearSelection'); } catch (_) { /* aba pode estar fechando */ }
      const result = await engine.search(wc, query, options);
      if (result && mine === sequence) sendResult(Object.assign({ finalUpdate: true }, result));
      return;
    }

    await engine.clear(wc).catch(() => {});
    if (mine !== sequence || !alive(wc)) return;
    const id = wc.findInPage(query, Object.assign({ forward, matchCase: options.matchCase }, PEDIDO_INICIAL));
    latestRequestId = typeof id === 'number' ? id : 0;
  }

  async function next(forward = true) {
    if (!query) return;
    const wc = getTargetWebContents();
    if (!alive(wc)) return;
    if (usesEngine()) {
      const result = await engine.step(wc, forward !== false);
      if (result) sendResult(Object.assign({ finalUpdate: true }, result));
      return;
    }
    const id = wc.findInPage(query, Object.assign({ forward: forward !== false, matchCase: options.matchCase }, PEDIDO_SEGUINTE));
    if (typeof id === 'number') latestRequestId = id;
  }

  // Vai direto à ocorrência `index` (0 = primeira); usado pelo Glossário, que só existe com o motor próprio.
  async function goTo(index) {
    if (!query || !usesEngine()) return;
    const wc = getTargetWebContents();
    if (!alive(wc)) return;
    const result = await engine.goTo(wc, index);
    if (result) sendResult(Object.assign({ finalUpdate: true }, result));
  }

  // Resultados da busca nativa: ignora os de pedidos mais antigos que o último e todos no modo "palavras inteiras".
  function shouldForward(result) {
    if (!result || usesEngine()) return false;
    if (typeof result.requestId === 'number' && latestRequestId && result.requestId < latestRequestId) return false;
    return true;
  }

  return {
    search,
    next,
    goTo,
    stop,
    shouldForward,
    get query() { return query; },
    get options() { return Object.assign({}, options); }
  };
}

module.exports = {
  createEngine,
  createFindController,
  listGlossary,
  // expostos para teste
  _frameSource: FRAME_SOURCE,
  _frameCode: frameCode
};
