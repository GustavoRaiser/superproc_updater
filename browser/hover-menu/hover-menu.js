// Hover Menu Controller
document.addEventListener('DOMContentLoaded', () => {
  const api = window.hoverAPI;
  if (!api) return;

  const itemsList = document.getElementById('menu-items-list');
  let currentCategory = 'jurisprudencia';
  const ehSub = location.search.includes('sub=1'); // janela do submenu de um grupo
  const ESPERA_SUBMENU_MS = 300;
  let subTimer = null;
  let subAberto = null;
  let grupoAberto = null;
  let keyboardMode = false;
  const rows = () => [...itemsList.querySelectorAll('[role="menuitem"]')];
  function focusRow(el) {
    rows().forEach(row => { row.tabIndex = row === el ? 0 : -1; });
    el?.focus();
    el?.scrollIntoView({block:'nearest'});
  }

  function fecharSub() {
    clearTimeout(subTimer);
    if (subAberto !== null) api.closeSub();
    subAberto = null;
    if (grupoAberto) { grupoAberto.classList.remove('aberto'); grupoAberto.setAttribute('aria-expanded','false'); }
    grupoAberto = null;
  }

  function abrirSub(el, item, keyboard = false) {
    clearTimeout(subTimer);
    if (subAberto === item.id && !keyboard) return;
    if (grupoAberto) { grupoAberto.classList.remove('aberto'); grupoAberto.setAttribute('aria-expanded','false'); }
    subAberto = item.id;
    grupoAberto = el;
    el.classList.add('aberto');
    el.setAttribute('aria-expanded','true');
    api.openSub({ category: currentCategory, groupId: item.id, keyboard, top: Math.round(el.getBoundingClientRect().top) });
  }

  api.onMenuData(({ category, items, esquerda = null, keyboard = false }) => {
    currentCategory = category || 'jurisprudencia';
    keyboardMode = keyboard;
    const labels = {jurisprudencia:'Jurisprudência',legislacao:'Legislação',ferramentas:'Ferramentas',pilha:'Processos relacionados'};
    itemsList.setAttribute('aria-label', labels[currentCategory] || 'Acesso rápido');

    itemsList.innerHTML = '';
    clearTimeout(subTimer);
    subAberto = null;
    grupoAberto = null;
    const list = items || [];
    const duasColunas = !!esquerda && !ehSub;
    itemsList.classList.toggle('duas-colunas', duasColunas);

    const mensagemVazia = (container, texto) => {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'menu-empty-msg';
      emptyEl.textContent = texto;
      container.appendChild(emptyEl);
    };

    function adicionarItem(container, item) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'menu-item';
      el.setAttribute('role','menuitem');
      el.tabIndex = -1;
      el.title = item.nome || '';
      el.innerHTML = `<span class="item-name">${escapeHtml(item.nome)}</span>`;
      if (item.tipo === 'grupo' && !ehSub) {
        // Grupo: 0,3 s com o mouse em cima abre os itens num submenu (à esquerda; na Legislação, à direita); clicar abre na hora.
        el.classList.add('menu-group');
        el.setAttribute('aria-haspopup','menu');
        el.setAttribute('aria-expanded','false');
        el.addEventListener('mouseenter', () => {
          clearTimeout(subTimer);
          if (subAberto !== item.id) subTimer = setTimeout(() => abrirSub(el, item), ESPERA_SUBMENU_MS);
        });
        el.addEventListener('mouseleave', () => clearTimeout(subTimer));
        el.addEventListener('click', (e) => { e.preventDefault(); abrirSub(el, item, e.detail === 0); });
        container.appendChild(el);
        return;
      }
      // Um link comum do menu principal fecha o submenu aberto.
      if (!ehSub) el.addEventListener('mouseenter', fecharSub);
      addTrigger(el, () => {
        if (item.tabId) api.openLink({ tabId: item.tabId }); // pilha de relacionados: ativa a aba
        else api.openLink({ url: item.url, category: currentCategory, title: item.nome, id: item.id });
      });
      container.appendChild(el);
    }

    if (duasColunas) {
      // Legislação: esquerda = catálogo + últimas leis acessadas; direita = Acesso Rápido.
      const esq = document.createElement('div');
      esq.className = 'menu-col col-esq';
      esq.setAttribute('role','group');
      esq.setAttribute('aria-label','Catálogo e últimas leis acessadas');
      if (esquerda.catalogo) adicionarItem(esq, esquerda.catalogo);
      const titulo = document.createElement('div');
      titulo.className = 'menu-secao';
      titulo.textContent = 'Últimas leis acessadas';
      esq.appendChild(titulo);
      const recentes = esquerda.recentes || [];
      if (recentes.length) recentes.forEach(r => adicionarItem(esq, r));
      else mensagemVazia(esq, 'Nenhuma lei acessada ainda');
      const dir = document.createElement('div');
      dir.className = 'menu-col col-dir';
      dir.setAttribute('role','group');
      dir.setAttribute('aria-label','Acesso Rápido');
      if (list.length) list.forEach(item => adicionarItem(dir, item));
      else mensagemVazia(dir, 'Nenhum link cadastrado');
      itemsList.append(esq, dir);
    } else if (list.length === 0) {
      mensagemVazia(itemsList, 'Nenhum link cadastrado');
    } else {
      if (currentCategory === 'pilha') {
        // Legenda dos marcadores da lista de relacionados.
        const legenda = document.createElement('div');
        legenda.className = 'menu-secao';
        legenda.textContent = '● à vista · ○ em segundo plano';
        itemsList.appendChild(legenda);
      }
      list.forEach(item => adicionarItem(itemsList, item));
    }
    if (rows()[0]) rows()[0].tabIndex = 0;
    if (keyboardMode) focusRow(rows()[0]);
  });

  api.onFocusMenu?.(() => {
    keyboardMode = true;
    const parent = grupoAberto || rows()[0];
    if (grupoAberto) { grupoAberto.classList.remove('aberto'); grupoAberto.setAttribute('aria-expanded','false'); }
    subAberto = null; grupoAberto = null;
    focusRow(parent);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    keyboardMode = true;
    api.cancelHide?.(true);
    const list = rows(), focused = document.activeElement;
    const index = list.indexOf(focused);
    if (['ArrowUp','ArrowDown','Home','End'].includes(e.key) && list.length) {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length-1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
      if (list[next] !== grupoAberto) fecharSub();
      focusRow(list[next]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      if (ehSub && e.key === 'Escape') api.closeSub(true);
      else if (subAberto !== null && e.key === 'Escape') { fecharSub(); focusRow(focused); }
      else api.closeMenu();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (ehSub) { e.preventDefault(); api.closeSub(true); }
      else if (focused.classList.contains('menu-group')) { e.preventDefault(); focused.click(); }
    }
  });

  function addTrigger(el, callback) {
    if (!el) return;
    let handled = false;
    const trigger = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (handled) return;
      handled = true;
      callback(e);
      setTimeout(() => { handled = false; }, 400);
    };
    el.addEventListener('pointerdown', trigger);
    el.addEventListener('mousedown', trigger);
    el.addEventListener('click', trigger);
  }

  document.addEventListener('mouseenter', () => {
    if (api.cancelHide) api.cancelHide();
  });

  // Se o mouse sair da janela flutuante, esconder imediatamente
  document.addEventListener('mouseleave', () => {
    api.hideMenu();
  });

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
