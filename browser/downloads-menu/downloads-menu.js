function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

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

const listEl = document.getElementById('downloads-list');
const btnOpenFolder = document.getElementById('btn-open-folder');
const btnClear = document.getElementById('btn-clear-downloads');

function renderList(items) {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!items || items.length === 0) {
    listEl.innerHTML = '<div class="downloads-empty">Nenhum download recente.</div>';
    return;
  }

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'download-item';
    el.title = `Clique para abrir o arquivo ou arraste-o para anexar:\n${item.path}`;

    const isPdf = item.path && item.path.toLowerCase().endsWith('.pdf');
    const badgeText = isPdf ? 'PDF' : (item.name ? item.name.split('.').pop().toUpperCase().slice(0, 4) : 'ARQ');
    const badgeClass = isPdf ? 'download-item-badge' : 'download-item-badge generic';

    const metaParts = [];
    if (item.size) metaParts.push(formatBytes(item.size));
    if (item.date) metaParts.push(formatTime(item.date));

    el.innerHTML = `
      <div class="${badgeClass}">${escapeHtml(badgeText)}</div>
      <div class="download-item-info">
        <span class="download-item-name">${escapeHtml(item.name || 'arquivo')}</span>
        <span class="download-item-meta">${escapeHtml(metaParts.join(' • '))}</span>
      </div>
      <div class="download-item-actions">
        <button class="item-action-btn btn-show-folder" title="Mostrar na pasta">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h4.672a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V4.87zM2.5 2a1 1 0 0 0-1 1v1.5h13V4a1 1 0 0 0-1-1H9.828a3 3 0 0 1-2.12-.879l-.83-.828A1 1 0 0 0 6.172 2H2.5z"/>
          </svg>
        </button>
      </div>
    `;

    let dragStarted = false;
    let pointerStart = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.btn-show-folder')) return;
      dragStarted = false;
      pointerStart = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointerStart || dragStarted || (e.buttons & 1) !== 1) return;
      const movedEnough = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) >= 5;
      if (!movedEnough) return;

      dragStarted = true;
      pointerStart = null;
      window.api.startFileDrag(item.path);
    });

    el.addEventListener('pointerup', () => {
      pointerStart = null;
    });

    el.addEventListener('pointercancel', () => {
      pointerStart = null;
    });

    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-show-folder')) return;
      if (dragStarted) {
        dragStarted = false;
        return;
      }
      window.api.openFile(item.path);
      window.api.closeMenu();
    });

    const btnFolder = el.querySelector('.btn-show-folder');
    if (btnFolder) {
      btnFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        window.api.showInFolder(item.path);
        window.api.closeMenu();
      });
    }

    listEl.appendChild(el);
  });
}

async function loadDownloads() {
  try {
    const items = await window.api.getRecentDownloads();
    renderList(items);
  } catch (e) {
    console.error('Erro ao carregar downloads:', e);
  }
}

if (btnOpenFolder) {
  btnOpenFolder.addEventListener('click', () => {
    window.api.openFolder();
    window.api.closeMenu();
  });
}

if (btnClear) {
  btnClear.addEventListener('click', async () => {
    const updated = await window.api.clearDownloads();
    renderList(updated || []);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.closeMenu();
  }
});

window.api.onDownloadsUpdated((data) => {
  if (data && Array.isArray(data.recent)) {
    renderList(data.recent);
  }
});

loadDownloads();
