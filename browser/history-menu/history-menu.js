let activeTab = 'urls'; // 'urls' | 'processes'
let cachedHistory = { urls: [], processes: [] };
let searchQuery = '';

const tabUrlsBtn = document.getElementById('tab-urls');
const tabProcessesBtn = document.getElementById('tab-processes');
const badgeUrls = document.getElementById('badge-urls');
const badgeProcesses = document.getElementById('badge-processes');

const listUrlsEl = document.getElementById('list-urls');
const listProcessesEl = document.getElementById('list-processes');

const searchInput = document.getElementById('history-search');
const btnClearSearch = document.getElementById('btn-clear-search');
const btnClose = document.getElementById('btn-close-menu');

const footerCount = document.getElementById('footer-count');
const btnClearActive = document.getElementById('btn-clear-active');
const btnClearAll = document.getElementById('btn-clear-all');

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isToday) return `Hoje às ${timeStr}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${timeStr}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filterItems(items, query, fields) {
  if (!query) return items;
  const q = query.toLowerCase().trim();
  return items.filter(item => {
    return fields.some(field => {
      const val = item[field];
      return val && String(val).toLowerCase().includes(q);
    });
  });
}

function renderUrls() {
  const filtered = filterItems(cachedHistory.urls, searchQuery, ['title', 'url']);
  listUrlsEl.innerHTML = '';

  if (filtered.length === 0) {
    listUrlsEl.innerHTML = searchQuery
      ? '<div class="history-empty">Nenhum endereço encontrado para o filtro.</div>'
      : '<div class="history-empty">Nenhuma URL acessada ainda.</div>';
    return;
  }

  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.title = `Clique para abrir:\n${item.url}`;

    el.innerHTML = `
      <div class="item-leading-icon">🌐</div>
      <div class="item-body">
        <div class="item-title-row">
          <span class="item-primary-text">${escapeHtml(item.title || item.url)}</span>
          <span class="item-time">${formatTime(item.timestamp)}</span>
        </div>
        <span class="item-secondary-text">${escapeHtml(item.url)}</span>
      </div>
      <div class="item-actions">
        <button class="btn-remove-item" title="Remover do histórico">✕</button>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-item')) return;
      showItemMenu(e, { kind: 'url', url: item.url });
    });

    const btnRemove = el.querySelector('.btn-remove-item');
    if (btnRemove) {
      btnRemove.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = await window.api.removeItem('urls', item.id);
        if (updated) {
          cachedHistory = updated;
          updateUI();
        }
      });
    }

    listUrlsEl.appendChild(el);
  });
}

