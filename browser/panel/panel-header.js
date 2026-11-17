document.addEventListener('DOMContentLoaded', () => {
  const api = window.panelAPI;
  if (!api) return;

  const resizerHandle = document.getElementById('resizer-handle');
  const badgeEl = document.getElementById('panel-category-badge');
  const titleEl = document.getElementById('panel-title');

  const btnPanelFindToggle = document.getElementById('btn-panel-find-toggle');
  const btnHome = document.getElementById('btn-panel-home');
  const btnBack = document.getElementById('btn-panel-back');
  const btnForward = document.getElementById('btn-panel-forward');
  const btnReload = document.getElementById('btn-panel-reload');
  const btnPromote = document.getElementById('btn-panel-promote');
  const btnClose = document.getElementById('btn-panel-close');

  const headerContainer = document.getElementById('panel-header-container');
  const btnPin = document.getElementById('btn-panel-pin');

  if (btnPin) {
    btnPin.addEventListener('click', () => {
      if (api.togglePin) api.togglePin();
    });
  }

  if (btnPanelFindToggle) {
    btnPanelFindToggle.addEventListener('click', () => {
      if (api.openFind) api.openFind();
    });
  }

  if (btnHome) {
    btnHome.addEventListener('click', () => {
      if (api.home) api.home();
    });
  }

  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (api.back) api.back();
    });
  }

  if (btnForward) {
    btnForward.addEventListener('click', () => {
      if (api.forward) api.forward();
    });
  }

  if (btnReload) {
    btnReload.addEventListener('click', () => {
      if (api.reload) api.reload();
    });
  }

  if (btnPromote) {
    btnPromote.addEventListener('click', () => {
      if (api.promoteToTab) api.promoteToTab();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (api.close) api.close();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (api.openFind) api.openFind();
    } else if (e.key === 'Escape') {
      if (api.hide) api.hide();
      else if (api.close) api.close();
    }
  });

  // Atualização dos dados do painel
  api.onPanelData((data) => {
    if (!data) return;

    if (headerContainer) {
      if (data.isPinned) {
        headerContainer.classList.add('pinned');
        if (btnPin) {
          btnPin.classList.add('pinned');
          btnPin.title = 'Painel Fixado (borda azul). Clique para desfixar (permitir fechar no hover)';
        }
      } else {
        headerContainer.classList.remove('pinned');
        if (btnPin) {
          btnPin.classList.remove('pinned');
          btnPin.title = 'Fixar Painel (impedir fechar no hover)';
        }
      }
    }

    if (badgeEl && data.category) {
      const cat = (data.category || '').toLowerCase();
      badgeEl.className = 'badge';
      if (cat.includes('juris')) {
        badgeEl.textContent = 'Juris';
        badgeEl.classList.add('juris');
      } else if (cat.includes('legis') || cat.includes('lei')) {
        badgeEl.textContent = 'Legis';
        badgeEl.classList.add('legis');
      } else {
        badgeEl.textContent = 'Ferramenta';
        badgeEl.classList.add('ferramentas');
      }
    }

    if (data.title) {
      titleEl.textContent = data.title;
      titleEl.title = data.title;
    }
  });

  // Estado de navegação
  api.onNavState((state) => {
    if (!state) return;
    if (btnBack) btnBack.disabled = !state.canGoBack;
    if (btnForward) btnForward.disabled = !state.canGoForward;
  });

  // Redimensionamento arrastando a borda esquerda usando screenX absoluto
  let isDragging = false;
  let lastScreenX = 0;

  if (resizerHandle) {
    resizerHandle.addEventListener('pointerdown', (e) => {
      isDragging = true;
      lastScreenX = e.screenX;
      resizerHandle.classList.add('dragging');
      resizerHandle.setPointerCapture(e.pointerId);
      if (api.startResize) api.startResize();
      e.preventDefault();
    });

    resizerHandle.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.screenX - lastScreenX;
      lastScreenX = e.screenX;
      if (Number.isFinite(deltaX) && Math.abs(deltaX) > 0) {
        // Movimento do mouse para a esquerda (deltaX negativo) aumenta a largura do painel lateral direito
        api.resizeDelta(-deltaX);
      }
    });

    function stopDragging(e) {
      if (isDragging) {
        isDragging = false;
        resizerHandle.classList.remove('dragging');
        if (api.endResize) api.endResize();
        try {
          resizerHandle.releasePointerCapture(e.pointerId);
        } catch (err) {}
      }
    }

    resizerHandle.addEventListener('pointerup', stopDragging);
    resizerHandle.addEventListener('pointercancel', stopDragging);
  }
});
