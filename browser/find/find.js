document.addEventListener('DOMContentLoaded', () => {
  const api = window.findAPI;
  if (!api) return;

  const findInput     = document.getElementById('find-input');
  const findCount     = document.getElementById('find-count');
  const btnPrev       = document.getElementById('btn-find-prev');
  const btnNext       = document.getElementById('btn-find-next');
  const btnClose      = document.getElementById('btn-find-close');
  const container     = document.querySelector('.find-container');
  const glossToggle   = document.getElementById('gloss-toggle');
  const glossPanel    = document.getElementById('gloss-panel');
  const glossList     = document.getElementById('gloss-list');
  const glossCount    = document.getElementById('gloss-entry-count');
  const optCase       = document.getElementById('opt-case');
  const optWord       = document.getElementById('opt-word');

  // Espera após a última tecla antes de buscar sozinho.
  const DEBOUNCE_MS = 200;

  // Dimensões fixas
  const BASE_H        = 38 + 22; // find-bar + toggle-bar
  const ENTRY_H       = 34;      // altura de cada entrada do glossário
  const VISIBLE_ROWS  = 9;       // linhas visíveis do glossário
  const MAX_LIST_H    = VISIBLE_ROWS * ENTRY_H;
  const OVERSCAN      = 3;       // linhas extras desenhadas acima/abaixo da janela
  const GLOSS_MIN_H   = 40;      // altura mínima do painel quando aberto (mensagem vazia)

  // A preferência pertence ao navegador, não a uma busca isolada. O mesmo
  // armazenamento da janela do Chromium a conserva entre abas e reinícios.
  let glossaryActive = localStorage.getItem('superproc.find.glossary') === 'true';
  let pendingGlossTimer = null;
  let glossEntries = [];   // todas as ocorrências (sem limite)
  let activeIndex = -1;    // ocorrência ativa (0 = primeira), vinda da busca

  optCase.checked = localStorage.getItem('superproc.find.matchCase') === 'true';
  optWord.checked = localStorage.getItem('superproc.find.wholeWord') === 'true';
  // Com o Glossário aberto, a busca usa o motor próprio: contagem, realce e lista seguem a mesma regra.
  const searchOptions = () => ({ matchCase: optCase.checked, wholeWord: optWord.checked, forceEngine: glossaryActive });

  glossToggle.checked = glossaryActive;
  glossPanel.classList.toggle('is-open', glossaryActive);

  // ── Utilidades de altura ────────────────────────────────────────────────────
  function setWindowHeight(h) {
    api.resize(Math.round(h));
  }

  function computeGlossHeight(numEntries) {
    if (numEntries === 0) return GLOSS_MIN_H;
    return Math.min(numEntries * ENTRY_H, MAX_LIST_H);
  }

  function applyHeight(numEntries) {
    const glossH = glossaryActive ? computeGlossHeight(numEntries) : 0;
    setWindowHeight(BASE_H + glossH);
  }

  // ── Disparo de glossário com debounce ───────────────────────────────────────
  function scheduleGlossary() {
    if (!glossaryActive) return;
    const term = findInput.value.trim();
    if (!term) {
      renderGlossary([]);
      return;
    }
    clearTimeout(pendingGlossTimer);
    pendingGlossTimer = setTimeout(() => {
      api.requestGlossary(term, searchOptions());
    }, 350);
  }

  // ── Renderização do glossário (janela de 9 linhas que acompanha a ocorrência ativa) ─────────
  const glossSpacer = document.createElement('div');
  glossSpacer.className = 'gloss-spacer';

  // Primeira linha visível: a ativa fica no meio (5ª de 9); nas 4 primeiras e 4 últimas, a janela encosta no
  // começo/fim da lista, sem linhas vazias.
  function windowStart(active, total) {
    if (total <= VISIBLE_ROWS) return 0;
    const half = Math.floor(VISIBLE_ROWS / 2);
    return Math.min(Math.max(0, (active < 0 ? 0 : active) - half), total - VISIBLE_ROWS);
  }

  function buildRow(entry, i) {
    const row = document.createElement('div');
    row.className = 'gloss-entry' + (i === activeIndex ? ' is-active' : '');
    row.style.top = (i * ENTRY_H) + 'px';
    row.title = `Ocorrência ${i + 1}:\n${entry.before}${entry.match}${entry.after}`;

    const idx = document.createElement('span');
    idx.className = 'gloss-entry-idx';
    idx.textContent = i + 1;

    const textEl = document.createElement('span');
    textEl.className = 'gloss-entry-text';
    [['ctx-before', entry.before], ['ctx-match', entry.match], ['ctx-after', entry.after]].forEach(([cls, text]) => {
      const holder = document.createElement('span');
      holder.className = cls;
      const inner = document.createElement('span');
      inner.textContent = text;
      holder.appendChild(inner);
      textEl.appendChild(holder);
    });

    row.appendChild(idx);
    row.appendChild(textEl);
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (api.jumpToGlossary) api.jumpToGlossary(i);
    });
    return row;
  }

  // Desenha só as linhas próximas da janela visível (lista sem limite, DOM pequeno).
  function paintRows() {
    const total = glossEntries.length;
    if (!total) return;
    const viewH = Math.min(total, VISIBLE_ROWS) * ENTRY_H;
    const first = Math.max(0, Math.floor(glossList.scrollTop / ENTRY_H) - OVERSCAN);
    const last = Math.min(total - 1, Math.ceil((glossList.scrollTop + viewH) / ENTRY_H) + OVERSCAN);
    glossSpacer.textContent = '';
    for (let i = first; i <= last; i++) glossSpacer.appendChild(buildRow(glossEntries[i], i));
  }

  function followActive() {
    if (!glossEntries.length) return;
    glossList.scrollTop = windowStart(activeIndex, glossEntries.length) * ENTRY_H;
    paintRows();
  }

  glossList.addEventListener('scroll', paintRows);

  function renderGlossary(entries) {
    glossEntries = Array.isArray(entries) ? entries : [];
    glossList.innerHTML = '';

    if (glossEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gloss-empty';
      empty.textContent = findInput.value.trim()
        ? 'Nenhuma ocorrência encontrada.'
        : 'Digite um termo para ver o contexto.';
      glossList.appendChild(empty);
      glossList.style.height = '';
      glossCount.textContent = '';
      glossCount.className = 'gloss-entry-count';
      applyHeight(0);
      return;
    }

    const total = glossEntries.length;
    glossCount.textContent = `${total} ocorrência${total === 1 ? '' : 's'}`;
    glossCount.className = 'gloss-entry-count has-results';
    glossSpacer.style.height = (total * ENTRY_H) + 'px';
    glossList.style.height = (Math.min(total, VISIBLE_ROWS) * ENTRY_H) + 'px';
    glossList.appendChild(glossSpacer);
    applyHeight(total);
    followActive();
  }

  // ── Toggle do glossário ─────────────────────────────────────────────────────
  glossToggle.addEventListener('change', () => {
    glossaryActive = glossToggle.checked;
    localStorage.setItem('superproc.find.glossary', String(glossaryActive));

    if (glossaryActive) {
      glossPanel.classList.add('is-open');
    } else {
      glossPanel.classList.remove('is-open');
      glossEntries = [];
      glossList.innerHTML = '';
      glossCount.textContent = '';
      glossCount.className = 'gloss-entry-count';
      applyHeight(0); // volta ao tamanho base
    }
    // O modo de busca muda (nativo <-> motor próprio): refaz a busca e a lista.
    if (findInput.value.trim()) runNewSearch(true);
    scheduleGlossary();
  });

  // ── Eventos de busca ────────────────────────────────────────────────────────
  // searchKey = termo + opções da última busca enviada. Enter só avança quando
  // nada mudou desde então; caso contrário, busca primeiro.
  let searchKey = '';
  let debounceTimer = null;

  const currentKey = () => {
    const o = searchOptions();
    return findInput.value.trim() + '|' + o.matchCase + '|' + o.wholeWord + '|' + o.forceEngine;
  };

  function clearSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    findCount.textContent = '0/0';
    findCount.className = 'find-count';
    searchKey = '';
    api.stop();
  }

  function runNewSearch(forward = true) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    const text = findInput.value.trim();
    if (!text) { clearSearch(); return; }
    searchKey = currentKey();
    api.find(text, Object.assign({ forward }, searchOptions()));
  }

  function runNext(forward = true) {
    const text = findInput.value.trim();
    if (!text) { clearSearch(); return; }
    if (debounceTimer !== null || currentKey() !== searchKey) {
      runNewSearch(forward); // há busca pendente ou parâmetros mudaram
    } else {
      api.findNext(forward);
    }
  }

  function scheduleSearch() {
    clearTimeout(debounceTimer);
    if (!findInput.value.trim()) { clearSearch(); return; }
    debounceTimer = setTimeout(() => runNewSearch(true), DEBOUNCE_MS);
  }

  findInput.addEventListener('input', () => {
    scheduleSearch();
    scheduleGlossary();
  });

  [optCase, optWord].forEach((el) => {
    el.addEventListener('change', () => {
      localStorage.setItem('superproc.find.matchCase', String(optCase.checked));
      localStorage.setItem('superproc.find.wholeWord', String(optWord.checked));
      runNewSearch(true);
      scheduleGlossary();
      findInput.focus();
    });
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runNext(!e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      api.close();
    }
  });

  btnPrev.addEventListener('click', (e) => {
    e.preventDefault();
    runNext(false);
    findInput.focus();
  });

  btnNext.addEventListener('click', (e) => {
    e.preventDefault();
    runNext(true);
    findInput.focus();
  });

  btnClose.addEventListener('click', (e) => {
    e.preventDefault();
    api.close();
  });

  // ── Resultados da busca (contagem) ──────────────────────────────────────────
  api.onResults((result) => {
    if (!result) return;
    const { activeMatchOrdinal, matches } = result;
    findCount.textContent = `${activeMatchOrdinal || 0}/${matches || 0}`;
    activeIndex = (activeMatchOrdinal || 0) - 1;
    if (glossaryActive && glossEntries.length) followActive();
    if (matches > 0) {
      findCount.className = 'find-count has-matches';
    } else if (findInput.value.trim()) {
      findCount.className = 'find-count no-matches';
    } else {
      findCount.className = 'find-count';
    }
  });

  // ── Resultados do glossário ─────────────────────────────────────────────────
  api.onGlossaryResults((entries) => {
    if (glossaryActive) {
      renderGlossary(entries || []);
    }
  });

  // ── Exibição da janela (tema + foco) ────────────────────────────────────────
  api.onShow((data) => {
    // Aplicar tema azul para o painel
    if (container) {
      container.classList.toggle('is-panel', !!(data && data.isPanel));
    }

    // Ajustar altura: se glossário estava ativo, manterá; senão, tamanho base
    applyHeight(glossaryActive ? glossEntries.length : 0);

    setTimeout(() => {
      findInput.focus();
      findInput.select();
      if (findInput.value.trim()) {
        runNewSearch(true);
        scheduleGlossary();
      }
    }, 20);
  });
});
