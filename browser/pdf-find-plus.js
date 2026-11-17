'use strict';
/**
 * SuperPROC - Glossário na busca do leitor de PDF (pdf.js).
 *
 * A busca nativa do pdf.js (barra de busca do leitor) é mantida como está. Este módulo apenas ACRESCENTA a ela
 * o "Glossário": lista de ocorrências com contexto, em janela de 9 linhas que acompanha a ocorrência ativa
 * (a ativa fica no meio; nas 4 primeiras e 4 últimas a janela encosta no começo/fim), sem limite de ocorrências.
 *
 * Nada da extensão do leitor é alterado em disco: o código abaixo é injetado na página do leitor, em tempo de
 * execução, do mesmo modo que o pdf-reader.js já faz. Ele usa apenas o que o pdf.js expõe (eventBus,
 * findController, pageMatches) e se desliga sozinho se a estrutura esperada não existir.
 */

// Executado DENTRO do frame do leitor (serializado com toString; precisa ser autocontido).
function superprocPdfFindPlus() {
  if (window.__spPdfFindPlus) return 'ja-ativo';
  window.__spPdfFindPlus = true;

  const ROW_H = 28;
  const VISIBLE_ROWS = 9;
  const OVERSCAN = 3;
  const CTX = 90;
  const STORAGE_KEY = 'superproc.pdf.glossary';

  function whenReady(done) {
    let tries = 0;
    const timer = setInterval(() => {
      const app = window.PDFViewerApplication;
      const ok = app && app.findController && app.eventBus && document.getElementById('findbar') &&
        document.getElementById('findbarOptionsTwoContainer');
      if (ok) { clearInterval(timer); done(app); return; }
      if (++tries > 100) { clearInterval(timer); window.__spPdfFindPlus = false; }
    }, 100);
  }

  function setup(app) {
    const fc = app.findController;
    const eventBus = app.eventBus;
    const bar = document.getElementById('findbar');
    const options = document.getElementById('findbarOptionsTwoContainer');

    // ── Posição da ocorrência na tela ──────────────────────────────────────
    // O pdf.js rola a ocorrência para o TOPO da área de leitura, ficando por baixo da caixa de busca.
    // Aqui ela é posicionada a ~40,7% da altura visível (550 px numa área de 1350 px), abaixo da caixa e do
    // Glossário. Perto do começo do documento não há rolagem possível e a posição natural permanece.
    const TARGET_RATIO = 550 / 1350;
    if (typeof fc.scrollMatchIntoView === 'function' && !fc.__spScrollPatched) {
      fc.__spScrollPatched = true;
      const original = fc.scrollMatchIntoView.bind(fc);
      fc.scrollMatchIntoView = function (request) {
        const pending = !!fc._scrollMatches;
        original(request);
        // Só ajusta quando o pdf.js de fato acabou de rolar até esta ocorrência.
        if (!pending || fc._scrollMatches) return;
        try {
          const element = request && request.element;
          const container = document.getElementById('viewerContainer');
          if (!element || !container || !element.getBoundingClientRect) return;
          const box = container.getBoundingClientRect();
          const wanted = box.top + container.clientHeight * TARGET_RATIO;
          container.scrollTop += element.getBoundingClientRect().top - wanted;
        } catch (_) { /* o posicionamento padrão do pdf.js permanece */ }
      };
    }

    // ── Interface ──────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.id = 'spGlossStyle';
    style.textContent = [
      // Barra compacta: tudo numa linha só (quebra para uma segunda linha apenas se a janela for muito estreita)
      '#findbar{flex-direction:row !important;flex-wrap:wrap;align-items:center;height:auto;min-width:0;' +
        'max-width:98vw;gap:0;padding-inline:4px}',
      '#findbar .toolbarLabel,#findbar .toggleButton{padding-inline:4px !important;margin-inline:0 !important;font-size:13px}',
      '#findbar .splitToolbarButton{margin-inline:2px !important}',
      '@media (max-width:700px){#findbar{position:fixed !important;top:calc(var(--toolbar-height,32px) + 4px) !important;inset-inline-start:4px !important;left:4px !important;right:auto !important}}',
      '#findbar #findInputContainer #findInput{width:112px}',
      '#findbar #spCount{font-size:11px;min-width:30px;text-align:center;opacity:.8;white-space:nowrap;' +
        'align-self:center;padding:0 2px;color:var(--main-color,inherit)}',
      '#findbar #spCount:empty{display:none}',
      '#findbar #spCaseLabel{font-size:14px;font-weight:600}',
      // O contador "x de y ocorrências" do pdf.js dá lugar ao compacto (#spCount); a mensagem de "não encontrado/fim" permanece
      '#findbar #findResultsCount{display:none}',
      '#findbar #findbarMessageContainer:not(:has(#findMsg:not(:empty))){display:none !important}',
      // Glossário: painel solto sob a barra (não altera a altura da barra)
      '#findbar > #spGlossPanel{position:absolute;left:0;top:100%;width:100%;height:auto;padding:0;box-sizing:border-box;' +
        'background:var(--toolbar-bg-color,#fff);border-radius:0 0 2px 2px;' +
        'box-shadow:0 3px 5px var(--doorhanger-border-color,rgba(0,0,0,.3)),0 0 0 1px var(--doorhanger-border-color,rgba(0,0,0,.2))}',
      '#spGlossPanel[hidden]{display:none}',
      '#spGlossList{position:relative;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}',
      '#spGlossSpacer{position:relative;width:100%}',
      '.spGlossRow{position:absolute;left:0;right:0;height:' + ROW_H + 'px;box-sizing:border-box;display:flex;' +
        'align-items:center;padding:0 10px 0 30px;cursor:pointer;white-space:pre;font-size:12px;overflow:hidden;' +
        'color:var(--main-color,inherit)}',
      '.spGlossRow:hover{background:var(--button-hover-color,rgba(128,128,128,.2))}',
      '.spGlossRow.spActive{background:var(--toggled-btn-bg-color,rgba(10,132,255,.35));' +
        'color:var(--toggled-btn-color,inherit)}',
      '.spGlossIdx{position:absolute;left:6px;top:2px;font-size:9px;opacity:.55;line-height:1}',
      '.spGlossBefore,.spGlossAfter{flex:1 1 0;min-width:0;overflow:hidden;display:flex;opacity:.75}',
      '.spGlossBefore{justify-content:flex-end;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 22px);' +
        'mask-image:linear-gradient(to right,transparent 0,#000 22px)}',
      '.spGlossAfter{justify-content:flex-start;-webkit-mask-image:linear-gradient(to left,transparent 0,#000 22px);' +
        'mask-image:linear-gradient(to left,transparent 0,#000 22px)}',
      '.spGlossMatch{flex:0 1 auto;max-width:70%;overflow:hidden;text-overflow:ellipsis;font-weight:600;padding:0 2px;' +
        'background:rgba(255,200,0,.35);border-radius:2px}',
      '#spGlossEmpty{padding:8px 12px;font-size:12px;opacity:.7;font-style:italic}'
    ].join('\n');
    document.head.appendChild(style);

    // Rótulos mais curtos (o nome completo fica na dica ao passar o mouse). Os rótulos do pdf.js são traduzidos
    // por data-l10n-id; o atributo é retirado destes dois para a tradução não restaurar o texto longo.
    function shorten(inputId, text, title, labelId) {
      const input = document.getElementById(inputId);
      const label = input && input.parentElement && input.parentElement.querySelector('label');
      if (!label) return;
      label.removeAttribute('data-l10n-id');
      label.title = title;
      if (labelId) label.id = labelId;
      const apply = () => { if (label.textContent !== text) label.textContent = text; };
      apply();
      new MutationObserver(apply).observe(label, { childList: true, characterData: true, subtree: true });
    }
    shorten('findMatchCase', 'Aa', 'Diferenciar maiúsculas/minúsculas', 'spCaseLabel');
    shorten('findEntireWord', 'Palavras', 'Palavras completas');

    // Contador compacto "atual/total", ao lado das setas
    const countBadge = document.createElement('span');
    countBadge.id = 'spCount';
    const inputContainer = document.getElementById('findInputContainer');
    if (inputContainer) inputContainer.appendChild(countBadge);

    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'toggleButton toolbarLabel';
    toggleWrap.id = 'spGlossToggleWrap';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'spGlossToggle';
    toggle.tabIndex = 0;
    const label = document.createElement('label');
    label.htmlFor = 'spGlossToggle';
    label.textContent = 'Glossário';
    label.title = 'Mostrar o contexto de cada ocorrência';
    toggleWrap.appendChild(toggle);
    toggleWrap.appendChild(label);
    options.appendChild(toggleWrap);

    const panel = document.createElement('div');
    panel.id = 'spGlossPanel';
    panel.hidden = true;
    const list = document.createElement('div');
    list.id = 'spGlossList';
    const spacer = document.createElement('div');
    spacer.id = 'spGlossSpacer';
    const empty = document.createElement('div');
    empty.id = 'spGlossEmpty';
    list.appendChild(spacer);
    panel.appendChild(list);
    panel.appendChild(empty);
    bar.appendChild(panel);

    try { toggle.checked = localStorage.getItem(STORAGE_KEY) === 'true'; } catch (_) { /* sem armazenamento */ }

    // ── Estado ─────────────────────────────────────────────────────────────
    let counts = [];     // ocorrências por página
    let starts = [];     // ordinal (0-based) da primeira ocorrência de cada página
    let total = 0;
    let active = -1;     // ocorrência ativa (0-based), vinda do próprio pdf.js
    let refreshTimer = null;
    let generation = 0;

    // Texto original de cada página (o do pdf.js é normalizado e perde acentos), com cache pequeno.
    // As posições das ocorrências no pdf.js contam só o texto dos trechos (sem as quebras de linha),
    // então guardamos esse texto "corrido" e onde caem as quebras para exibir o contexto com um espaço no lugar.
    const textCache = new Map();
    let cacheDoc = null;
    function pageText(pageIdx) {
      const doc = app.pdfDocument;
      if (!doc) return Promise.resolve(null);
      if (cacheDoc !== doc) { textCache.clear(); cacheDoc = doc; }
      let promise = textCache.get(pageIdx);
      if (!promise) {
        promise = doc.getPage(pageIdx + 1)
          .then((page) => page.getTextContent({ disableNormalization: true }))
          .then((content) => {
            const parts = [];
            const eols = [];   // posições (no texto corrido) onde há quebra de linha
            let length = 0;
            for (const item of content.items) {
              if (typeof item.str !== 'string') continue;
              parts.push(item.str);
              length += item.str.length;
              if (item.hasEOL) eols.push(length);
            }
            return { text: parts.join(''), eols };
          })
          .catch(() => null);
        textCache.set(pageIdx, promise);
        if (textCache.size > 40) textCache.delete(textCache.keys().next().value);
      }
      return promise;
    }

    // Trecho [from, to) do texto corrido, com um espaço em cada quebra de linha.
    function slice(page, from, to) {
      const { text, eols } = page;
      from = Math.max(0, from);
      to = Math.min(text.length, to);
      let out = '';
      let cursor = from;
      // primeira quebra com posição > from (uma quebra em `from` fica antes do primeiro caractere)
      let lo = 0, hi = eols.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (eols[mid] <= from) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < eols.length && eols[i] < to; i++) {
        out += text.slice(cursor, eols[i]) + ' ';
        cursor = eols[i];
      }
      return out + text.slice(cursor, to);
    }

    function locate(ordinal) {
      if (ordinal < 0 || ordinal >= total) return null;
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= ordinal) lo = mid; else hi = mid - 1;
      }
      while (lo < counts.length && counts[lo] === 0) lo++; // páginas sem ocorrência
      return { page: lo, index: ordinal - starts[lo] };
    }

    function recount() {
      const matches = fc.pageMatches || [];
      const pages = Math.max(app.pagesCount || 0, matches.length);
      counts = new Array(pages);
      starts = new Array(pages);
      total = 0;
      for (let i = 0; i < pages; i++) {
        starts[i] = total;
        counts[i] = (matches[i] && matches[i].length) || 0;
        total += counts[i];
      }
    }

    // ── Janela de 9 linhas ─────────────────────────────────────────────────
    function windowStart() {
      if (total <= VISIBLE_ROWS) return 0;
      const half = Math.floor(VISIBLE_ROWS / 2);
      return Math.min(Math.max(0, (active < 0 ? 0 : active) - half), total - VISIBLE_ROWS);
    }

    function fillRow(row, ordinal, token) {
      const loc = locate(ordinal);
      if (!loc) return;
      const length = (fc.pageMatchesLength[loc.page] || [])[loc.index];
      const position = (fc.pageMatches[loc.page] || [])[loc.index];
      pageText(loc.page).then((page) => {
        if (token !== generation || !row.isConnected || !page) return;
        const flat = (value) => value.replace(/\s+/g, ' ');
        const from = position;
        const to = position + length;
        row.querySelector('.spGlossBefore span').textContent = flat(slice(page, from - CTX * 2, from)).slice(-CTX);
        row.querySelector('.spGlossMatch').textContent = flat(slice(page, from, to));
        row.querySelector('.spGlossAfter span').textContent = flat(slice(page, to, to + CTX * 2)).slice(0, CTX);
      });
    }

    function buildRow(ordinal, token) {
      const row = document.createElement('div');
      row.className = 'spGlossRow' + (ordinal === active ? ' spActive' : '');
      row.style.top = (ordinal * ROW_H) + 'px';
      row.dataset.ordinal = String(ordinal);
      const idx = document.createElement('span');
      idx.className = 'spGlossIdx';
      idx.textContent = String(ordinal + 1);
      const before = document.createElement('span');
      before.className = 'spGlossBefore';
      before.appendChild(document.createElement('span'));
      const match = document.createElement('span');
      match.className = 'spGlossMatch';
      const after = document.createElement('span');
      after.className = 'spGlossAfter';
      after.appendChild(document.createElement('span'));
      row.append(idx, before, match, after);
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        goTo(ordinal);
      });
      fillRow(row, ordinal, token);
      return row;
    }

    function paintRows() {
      if (!total) return;
      const viewH = Math.min(total, VISIBLE_ROWS) * ROW_H;
      const first = Math.max(0, Math.floor(list.scrollTop / ROW_H) - OVERSCAN);
      const last = Math.min(total - 1, Math.ceil((list.scrollTop + viewH) / ROW_H) + OVERSCAN);
      spacer.textContent = '';
      for (let i = first; i <= last; i++) spacer.appendChild(buildRow(i, generation));
    }

    function render() {
      const on = toggle.checked;
      panel.hidden = !on;
      bar.classList.toggle('spGlossOn', on);
      if (!on) return;
      recount();
      generation++;
      if (!total) {
        list.hidden = true;
        const field = document.getElementById('findInput');
        empty.hidden = false;
        empty.textContent = field && field.value.trim() ? 'Nenhuma ocorrência encontrada.' : 'Digite um termo para ver o contexto.';
        return;
      }
      list.hidden = false;
      empty.hidden = true;
      spacer.style.height = (total * ROW_H) + 'px';
      list.style.height = (Math.min(total, VISIBLE_ROWS) * ROW_H) + 'px';
      list.scrollTop = windowStart() * ROW_H;
      paintRows();
    }

    function scheduleRender() {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; render(); }, 80);
    }

    // Vai direto à ocorrência escolhida, usando o próprio mecanismo "próxima" do pdf.js:
    // posiciona o controlador logo antes dela e dispara "again". Se a estrutura interna não for a esperada,
    // apenas leva até a página.
    function goTo(ordinal) {
      const loc = locate(ordinal);
      if (!loc) return;
      const state = fc.state;
      if (state && fc._selected && fc._offset) {
        try {
          app.pdfViewer.currentPageNumber = loc.page + 1;
          fc._selected.pageIdx = loc.page;
          fc._offset.pageIdx = loc.page;
          fc._offset.matchIdx = loc.index - 1;
          fc._offset.wrapped = false;
          eventBus.dispatch('find', Object.assign({}, state, { source: 'superproc', type: 'again', findPrevious: false }));
          return;
        } catch (_) { /* cai para a navegação simples */ }
      }
      try { app.pdfViewer.currentPageNumber = loc.page + 1; } catch (_) { /* nada a fazer */ }
    }

    function onCount(matchesCount) {
      const current = matchesCount && matchesCount.current ? matchesCount.current : 0;
      const totalCount = matchesCount && matchesCount.total ? matchesCount.total : 0;
      countBadge.textContent = totalCount ? current + '/' + totalCount : '';
      active = current - 1;
      if (!toggle.checked) return;
      if (total && active >= 0 && active < total) {
        // Só a janela se move; a lista não é refeita a cada tecla.
        list.scrollTop = windowStart() * ROW_H;
        paintRows();
      }
      scheduleRender();
    }

    list.addEventListener('scroll', paintRows);
    toggle.addEventListener('change', () => {
      try { localStorage.setItem(STORAGE_KEY, String(toggle.checked)); } catch (_) { /* sem armazenamento */ }
      render();
    });
    eventBus.on('updatefindmatchescount', (event) => onCount(event && event.matchesCount));
    eventBus.on('updatefindcontrolstate', (event) => onCount(event && event.matchesCount));
    eventBus.on('findbarclose', () => { panel.hidden = true; bar.classList.remove('spGlossOn'); });
    eventBus.on('find', () => { if (toggle.checked) { panel.hidden = false; bar.classList.add('spGlossOn'); } });
    render();
  }

  whenReady(setup);
  return 'instalando';
}

const VIEWER_SOURCE = '(' + superprocPdfFindPlus.toString() + ')()';

/**
 * Registra a injeção em todo webContents (aba, painel) cujo frame seja o leitor de PDF.
 * `isViewer(frame)` vem do pdf-reader.js.
 */
function install(app, isViewer, webFrameMain) {
  const inject = (frame) => {
    try {
      if (frame && isViewer(frame)) {
        Promise.resolve(frame.executeJavaScript(VIEWER_SOURCE, true)).catch(() => {});
      }
    } catch (_) { /* frame já descartado */ }
  };
  app.on('web-contents-created', (_event, wc) => {
    wc.on('did-frame-finish-load', (ev, isMainFrame, frameProcessId, frameRoutingId) => {
      try { inject((ev && ev.frame) || webFrameMain.fromId(frameProcessId, frameRoutingId)); } catch (_) { /* ignorado */ }
    });
  });
}

module.exports = { install, VIEWER_SOURCE, _frameSource: superprocPdfFindPlus };