// Menu do item (ambas as abas): Abrir / Abrir em Nova Guia / Copiar link.
let itemMenuEl = null;
function closeItemMenu() { if (itemMenuEl) { itemMenuEl.remove(); itemMenuEl = null; } }
function showItemMenu(ev, target) {
  closeItemMenu();
  const menu = document.createElement('div');
  menu.className = 'item-menu';
  [['open', 'Abrir'], ['new-tab', 'Abrir em Nova Guia'], ['copy', 'Copiar link']].forEach(([action, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'item-menu-btn'; b.dataset.action = action; b.textContent = label;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeItemMenu();
      try { await window.api.itemAction({ ...target, action }); } catch (err) { console.error(err); }
      if (action !== 'copy') window.api.closeMenu();
    });
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(ev.clientX, window.innerWidth - w - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(ev.clientY, window.innerHeight - h - 4)) + 'px';
  itemMenuEl = menu;
}
document.addEventListener('click', (e) => { if (itemMenuEl && !itemMenuEl.contains(e.target)) closeItemMenu(); }, true);
document.addEventListener('scroll', closeItemMenu, true);

function textoPartes(p) {
  if (!p) return '';
  return [p.autor, p.reu].filter(Boolean).join(' x ');
}

// Rolagem do texto das partes (direita -> esquerda) somente com o mouse sobre o item e só se o
// texto não couber: espera inicial, rola, pausa no fim e recomeça do início.
const MARQUEE_ESPERA_INICIAL = 800;
const MARQUEE_PAUSA_FINAL = 1000;
const MARQUEE_PX_POR_SEGUNDO = 45;
function attachMarquee(item) {
  const box = item.querySelector('.item-secondary-text');
  const inner = box && box.querySelector('.marquee-inner');
  if (!box || !inner) return;
  let timer = null;
  let anim = null;
  const parar = () => {
    clearTimeout(timer); timer = null;
    if (anim) { anim.cancel(); anim = null; }
    inner.style.display = '';
  };
  const ciclo = () => {
    inner.style.display = 'inline-block';
    const excesso = inner.scrollWidth - box.clientWidth;
    if (excesso <= 0) { inner.style.display = ''; return; }
    timer = setTimeout(() => {
      anim = inner.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${-excesso}px)` }],
        { duration: (excesso / MARQUEE_PX_POR_SEGUNDO) * 1000, easing: 'linear', fill: 'forwards' }
      );
      anim.onfinish = () => {
        timer = setTimeout(() => { if (anim) { anim.cancel(); anim = null; } ciclo(); }, MARQUEE_PAUSA_FINAL);
      };
    }, MARQUEE_ESPERA_INICIAL);
  };
  item.addEventListener('mouseenter', () => { parar(); ciclo(); });
  item.addEventListener('mouseleave', parar);
}

function renderProcesses() {
  const filtered = filterItems(cachedHistory.processes.map(p => ({ ...p, partesTexto: textoPartes(p.partes) })), searchQuery, ['procNumber', 'digits', 'partesTexto']);
  listProcessesEl.innerHTML = '';

  if (filtered.length === 0) {
    listProcessesEl.innerHTML = searchQuery
      ? '<div class="history-empty">Nenhum processo encontrado para o filtro.</div>'
      : '<div class="history-empty">Nenhum processo acessado ainda.</div>';
    return;
  }

  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.title = item.incompleto
      ? `Registro antigo com número parcial (${item.procNumber}): abra o processo novamente para gravar o número completo`
      : `Clique para abrir a capa do processo ${item.procNumber}`;
    const detalhe = item.partesTexto;

    el.innerHTML = `
      <div class="item-leading-icon proc">⚖</div>
      <div class="item-body">
        <div class="item-title-row">
          <span class="item-primary-text proc-num">${escapeHtml(item.procNumber)}</span>
          <span class="item-time">${formatTime(item.timestamp)}</span>
        </div>
        ${detalhe ? `<span class="item-secondary-text"><span class="marquee-inner">${escapeHtml(detalhe)}</span></span>` : ''}
      </div>
      <div class="item-actions">
        <button class="btn-remove-item" title="Remover do histórico">✕</button>
      </div>
    `;

    const alvoProcesso = { kind: 'process', procData: { id: item.id, digits: item.digits, procNumber: item.procNumber } };
    // Clique esquerdo abre direto na aba atual; o menu (Abrir / Nova Guia / Copiar link) só no botão direito.
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-remove-item')) return;
      closeItemMenu();
      try { await window.api.itemAction({ ...alvoProcesso, action: 'open' }); } catch (err) { console.error(err); }
      window.api.closeMenu();
    });
    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.btn-remove-item')) return;
      e.preventDefault();
      showItemMenu(e, alvoProcesso);
    });

    const btnRemove = el.querySelector('.btn-remove-item');
    if (btnRemove) {
      btnRemove.addEventListener('click', async (e) => {
        e.stopPropagation();
        const updated = await window.api.removeItem('processes', item.id || item.procNumber);
        if (updated) {
          cachedHistory = updated;
          updateUI();
        }
      });
    }

    attachMarquee(el);
    listProcessesEl.appendChild(el);
  });
}

function updateUI() {
  badgeUrls.textContent = cachedHistory.urls.length;
  badgeProcesses.textContent = cachedHistory.processes.length;

  if (activeTab === 'urls') {
    tabUrlsBtn.classList.add('active');
    tabProcessesBtn.classList.remove('active');
    listUrlsEl.classList.remove('hidden');
    listProcessesEl.classList.add('hidden');
    renderUrls();
    const count = cachedHistory.urls.length;
    footerCount.textContent = `${count} ${count === 1 ? 'URL salva' : 'URLs salvas'}`;
    btnClearActive.textContent = 'Limpar URLs';
  } else {
    tabProcessesBtn.classList.add('active');
    tabUrlsBtn.classList.remove('active');
    listProcessesEl.classList.remove('hidden');
    listUrlsEl.classList.add('hidden');
    renderProcesses();
    const count = cachedHistory.processes.length;
    footerCount.textContent = `${count} ${count === 1 ? 'Processo salvo' : 'Processos salvos'}`;
    btnClearActive.textContent = 'Limpar Processos';
  }
}

tabUrlsBtn.addEventListener('click', () => {
  activeTab = 'urls';
  updateUI();
});

tabProcessesBtn.addEventListener('click', () => {
  activeTab = 'processes';
  updateUI();
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  if (searchQuery) {
    btnClearSearch.classList.remove('hidden');
  } else {
    btnClearSearch.classList.add('hidden');
  }
  if (activeTab === 'urls') {
    renderUrls();
  } else {
    renderProcesses();
  }
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  btnClearSearch.classList.add('hidden');
  searchInput.focus();
  if (activeTab === 'urls') {
    renderUrls();
  } else {
    renderProcesses();
  }
});

if (btnClose) {
  btnClose.addEventListener('click', () => {
    window.api.closeMenu();
  });
}

if (btnClearActive) {
  btnClearActive.addEventListener('click', async () => {
    const updated = await window.api.clearHistory(activeTab);
    if (updated) {
      cachedHistory = updated;
      updateUI();
    }
  });
}

if (btnClearAll) {
  btnClearAll.addEventListener('click', async () => {
    const updated = await window.api.clearHistory('all');
    if (updated) {
      cachedHistory = updated;
      updateUI();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (itemMenuEl) { closeItemMenu(); return; }
    window.api.closeMenu();
  }
});

window.api.onHistoryUpdated((data) => {
  if (data) {
    cachedHistory = data;
    updateUI();
  }
});

async function init() {
  try {
    cachedHistory = await window.api.getHistory();
    updateUI();
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

init();
