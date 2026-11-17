// SuperPROC Browser - Titlebar Controller
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.superprocAPI;
  if (!api) {
    console.error('superprocAPI não encontrado!');
    return;
  }

  // Elementos da Interface
  const tabsList = document.getElementById('tabs-list');
  const btnNewTab = document.getElementById('btn-new-tab');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');
  const iconMaximize = document.getElementById('icon-maximize');
  const iconRestore = document.getElementById('icon-restore');

  const menuCfgContainer = document.getElementById('menu-cfg-container');
  const btnCfg = document.getElementById('btn-cfg');
  const btnJuris = document.getElementById('btn-juris');
  const btnLeis = document.getElementById('btn-leis');
  const btnFerramentas = document.getElementById('btn-ferramentas');
  api.onPopupMenuState?.(({triggerId,open}) => {
    document.getElementById(triggerId)?.setAttribute('aria-expanded',String(!!open));
  });
  api.onPopupMenuFocus?.((triggerId) => {
    document.getElementById(triggerId)?.focus();
  });
  api.onToolbarFocus?.(() => {
    const selected = tabsList.querySelector('[role="tab"][aria-selected="true"]') || tabsList.querySelector('[role="tab"]');
    (selected || btnJuris).focus();
    selected?.scrollIntoView({block:'nearest',inline:'nearest'});
  });

  const listJuris = document.getElementById('list-juris');
  const listLeis = document.getElementById('list-leis');
  const btnManageJuris = document.getElementById('btn-manage-juris');
  const btnManageLeis = document.getElementById('btn-manage-leis');

  // Extensões & Ações do CFG
  const btnOpenAzflow = document.getElementById('btn-open-azflow');
  const btnOpenSuperproc = document.getElementById('btn-open-superproc');
  const btnFocusUrl = document.getElementById('btn-focus-url');
  const btnOpenLinksManager = document.getElementById('btn-open-links-manager');
  const btnReloadPage = document.getElementById('btn-reload-page');
  const btnSavePage = document.getElementById('btn-save-page');
  const btnClearCache = document.getElementById('btn-clear-cache');
  const btnDevtools = document.getElementById('btn-devtools');

  // Downloads, Histórico & Arquivos
  const btnDownloads = document.getElementById('btn-downloads');
  const btnHistory = document.getElementById('btn-history');
  const btnOpenDownloadsFolder = document.getElementById('btn-open-downloads-folder');
  const btnClearDownloadsHistory = document.getElementById('btn-clear-downloads-history');
  const downloadsListItems = document.getElementById('downloads-list-items');

  // CFG Downloads
  const cfgDownloadPathDisplay = document.getElementById('cfg-download-path-display');
  const btnChooseDownloadFolder = document.getElementById('btn-choose-download-folder');
  const chkAutoDownload = document.getElementById('chk-auto-download');

  // URL Bar Modal
  const urlBarOverlay = document.getElementById('url-bar-overlay');
  const activeUrlInput = document.getElementById('active-url-input');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnGoUrl = document.getElementById('btn-go-url');
  const btnCloseUrlBar = document.getElementById('btn-close-url-bar');
  const urlStatusMessage = document.getElementById('url-status-message');

  // Links Manager Modal
  const linksManagerModal = document.getElementById('links-manager-modal');
  const btnCloseLinksModal = document.getElementById('btn-close-links-modal');
  const btnModalDone = document.getElementById('btn-modal-done');
  const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
  const newLinkName = document.getElementById('new-link-name');
  const newLinkUrl = document.getElementById('new-link-url');
  const btnAddLink = document.getElementById('btn-add-link');
  const linksTableBody = document.getElementById('links-table-body');

  let currentConfig = null;
  let activeCategory = 'juris'; // 'juris' ou 'leis'


  // Controles de Navegação (Voltar e Avançar)
  const btnNavBack = document.getElementById('btn-nav-back');
  const btnNavForward = document.getElementById('btn-nav-forward');

  function getActiveNavTargetId() {
    const activeTab = currentTabs && currentTabs.find(t => t.active);
    if (activeTab && activeTab.isSplit && activeTab.subtabs) {
      const root = activeTab.subtabs.find(s => s.role === 'capa');
      if (root) return root.id;
      const activeSub = activeTab.subtabs.find(s => s.active);
      return activeSub ? activeSub.id : activeTab.activeSubTabId;
    } else if (activeTab) {
      return activeTab.id;
    }
    return null;
  }

  if (btnNavBack) btnNavBack.addEventListener('click', () => api.goBack(getActiveNavTargetId()));
  if (btnNavForward) btnNavForward.addEventListener('click', () => api.goForward(getActiveNavTargetId()));

  // --- 1. CONTROLES DE JANELA ---
  btnMinimize.addEventListener('click', () => api.minimizeWindow());
  btnMaximize.addEventListener('click', () => api.maximizeWindow());
  btnClose.addEventListener('click', () => api.closeWindow());

  api.onWindowStateChange((state) => {
    btnMaximize.setAttribute('aria-label', state.isMaximized ? 'Restaurar janela' : 'Maximizar janela');
    if (state.isMaximized) {
      iconMaximize.classList.add('hidden');
      iconRestore.classList.remove('hidden');
    } else {
      iconMaximize.classList.remove('hidden');
      iconRestore.classList.add('hidden');
    }
  });

  // --- 2. SISTEMA DE ABAS (COM SUPORTE A VISUALIZAÇÃO DIVIDIDA / SPLIT VIEW) ---
  const defaultFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239ba7b9"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
  const capaFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%230284c7"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
  const arvoreFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2316a34a"><path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10H4v3h7v-3h2v3h7v-3h-7V8h2v3h7z"/></svg>';
  const editorFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23d97706"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  let currentTabs = [];
  let latestNavbarPercent = null;
  let lastWasSplit = null;

  function applyTitlebarGradient(isSplit) {
    let percent = latestNavbarPercent;
    if (percent === null || percent === undefined) {
      percent = isSplit ? 48 : 100;
    }
    percent = Math.min(100, Math.max(10, percent));
    document.documentElement.style.setProperty(
      '--bg-titlebar',
      `linear-gradient(90deg, #006599 0%, #12B0D0 ${percent}%, #12B0D0 100%)`
    );
  }

  let lastTabsSignature = '';
  let renderedTabs = new Map();
  // Cada seleção é um tab real, separado dos botões auxiliares de atualizar/fechar.
  // Ícones desenhados (um só traço, 1.5): nada de glifos de texto (× ↻) como ícone.
  const SVG_ABRE = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
  const ICON_CLOSE = SVG_ABRE + '<path d="M3 3l6 6M9 3l-6 6"/></svg>';
  const ICON_REFRESH = SVG_ABRE + '<path d="M10 6.2A4 4 0 1 1 8.6 3.1"/><path d="M9.2 1.1v2.4H6.8"/></svg>';

  function identifyTab(control, id, label, selected) {
    control.type = 'button';
    control.setAttribute('role', 'tab');
    control.setAttribute('aria-label', label);
    control.setAttribute('aria-selected', String(!!selected));
    control.dataset.tabId = id;
    control.dataset.tabFocus = 'select:' + id;
    control.tabIndex = -1; // a faixa de abas é só de clique: nada nela entra na ordem do Tab
  }
  const ICON_PLUS = SVG_ABRE + '<path d="M6 2v8M2 6h8"/></svg>';
  // Coluna fora da aba: × (fecha a aba inteira, processo principal e relacionados) sobre + (nova aba logo depois desta).
  function attachTabSide(tabEl, { fecharTitulo, aoFechar, depoisDeId }) {
    const side = document.createElement('div');
    side.className = 'tab-side';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'tab-side-close';
    x.innerHTML = ICON_CLOSE;
    x.title = fecharTitulo;
    x.setAttribute('aria-label', fecharTitulo);
    x.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); aoFechar(); });
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'tab-side-new';
    plus.innerHTML = ICON_PLUS;
    plus.title = 'Nova aba logo depois desta';
    plus.setAttribute('aria-label', 'Nova aba logo depois desta');
    plus.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); api.newTab(undefined, depoisDeId); });
    side.appendChild(x);
    side.appendChild(plus);
    tabEl.appendChild(side);
  }
  // Clicar nunca deixa foco nos controles da faixa (sem controles "presos" abertos, sem navegação por Tab).
  tabsList.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
  tabsList.addEventListener('focusin', (e) => { if (e.target && typeof e.target.blur === 'function') e.target.blur(); });
  btnNewTab.tabIndex = -1;
  btnNewTab.addEventListener('mousedown', (e) => e.preventDefault());
  // A roda do mouse rola a faixa de abas na horizontal (a barra não tem rolagem visível).
  tabsList.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && tabsList.scrollWidth > tabsList.clientWidth) {
      tabsList.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
  // Pilha de processos relacionados: UMA aba com um segmento por processo, na ordem de abertura. O processo em foco fica
  // expandido (ícones capa/árvore/editor + número); os demais ficam compactos (só o número), à esquerda ou à direita dele.
  const MAX_COMPACTOS = 4; // acima disso, os mais distantes do foco viram um chip "+N" que abre a lista
  const topoDaPilha = new Map(); // stackId -> alvo do processo em foco (anima só quando o foco muda)
  function rotuloCurto(rotulo) {
    const m = String(rotulo || '').match(/^(\d{7}-\d{2})/);
    return m ? m[1] : String(rotulo || 'Processo');
  }
  // Número curto (0000755-88); se dois processos da pilha colidirem no curto, o ano entra (0000755-88/2019).
  function etiquetasDaPilha(membros) {
    const curtos = membros.map((m) => rotuloCurto(m.rotulo));
    return membros.map((m, i) => {
      const ano = String(m.rotulo || '').match(/^\d{7}-\d{2}\.(\d{4})/);
      return ano && curtos.filter((c) => c === curtos[i]).length > 1 ? `${curtos[i]}/${ano[1]}` : curtos[i];
    });
  }
  function raizAlvoDaPilha(tab) {
    const raiz = tab.stack && (tab.stack.membros || []).find((m) => m.raiz);
    return raiz ? raiz.alvo : null;
  }
  function attachStackSegments(tabEl, tab, firstEl, lastEl, titleEl) {
    if (!tab.stack || tab.stack.total < 2) return;
    const membros = tab.stack.membros || [];
    const iTopo = membros.findIndex((m) => m.topo);
    if (iTopo < 0 || !firstEl || !lastEl) return;
    tabEl.classList.add('has-stack');
    const etiquetas = etiquetasDaPilha(membros);
    if (titleEl) titleEl.textContent = etiquetas[iTopo];
    const alvoTopo = membros[iTopo].alvo;
    const anterior = topoDaPilha.get(tab.stack.id);
    if (anterior !== undefined && anterior !== alvoTopo) tabEl.classList.add('stack-foco-mudou');
    topoDaPilha.set(tab.stack.id, alvoTopo);

    const outros = membros.map((m, i) => ({ m, i })).filter((x) => x.i !== iTopo);
    const visiveis = new Set(outros.slice()
      .sort((x, y) => Math.abs(x.i - iTopo) - Math.abs(y.i - iTopo) || x.i - y.i)
      .slice(0, MAX_COMPACTOS).map((x) => x.i));
    const ocultos = outros.filter((x) => !visiveis.has(x.i));

    const chip = ({ m: mm, i }) => {
      const m = { ...mm, i };
      const wrap = document.createElement('div');
      wrap.className = 'stack-chip ' + (i < iTopo ? 'antes' : 'depois');
      wrap.setAttribute('role', 'presentation');
      const sel = document.createElement('button');
      sel.className = 'stack-chip-select';
      identifyTab(sel, m.alvo, `Processo ${m.rotulo}`, false);
      sel.textContent = etiquetas[i];
      sel.title = `Processo ${m.rotulo}${m.raiz ? ' (origem)' : ''}`;
      sel.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); api.switchProcess(m.alvo); });
      const x = document.createElement('button');
      x.className = 'stack-chip-close';
      x.type = 'button';
      x.innerHTML = ICON_CLOSE;
      x.title = `Fechar o processo ${etiquetas[i]}`;
      x.setAttribute('aria-label', `Fechar o processo ${etiquetas[i]}`);
      x.dataset.tabFocus = 'close-chip:' + m.alvo;
      x.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); api.closeWholeTab(m.alvo); });
      wrap.addEventListener('auxclick', (e) => { if (e.button === 1) { e.stopPropagation(); e.preventDefault(); api.closeWholeTab(m.alvo); } });
      wrap.addEventListener('contextmenu', (e) => { e.stopPropagation(); e.preventDefault(); });
      // Cada processo da pilha mostra suas sub-abas abertas (capa/editor/árvore); o ícone realçado é o que está à vista.
      const icones = (m.subtabs || []).map((sub) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stack-chip-icon';
        const nome = sub.role === 'capa' ? 'Capa' : sub.role === 'editor' ? 'Editor de minuta' : sub.role === 'arvore' ? 'Árvore de documentos' : 'Aba';
        identifyTab(b, sub.id, `${nome} — ${m.rotulo}`, false);
        b.title = `${nome} do processo ${etiquetas[m.i !== undefined ? m.i : 0]}`;
        const img = document.createElement('img');
        img.className = 'tab-favicon';
        img.alt = '';
        img.src = sub.favicon || (sub.role === 'capa' ? capaFavicon : sub.role === 'editor' ? editorFavicon : sub.role === 'arvore' ? arvoreFavicon : defaultFavicon);
        b.appendChild(img);
        b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); api.switchSubtab(sub.id); });
        b.addEventListener('contextmenu', (e) => { e.stopPropagation(); e.preventDefault(); api.showSplitTabContextMenu({ tabId: sub.id, coords: { x: e.clientX, y: e.clientY } }); });
        return b;
      });
      icones.forEach((b) => wrap.appendChild(b));
      wrap.appendChild(sel);
      wrap.appendChild(x);
      return wrap;
    };

    outros.filter((x) => visiveis.has(x.i) && x.i < iTopo).forEach((x) => tabEl.insertBefore(chip(x), firstEl));
    const depois = lastEl.nextSibling || null;
    outros.filter((x) => visiveis.has(x.i) && x.i > iTopo).forEach((x) => tabEl.insertBefore(chip(x), depois));
    if (ocultos.length) {
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'stack-chip-more';
      mais.id = 'related-' + tab.stack.id;
      mais.textContent = `+${ocultos.length}`;
      mais.setAttribute('aria-haspopup', 'menu');
      mais.setAttribute('aria-label', `Mais ${ocultos.length} processos relacionados: abrir a lista`);
      mais.title = `Mais ${ocultos.length} processos relacionados: clique para ver a lista (Alt+PageDown e Alt+PageUp alternam)`;
      mais.dataset.tabFocus = 'related:' + tab.stack.id;
      mais.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const rect = tabEl.getBoundingClientRect();
        api.showHoverMenu({ category: 'pilha', stackId: tab.stack.id, keyboard: e.detail === 0, triggerId: mais.id, x: Math.max(0, Math.round(rect.right - 230)), y: Math.round(rect.bottom) });
      });
      tabEl.insertBefore(mais, depois);
    }
  }

  function renderTabs(tabs) {
    const signature=JSON.stringify(tabs);
    if(signature===lastTabsSignature)return;
    lastTabsSignature=signature;
    const nextRendered=new Map();
    currentTabs = tabs || [];
    const activeTab = currentTabs.find(t => t.active);
    const isSplit = !!(activeTab && (activeTab.isSplit || (activeTab.subtabs && activeTab.subtabs.length > 1)));

    if (lastWasSplit !== null && lastWasSplit !== isSplit) {
      latestNavbarPercent = isSplit ? 48 : 100;
    }
    lastWasSplit = isSplit;

    applyTitlebarGradient(isSplit);


    tabs.forEach((tab, index) => {
      // Entradas de grupo/split não têm 'id' (só groupId ou subtabs): a chave precisa ser única,
      // senão vários grupos colidem em 'undefined' e deixam nós órfãos (só visuais) no DOM.
      const key=tab.id!=null?`tab:${tab.id}`:tab.groupId!=null?`group:${tab.groupId}`:`split:${(tab.subtabs||[]).map(s=>s.id).join('+')||index}`;
      const signature=JSON.stringify([tab,index,index===tabs.length-1]);
      const existing=renderedTabs.get(key);
      if(existing?.signature===signature){tabsList.appendChild(existing.node);nextRendered.set(key,existing);return;}
      const start=Array.from(tabsList.children);
      if (tab.isSplit) {
        const subtabs = tab.subtabs || (tab.left && tab.right ? [tab.left, tab.right] : []);
        const tabEl = document.createElement('div');
        tabEl.className = `browser-tab is-split ${tab.active ? 'active' : ''} count-${subtabs.length}`;
        tabEl.setAttribute('role','presentation');

        // --- LAYOUT UNIFICADO (2 OU 3 ABAS): APENAS ÍCONES NA ESQUERDA + NÚMERO DO PROCESSO NA DIREITA ---
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'split-icons-container';

        subtabs.forEach((sub) => {
          // Um container não-botão permite ter um botão de fechar próprio sem
          // aninhar <button> dentro de <button> (HTML inválido e instável).
          const btn = document.createElement('div');
          btn.setAttribute('role', 'group');
          // No sistema triplo (3 abas), aplica 'is-active-icon' apenas nas 2 abas visíveis na tela.
          // No sistema duplo (2 abas), ambas estão sempre visíveis e não precisam de destaque.
          const isActive = (!tab.stack && subtabs.length === 3 && sub.isOnScreen) ? 'is-active-icon' : '';
          btn.className = `split-icon-btn role-${sub.role || 'default'} ${isActive}`.trim();
          
          let roleName = 'Aba';
          let roleFallback = defaultFavicon;
          if (sub.role === 'capa') {
            roleName = 'CAPA';
            roleFallback = capaFavicon;
          } else if (sub.role === 'editor') {
            roleName = 'Editor de Minuta';
            roleFallback = editorFavicon;
          } else if (sub.role === 'arvore') {
            roleName = 'Árvore de Documentos';
            roleFallback = arvoreFavicon;
          }
          btn.title = `${roleName} (clique para alternar / botão do meio para fechar)`;
          btn.setAttribute('aria-label', roleName);

          const selectSubBtn = document.createElement('button');
          selectSubBtn.className = 'split-tab-select';
          identifyTab(selectSubBtn, sub.id, `${roleName} — ${tab.groupProcNumber || 'Processo'}`, tab.active && sub.active);
          selectSubBtn.addEventListener('click', (e) => { e.stopPropagation(); (tab.stack ? api.switchSubtab : api.switchTab)(sub.id); });

          const favEl = document.createElement('img');
          favEl.className = 'tab-favicon';
          favEl.src = sub.favicon || roleFallback;
          favEl.alt = '';
          selectSubBtn.appendChild(favEl);
          btn.appendChild(selectSubBtn);

          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            (tab.stack ? api.switchSubtab : api.switchTab)(sub.id);
          });

          btn.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
              e.stopPropagation();
              e.preventDefault();
              api.closeTab(sub.id);
            }
          });

          btn.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            api.showSplitTabContextMenu({
              tabId: sub.id,
              coords: { x: e.clientX, y: e.clientY }
            });
          });

          const closeSubBtn = document.createElement('button');
          closeSubBtn.className = 'split-subtab-close-btn';
          closeSubBtn.innerHTML = ICON_CLOSE;
          closeSubBtn.title = `Fechar ${roleName}`;
          closeSubBtn.setAttribute('aria-label', `Fechar ${roleName}`);
          closeSubBtn.dataset.tabFocus = 'close:' + sub.id;
          closeSubBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            api.closeTab(sub.id);
          });
          btn.appendChild(closeSubBtn);

          const refreshSubBtn = document.createElement('button');
          refreshSubBtn.className = 'split-subtab-refresh-btn';
          refreshSubBtn.innerHTML = ICON_REFRESH;
          refreshSubBtn.title = `Atualizar ${roleName}`;
          refreshSubBtn.setAttribute('aria-label', `Atualizar ${roleName}`);
          refreshSubBtn.dataset.tabFocus = 'reload:' + sub.id;
          refreshSubBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            api.reloadTab(sub.id);
          });
          btn.insertBefore(refreshSubBtn, selectSubBtn);

          iconsContainer.appendChild(btn);
        });

        tabEl.appendChild(iconsContainer);

        const rightGroup = document.createElement('div');
        rightGroup.className = 'split-tab-right';

        const procNumber = tab.groupProcNumber || subtabs.find(s => s.role === 'arvore' || s.role === 'editor')?.procNumber || subtabs.find(s => s.procNumber)?.procNumber || subtabs.find(s => s.role === 'arvore')?.displayTitle || 'Processo';
        const procEl = document.createElement('span');
        procEl.className = 'split-tab-proc';
        procEl.textContent = procNumber;
        procEl.title = `Processo ${procNumber}`;

        rightGroup.appendChild(procEl);
        tabEl.appendChild(rightGroup);

        const alvoGrupo = tab.activeSubTabId || subtabs.find(s => s.active)?.id || subtabs[0]?.id;
        // Numa pilha, o × externo fecha tudo: parte da origem, que pergunta (fechar tudo / só este / cancelar).
        attachTabSide(tabEl, {
          fecharTitulo: tab.stack ? 'Fechar o processo principal e os relacionados' : 'Fechar todas as abas deste processo',
          aoFechar: () => { const alvo = raizAlvoDaPilha(tab) || alvoGrupo; if (alvo) api.closeWholeTab(alvo); },
          depoisDeId: alvoGrupo
        });

        tabEl.addEventListener('click', () => {
          const activeSub = subtabs.find(s => s.active);
          const targetId = activeSub ? activeSub.id : (tab.activeSubTabId || (subtabs[0] && subtabs[0].id) || tab.id);
          if (targetId) {
            (tab.stack ? api.switchProcess : api.switchTab)(targetId);
          }
        });

        tabEl.addEventListener('auxclick', (e) => {
          if (e.button === 1) {
            e.stopPropagation();
            e.preventDefault();
            const activeSub = subtabs.find(s => s.active);
            const targetId = activeSub ? activeSub.id : (tab.activeSubTabId || (subtabs[0] && subtabs[0].id) || tab.id);
            if (targetId) {
              api.closeTab(targetId);
            }
          }
        });

        tabEl.addEventListener('contextmenu', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const activeSub = subtabs.find(s => s.active);
          const targetId = activeSub ? activeSub.id : (tab.activeSubTabId || (subtabs[0] && subtabs[0].id) || tab.id);
          if (targetId) {
            api.showSplitTabContextMenu({
              tabId: targetId,
              coords: { x: e.clientX, y: e.clientY }
            });
          }
        });

        attachStackSegments(tabEl, tab, iconsContainer, rightGroup, procEl);
        tabsList.appendChild(tabEl);
        attachTabDrag(tabEl, index);
      } else {
        // Aba Individual Padrão
        const tabEl = document.createElement('div');
        tabEl.className = `browser-tab ${tab.active ? 'active' : ''}`;
        tabEl.setAttribute('role','presentation');
        tabEl.dataset.tabId = tab.id;

        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src = tab.favicon || defaultFavicon;
        favicon.alt = '';

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'simple-tab-refresh-btn';
        refreshBtn.innerHTML = ICON_REFRESH;
        refreshBtn.title = 'Atualizar esta aba';
        refreshBtn.setAttribute('aria-label', 'Atualizar esta aba');
        refreshBtn.dataset.tabFocus = 'reload:' + tab.id;
        refreshBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          api.reloadTab(tab.id);
        });

        const title = document.createElement('button');
        title.className = 'tab-title';
        identifyTab(title, tab.id, tab.title || 'Nova Aba', tab.active);
        title.textContent = tab.title || 'Nova Aba';
        title.title = tab.title || tab.url || 'Nova Aba';

        tabEl.appendChild(refreshBtn);
        tabEl.appendChild(favicon);
        tabEl.appendChild(title);
        attachTabSide(tabEl, {
          fecharTitulo: tab.stack ? 'Fechar o processo principal e os relacionados' : `Fechar ${tab.title || 'aba'}`,
          aoFechar: () => { const raizAlvo = raizAlvoDaPilha(tab); if (raizAlvo) api.closeWholeTab(raizAlvo); else api.closeTab(tab.id); },
          depoisDeId: tab.id
        });

        tabEl.addEventListener('click', () => {
          api.switchTab(tab.id);
        });

        tabEl.addEventListener('auxclick', (e) => {
          if (e.button === 1) {
            e.stopPropagation();
            e.preventDefault();
            api.closeTab(tab.id);
          }
        });

        attachStackSegments(tabEl, tab, refreshBtn, title, title);
        tabsList.appendChild(tabEl);
        attachTabDrag(tabEl, index);
      }
      const node=Array.from(tabsList.children).find(n=>!start.includes(n));
      if(node)nextRendered.set(key,{signature,node});
    });
    for(const [key,entry] of renderedTabs)if(nextRendered.get(key)?.node!==entry.node)entry.node.remove();
    // Rede de segurança: nenhum nó fora do cache atual pode permanecer na barra.
    const alive=new Set(Array.from(nextRendered.values(),e=>e.node));
    Array.from(tabsList.children).forEach(n=>{if(!alive.has(n))n.remove();});
    renderedTabs=nextRendered;
    // Com muitas abas, a ativa nunca fica escondida fora da área rolável.
    if (typeof tabsList.querySelector === 'function') {
      const ativa = tabsList.querySelector('.browser-tab.active');
      if (ativa && typeof ativa.scrollIntoView === 'function') ativa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    tabsList.querySelectorAll('button').forEach((b) => { b.tabIndex = -1; });
    // O + global só existe se não houver nenhuma aba; cada aba traz o seu + ao lado.
    btnNewTab.hidden = currentTabs.length > 0;
    // Qualquer foco que sobrar na faixa é solto (a faixa é só de clique).
    if (document.activeElement && tabsList.contains(document.activeElement) && typeof document.activeElement.blur === 'function') document.activeElement.blur();
  }

  // Rede de segurança do arraste: se o pointerup se perder (soltar fora da janela, foco trocado), o estado "reordenando" deixava
  // as abas com pointer-events:none e a barra inteira sem resposta a cliques. Qualquer movimento sem botão pressionado,
  // perda de foco ou novo clique encerra o arraste preso.
  let limparArrasteAtivo = null;
  function destravarArraste() {
    if (limparArrasteAtivo) { try { limparArrasteAtivo(); } catch (_) {} }
    if (tabsList.classList.contains('is-reordering')) {
      tabsList.classList.remove('is-reordering');
      tabsList.style.overflow = '';
      tabsList.querySelectorAll('.browser-tab').forEach((t) => { t.style.transform = ''; t.style.zIndex = ''; t.style.transition = ''; t.classList.remove('is-dragging', 'drop-merge'); });
      document.body.style.userSelect = '';
    }
  }
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('pointermove', (e) => { if (e.buttons === 0) destravarArraste(); }, true);
    document.addEventListener('pointerdown', () => { if (!limparArrasteAtivo) destravarArraste(); }, true);
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('blur', destravarArraste);

  function attachTabDrag(tabEl, index) {
    tabEl.addEventListener('pointerdown', (e) => {
      // Aceita apenas o botão principal (esquerdo)
      if (e.button !== 0) return;

      // Atualizar, fechar, abrir e alternar subabas têm seus próprios gestos.
      const control = e.target.closest('button, [role="button"]');
      if (control && !control.matches('.tab-title[role="tab"]')) {
        return;
      }

      const allTabs = Array.from(tabsList.querySelectorAll('.browser-tab'));
      if (allTabs.length <= 1) return;

      const pointerId = e.pointerId;
      const startX = e.clientX;
      let isDragging = false;
      const fromIndex = index;
      let targetIndex = index;
      let tabRect0 = null;
      let scrollLeft0 = 0;
      let semRolagem = false;
      let mergeIndex = -1;       // aba sob o cursor há tempo suficiente: soltar aqui empilha os processos
      let mergeCandidate = -1;
      let mergeTimer = null;
      const limparMerge = () => { clearTimeout(mergeTimer); mergeTimer = null; mergeCandidate = -1; if (mergeIndex >= 0) allTabs[mergeIndex]?.classList.remove('drop-merge'); mergeIndex = -1; };

      // Medição precisa da distância entre abas (largura + margens reais)
      const firstRect = allTabs[0].getBoundingClientRect();
      const secondRect = allTabs[1] ? allTabs[1].getBoundingClientRect() : null;
      const slotWidth = secondRect ? (secondRect.left - firstRect.left) : (firstRect.width + 4);

      function onPointerMove(moveEv) {
        if (moveEv.pointerId !== pointerId) return;
        let deltaX = moveEv.clientX - startX;

        if (!isDragging) {
          if (Math.abs(deltaX) > 4) {
            isDragging = true;
            limparArrasteAtivo = cleanup;
            tabRect0 = tabEl.getBoundingClientRect();
            scrollLeft0 = tabsList.scrollLeft;
            // Sem rolagem, a lista é mais estreita que o espaço livre da barra e cortaria a aba arrastada: libera o recorte.
            semRolagem = tabsList.scrollWidth <= tabsList.clientWidth + 1;
            if (semRolagem) tabsList.style.overflow = 'visible';
            try {
              tabEl.setPointerCapture(pointerId);
            } catch (err) {}
            document.body.style.userSelect = 'none';
            tabsList.classList.add('is-reordering');
            tabEl.classList.add('is-dragging');
            tabEl.style.zIndex = '1000';
            tabEl.style.transition = 'none';
          } else {
            return;
          }
        }

        moveEv.preventDefault();

        // A aba só anda no espaço livre da barra: entre o botão "Avançar" e o primeiro menu da direita (Jurisprudência).
        const navDir = document.getElementById('btn-nav-forward');
        const acoes = document.getElementById('actions-section');
        let limEsq = navDir ? navDir.getBoundingClientRect().right + 2 : 0;
        let limDir = acoes ? acoes.getBoundingClientRect().left - 2 : window.innerWidth;
        if (!semRolagem) {
          const lr = tabsList.getBoundingClientRect();
          limEsq = Math.max(limEsq, lr.left);
          limDir = Math.min(limDir, lr.right);
        }
        if (tabRect0) {
          const naturalEsq = tabRect0.left - (tabsList.scrollLeft - scrollLeft0);
          const minDx = limEsq - naturalEsq;
          // A coluna × / + fica fora da aba (na margem direita): também não pode encostar em Jurisprudência.
          const colunaLateral = (parseFloat(getComputedStyle(tabEl).marginRight) || 0) + 6;
          const maxDx = limDir - colunaLateral - (naturalEsq + tabRect0.width);
          deltaX = maxDx < minDx ? minDx : Math.max(minDx, Math.min(maxDx, deltaX));
        }

        // Deslocamento suave da aba arrastada acompanhando o cursor do mouse
        tabEl.style.transform = `translateX(${deltaX}px)`;

        // Cálculo da nova posição ordinal pretendida
        const shift = Math.round(deltaX / slotWidth);
        const newTarget = Math.max(0, Math.min(allTabs.length - 1, fromIndex + shift));

        if (newTarget !== targetIndex) {
          targetIndex = newTarget;
        }

        // Parar o cursor sobre o miolo de OUTRA aba (~0,5 s) arma "empilhar": soltar ali une os processos em uma aba.
        let sob = -1;
        allTabs.forEach((sibling, i) => {
          if (i === fromIndex) return;
          const r = sibling.getBoundingClientRect();
          if (moveEv.clientX > r.left + r.width * 0.25 && moveEv.clientX < r.right - r.width * 0.25) sob = i;
        });
        if (sob !== mergeCandidate) {
          limparMerge();
          if (sob >= 0) {
            mergeCandidate = sob;
            mergeTimer = setTimeout(() => { mergeIndex = sob; allTabs[sob].classList.add('drop-merge'); }, 500);
          }
        }

        // Animação fluida das abas irmãs abrindo o espaço da nova posição
        allTabs.forEach((sibling, i) => {
          if (i === fromIndex) return;

          if (fromIndex < targetIndex) {
            // Arrastando para a direita: abas entre fromIndex + 1 e targetIndex deslizam para a esquerda
            if (i > fromIndex && i <= targetIndex) {
              sibling.style.transform = `translateX(${-slotWidth}px)`;
            } else {
              sibling.style.transform = '';
            }
          } else if (fromIndex > targetIndex) {
            // Arrastando para a esquerda: abas entre targetIndex e fromIndex - 1 deslizam para a direita
            if (i >= targetIndex && i < fromIndex) {
              sibling.style.transform = `translateX(${slotWidth}px)`;
            } else {
              sibling.style.transform = '';
            }
          } else {
            sibling.style.transform = '';
          }
        });

        // Rolagem suave automática ao aproximar das bordas da lista de abas
        const listRect = tabsList.getBoundingClientRect();
        if (moveEv.clientX < listRect.left + 35) {
          tabsList.scrollLeft -= 8;
        } else if (moveEv.clientX > listRect.right - 35) {
          tabsList.scrollLeft += 8;
        }
      }

      function cleanup() {
        limparMerge();
        if (limparArrasteAtivo === cleanup) limparArrasteAtivo = null;
        tabEl.removeEventListener('pointermove', onPointerMove);
        tabEl.removeEventListener('pointerup', onPointerUp);
        tabEl.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('keydown', onKeyDown);

        try {
          if (tabEl.hasPointerCapture(pointerId)) {
            tabEl.releasePointerCapture(pointerId);
          }
        } catch (err) {}

        document.body.style.userSelect = '';
        tabsList.style.overflow = '';
        tabsList.classList.remove('is-reordering');

        allTabs.forEach((t) => {
          t.style.transform = '';
          t.style.zIndex = '';
          t.style.transition = '';
        });
        tabEl.classList.remove('is-dragging');
      }

      function onPointerUp(upEv) {
        if (upEv.pointerId !== pointerId) return;

        if (isDragging) {
          // Intercepta e anula o click residual que seria disparado
          tabEl.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
          }, { capture: true, once: true });

          const unir = mergeIndex;
          limparMerge();
          cleanup();

          if (unir >= 0) {
            api.mergeTabStack(fromIndex, unir);
          } else if (targetIndex !== fromIndex) {
            api.reorderTab(fromIndex, targetIndex);
          }
        } else {
          cleanup();
        }
      }

      function onPointerCancel() {
        cleanup();
      }

      function onKeyDown(keyEv) {
        if (keyEv.key === 'Escape') {
          cleanup();
        }
      }

      tabEl.addEventListener('pointermove', onPointerMove);
      tabEl.addEventListener('pointerup', onPointerUp);
      tabEl.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  api.onTabsUpdated((tabs) => renderTabs(tabs));
  btnNewTab.addEventListener('click', () => api.newTab());

  // Modo Integrada com Copilot: a barra começa à direita da coluna (que cobre toda a altura à esquerda)
  if (api.onTitlebarInset) {
    api.onTitlebarInset((data) => {
      const left = data && Number.isFinite(data.left) ? Math.max(0, Math.round(data.left)) : 0;
      document.documentElement.style.setProperty('--recuo-esquerdo', left + 'px');
    });
  }

  // Botão do Copilot (só no modo Integrada com Copilot): alterna mostrar/ocultar a coluna; ela continua ativa oculta.
  (function configurarBotaoCopilot() {
    const btn = document.getElementById('btn-copilot-coluna');
    if (!btn || !api.onCopilotColuna) return;
    const img = btn.querySelector('img');
    const GENERICO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1l1.8 4.6L14.5 7l-4.7 1.4L8 13l-1.8-4.6L1.5 7l4.7-1.4z" fill="#ffffff"/></svg>');
    let temIcone = false, tentativas = 0;
    function pintar(d) {
      if (!d) return;
      btn.hidden = !d.disponivel;
      btn.classList.toggle('oculta', !d.visivel);
      btn.setAttribute('aria-pressed', d.visivel ? 'true' : 'false');
      btn.title = d.visivel ? 'Copilot ativo. Clique para ocultar' : 'Copilot oculto. Clique para mostrar';
      if (typeof d.icone === 'string' && /^data:image\//.test(d.icone)) { img.src = d.icone; temIcone = true; }
      else if (!temIcone) img.src = GENERICO;
      if (d.disponivel && !temIcone && tentativas++ < 6) setTimeout(() => api.getCopilotColuna().then(pintar).catch(() => {}), 5000); // ícone oficial chega quando a coluna carrega
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => (api.cliqueCopilotColuna ? api.cliqueCopilotColuna('esquerdo') : api.toggleCopilotColuna()));
    api.onCopilotColuna(pintar);
    api.getCopilotColuna().then(pintar).catch(() => {});
  })();

  // Atualiza dinamicamente o gradiente com base no percentual exato medido da página/navbar
  api.onNavbarWidthUpdated((data) => {
    if (data && typeof data.percent === 'number') {
      latestNavbarPercent = data.percent;
      const activeTab = currentTabs && currentTabs.find(t => t.active);
      const isSplit = !!(activeTab && (activeTab.isSplit || (activeTab.subtabs && activeTab.subtabs.length > 1)));
      applyTitlebarGradient(isSplit);
    }
  });

  function isLightOrWhite(colorStr) {
    if (!colorStr) return true;
    if (colorStr.startsWith('#')) {
      let hex = colorStr.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 190;
    }
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
      return (r * 299 + g * 587 + b * 114) / 1000 > 190;
    }
    return false;
  }

  // --- 3. MENUS HOVER: JURIS & LEIS ---
  function renderDropdownLinks() {
    // Os menus atuais são janelas separadas; suas listas não existem na titlebar.
    if (!currentConfig || !listJuris || !listLeis) return;

    // Render Juris
    listJuris.innerHTML = '';
    (currentConfig.juris || []).forEach((item) => {
      const el = document.createElement('a');
      el.className = 'dropdown-item';
      el.href = '#';
      el.innerHTML = `<span class="dropdown-item-name">${escapeHtml(item.nome)}</span>`;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        api.openInPanel({ url: item.url, category: 'jurisprudencia', title: item.nome });
      });
      listJuris.appendChild(el);
    });

    // Render Leis
    listLeis.innerHTML = '';
    (currentConfig.leis || []).forEach((item) => {
      const el = document.createElement('a');
      el.className = 'dropdown-item';
      el.href = '#';
      el.innerHTML = `<span class="dropdown-item-name">${escapeHtml(item.nome)}</span>`;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        api.openInPanel({ url: item.url, category: 'legislacao', title: item.nome });
      });
      listLeis.appendChild(el);
    });
  }

  if (btnCfg) {
    const triggerCfg = (e) => {
      // Somente o botão esquerdo abre o menu normal; o direito abre o menu secreto (contextmenu abaixo)
      if (e && typeof e.button === 'number' && e.button !== 0) return;
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const rect = btnCfg.getBoundingClientRect();
      api.showCfgMenu({
        x: Math.round(rect.right - 290),
        y: Math.round(rect.bottom + 2),
        keyboard: e?.type === 'keydown' || (e?.type === 'click' && e.detail === 0)
      });
    };
    btnCfg.addEventListener('click', triggerCfg);
    btnCfg.addEventListener('pointerdown', triggerCfg);
    btnCfg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); triggerCfg(e); }
    });

    // Menu secreto de desenvolvedor: botão direito na engrenagem
    btnCfg.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = btnCfg.getBoundingClientRect();
      api.showCfgMenu({
        x: Math.round(rect.right - 290),
        y: Math.round(rect.bottom + 2),
        keyboard: e.detail === 0,
        mode: 'dev'
      });
    });
  }

  function setupHoverButton(btn, category) {
    if (!btn) return;
    const show = (e, keyboard = false) => {
      if (e && (e.type === 'click' || e.type === 'pointerdown')) {
        e.preventDefault();
        e.stopPropagation();
      }
      const rect = btn.getBoundingClientRect();
      api.showHoverMenu({
        category,
        triggerId: btn.id,
        keyboard: keyboard || (e?.type === 'click' && e.detail === 0),
        x: Math.round(rect.left),
        right: Math.round(rect.right),
        y: Math.round(rect.bottom)
      });
    };

    btn.addEventListener('mouseenter', (e) => show(e));
    btn.addEventListener('mousemove', (e) => show(e));
    btn.addEventListener('click', (e) => show(e));
    btn.addEventListener('pointerdown', (e) => show(e));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); show(e,true); }
    });

    btn.addEventListener('mouseleave', () => {
      api.hideHoverMenu(false);
    });
  }

  setupHoverButton(btnJuris, 'jurisprudencia');
  setupHoverButton(btnLeis, 'legislacao');
  setupHoverButton(btnFerramentas, 'ferramentas');

  // Ações dentro do CFG
  if (btnOpenAzflow) {
    btnOpenAzflow.addEventListener('click', (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      menuCfgContainer.classList.remove('open');
      const rect = btnCfg ? btnCfg.getBoundingClientRect() : null;
      const coords = rect ? { x: Math.round(rect.right - 480), y: Math.round(rect.bottom + 2) } : null;
      api.openExtensionOptions('azflow', coords);
    });
  }

  if (btnOpenSuperproc) {
    btnOpenSuperproc.addEventListener('click', (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      menuCfgContainer.classList.remove('open');
      const rect = btnCfg ? btnCfg.getBoundingClientRect() : null;
      const coords = rect ? { x: Math.round(rect.right - 480), y: Math.round(rect.bottom + 2) } : null;
      api.openExtensionOptions('superproc', coords);
    });
  }

  btnReloadPage.addEventListener('click', () => {
    menuCfgContainer.classList.remove('open');
    api.reloadTab();
  });

  if (btnSavePage) {
    btnSavePage.addEventListener('click', () => {
      menuCfgContainer.classList.remove('open');
      api.savePage();
    });
  }

  btnClearCache.addEventListener('click', async () => {
    menuCfgContainer.classList.remove('open');
    await api.clearCache();
    alert('Cache do navegador limpo com sucesso!');
  });

  btnDevtools.addEventListener('click', () => {
    menuCfgContainer.classList.remove('open');
    api.toggleDevTools();
  });

  // --- 4.1 DOWNLOADS & HISTÓRICO (JANELAS FLUTUANTES EM PRIMEIRO PLANO) ---
  if (btnDownloads) {
    const triggerDownloads = (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const rect = btnDownloads.getBoundingClientRect();
      if (api.showDownloadsMenu) {
        api.showDownloadsMenu({
          x: Math.round(rect.right - 360),
          y: Math.round(rect.bottom + 2)
        });
      }
    };
    btnDownloads.addEventListener('click', triggerDownloads);
    btnDownloads.addEventListener('pointerdown', triggerDownloads);
  }

  if (btnHistory) {
    const triggerHistory = (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const rect = btnHistory.getBoundingClientRect();
      if (api.showHistoryMenu) {
        api.showHistoryMenu({
          x: Math.round(rect.right - 420),
          y: Math.round(rect.bottom + 2)
        });
      }
    };
    btnHistory.addEventListener('click', triggerHistory);
    btnHistory.addEventListener('pointerdown', triggerHistory);
  }

  // CFG Downloads controls
  async function refreshDownloadConfigUI() {
    if (!api.getDownloadConfig) return;
    try {
      const dlConfig = await api.getDownloadConfig();
      if (cfgDownloadPathDisplay) {
        cfgDownloadPathDisplay.textContent = dlConfig.downloadPath || 'Padrão do Sistema (Downloads)';
        cfgDownloadPathDisplay.title = dlConfig.downloadPath || 'Padrão do Sistema';
      }
      if (chkAutoDownload) {
        chkAutoDownload.checked = !!dlConfig.autoDownload;
      }
    } catch (_) {}
  }

  if (btnChooseDownloadFolder) {
    btnChooseDownloadFolder.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (api.selectDownloadFolder) {
        const chosen = await api.selectDownloadFolder();
        if (chosen && cfgDownloadPathDisplay) {
          cfgDownloadPathDisplay.textContent = chosen;
          cfgDownloadPathDisplay.title = chosen;
        }
      }
    });
  }

  if (chkAutoDownload) {
    chkAutoDownload.addEventListener('change', async () => {
      if (api.setDownloadConfig) {
        await api.setDownloadConfig({ autoDownload: chkAutoDownload.checked });
      }
    });
  }


  if (api.onDownloadsUpdated) {
    api.onDownloadsUpdated((data) => {
      if (data && data.recent) {
        renderDownloadsList(data.recent);
      }
    });
  }

  // --- 5. RECURSO: "FOCAR URL ATUAL" ---
  async function openUrlFocusBar() {
    menuCfgContainer.classList.remove('open');
    urlStatusMessage.textContent = '';
    const activeUrl = await api.getActiveUrl();
    activeUrlInput.value = activeUrl || '';
    urlBarOverlay.classList.remove('hidden');
    setTimeout(() => {
      activeUrlInput.focus();
      activeUrlInput.select();
    }, 50);
  }

  btnFocusUrl.addEventListener('click', openUrlFocusBar);
  btnCloseUrlBar.addEventListener('click', () => urlBarOverlay.classList.add('hidden'));

  btnCopyUrl.addEventListener('click', async () => {
    if (activeUrlInput.value) {
      await navigator.clipboard.writeText(activeUrlInput.value);
      urlStatusMessage.textContent = '✓ URL copiada para a área de transferência!';
      setTimeout(() => {
        urlStatusMessage.textContent = '';
      }, 3000);
    }
  });

  btnGoUrl.addEventListener('click', () => {
    const target = activeUrlInput.value.trim();
    if (target) {
      let finalUrl = target;
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }
      api.navigateTo(finalUrl);
      urlBarOverlay.classList.add('hidden');
    }
  });

  activeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnGoUrl.click();
    } else if (e.key === 'Escape') {
      urlBarOverlay.classList.add('hidden');
    }
  });

  // --- 6. MODAL DO GERENCIADOR DE LINKS (JURIS & LEIS) ---
  function openLinksManager(tab = 'juris') {
    menuCfgContainer.classList.remove('open');
    activeCategory = tab;
    updateModalTabsUI();
    renderLinksListTable();
    linksManagerModal.classList.remove('hidden');
    newLinkName.value = '';
    newLinkUrl.value = '';
    newLinkName.focus();
  }

  if (btnManageJuris) {
    btnManageJuris.addEventListener('click', () => api.openDialog('manage-links'));
  }
  if (btnManageLeis) {
    btnManageLeis.addEventListener('click', () => api.openDialog('manage-links'));
  }
  if (btnOpenLinksManager) {
    btnOpenLinksManager.addEventListener('click', () => {
      menuCfgContainer.classList.remove('open');
      api.openDialog('manage-links');
    });
  }

  btnCloseLinksModal.addEventListener('click', () => linksManagerModal.classList.add('hidden'));
  btnModalDone.addEventListener('click', () => linksManagerModal.classList.add('hidden'));

  modalTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.tab;
      updateModalTabsUI();
      renderLinksListTable();
    });
  });

  function updateModalTabsUI() {
    modalTabBtns.forEach((btn) => {
      if (btn.dataset.tab === activeCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function renderLinksListTable() {
    linksTableBody.innerHTML = '';
    const items = (currentConfig && currentConfig[activeCategory]) || [];

    if (items.length === 0) {
      linksTableBody.innerHTML = '<div style="padding: 10px; color: #718296; text-align: center;">Nenhum link cadastrado nesta categoria.</div>';
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = `
        <div class="link-info">
          <span class="link-name">${escapeHtml(item.nome)}</span>
          <span class="link-url">${escapeHtml(item.url)}</span>
        </div>
        <div class="link-actions">
          <button class="action-btn-del" title="Excluir">✕</button>
        </div>
      `;

      row.querySelector('.action-btn-del').addEventListener('click', async () => {
        if (confirm(`Remover "${item.nome}"?`)) {
          currentConfig = await api.removeLink(activeCategory, item.id);
          renderLinksListTable();
          renderDropdownLinks();
        }
      });

      linksTableBody.appendChild(row);
    });
  }

  btnAddLink.addEventListener('click', async () => {
    const nome = newLinkName.value.trim();
    let url = newLinkUrl.value.trim();

    if (!nome || !url) {
      alert('Por favor, informe o Nome e a URL do link.');
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    currentConfig = await api.addLink(activeCategory, nome, url);
    newLinkName.value = '';
    newLinkUrl.value = '';
    newLinkName.focus();
    renderLinksListTable();
    renderDropdownLinks();
  });

  // --- 7. ATALHOS DE TECLADO GLOBAIS DA TITLEBAR ---
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (api.openFind) api.openFind('tab');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openUrlFocusBar();
    } else if (e.key === 'F5') {
      e.preventDefault();
      api.reloadTab();
    } else if (e.ctrlKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      api.newTab();
    } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (api.closeWholeTab) api.closeWholeTab();
      else api.closeTab();
    } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      api.closeTab();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      if (api.showHistoryMenu) {
        const rect = btnHistory ? btnHistory.getBoundingClientRect() : { right: window.innerWidth - 100, bottom: 35 };
        api.showHistoryMenu({
          x: Math.round(rect.right - 420),
          y: Math.round(rect.bottom + 2)
        });
      }
    }
  });

  // --- INICIALIZAÇÃO DE DADOS ---
  currentConfig = await api.getConfig();
  renderDropdownLinks();
  refreshDownloadConfigUI();

  api.onConfigUpdated((newCfg) => {
    currentConfig = newCfg;
    renderDropdownLinks();
    renderLinksListTable();
  });

  // Carregar abas existentes
  const initialTabs = await api.getTabs();
  if (initialTabs) renderTabs(initialTabs);

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
