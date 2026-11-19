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
  let grupoDoSub = null;   // submenu: id do grupo exibido
  let arrasteLocal = null; // arraste que começou nesta janela: { el, cancelar }
  const CATEGORIAS_ARRASTAVEIS = ['jurisprudencia', 'legislacao', 'ferramentas'];
  const LIMIAR_ARRASTE_PX = 5;
  const ESPERA_ABRIR_GRUPO_ARRASTANDO_MS = 600;
  const arraste = window.SuperprocArrasteAcessoRapido;
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

  api.onMenuData(({ category, items, esquerda = null, keyboard = false, groupId = null, grupoAbertoId = null }) => {
    if (arrasteLocal) arrasteLocal.cancelar();
    limparIndicadores();
    currentCategory = category || 'jurisprudencia';
    keyboardMode = keyboard;
    grupoDoSub = ehSub ? groupId : null;
    const podeArrastar = !!arraste && CATEGORIAS_ARRASTAVEIS.includes(currentCategory);
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

    // arrastavel: itens do Acesso Rápido (não o catálogo/recentes da Legislação nem a pilha de relacionados).
    function adicionarItem(container, item, arrastavel = false) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'menu-item';
      el.setAttribute('role','menuitem');
      el.tabIndex = -1;
      el.title = item.nome || '';
      el.innerHTML = `<span class="item-name">${escapeHtml(item.nome)}</span>`;
      const podeArrastarItem = arrastavel && podeArrastar && typeof item.id === 'string' && !!item.id;
      if (podeArrastarItem) {
        el.dataset.id = item.id;
        el.dataset.tipo = item.tipo === 'grupo' ? 'grupo' : 'link';
        el.dataset.arrastavel = '1';
      }
      if (item.tipo === 'grupo' && !ehSub) {
        // Grupo: 0,3 s com o mouse em cima abre os itens num submenu (à esquerda; na Legislação, à direita); clicar abre na hora.
        el.classList.add('menu-group');
        el.setAttribute('aria-haspopup','menu');
        el.setAttribute('aria-expanded','false');
        el.addEventListener('mouseenter', () => {
          if (arrasteLocal) return;
          clearTimeout(subTimer);
          if (subAberto !== item.id) subTimer = setTimeout(() => abrirSub(el, item), ESPERA_SUBMENU_MS);
        });
        el.addEventListener('mouseleave', () => clearTimeout(subTimer));
        if (podeArrastarItem) ligarGesto(el, item, (teclado) => abrirSub(el, item, teclado));
        else el.addEventListener('click', (e) => { e.preventDefault(); abrirSub(el, item, e.detail === 0); });
        if (item.id === grupoAbertoId) {
          subAberto = item.id; grupoAberto = el;
          el.classList.add('aberto'); el.setAttribute('aria-expanded','true');
        }
        container.appendChild(el);
        return;
      }
      // Um link comum do menu principal fecha o submenu aberto.
      if (!ehSub) el.addEventListener('mouseenter', () => { if (!arrasteLocal) fecharSub(); });
      const abrir = () => {
        if (item.tabId) api.openLink({ tabId: item.tabId }); // pilha de relacionados: ativa a aba
        else api.openLink({ url: item.url, category: currentCategory, title: item.nome, id: item.id });
      };
      if (podeArrastarItem) ligarGesto(el, item, abrir);
      else addTrigger(el, abrir);
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
      dir.dataset.zonaArraste = '1';
      if (list.length) list.forEach(item => adicionarItem(dir, item, true));
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
      list.forEach(item => adicionarItem(itemsList, item, currentCategory !== 'pilha'));
    }
    if (duasColunas) delete itemsList.dataset.zonaArraste;
    else if (podeArrastar && list.length) itemsList.dataset.zonaArraste = '1';
    else delete itemsList.dataset.zonaArraste;
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
    if (arrasteLocal) { // Esc cancela o arraste; as demais teclas são ignoradas até soltar
      e.preventDefault();
      if (e.key === 'Escape') arrasteLocal.cancelar();
      return;
    }
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

  // ── Arrastar e soltar (Acesso Rápido) ─────────────────────────────────────
  // Clicar e soltar sem mover abre o item, como antes. Mover mais de 5 px com o botão apertado arrasta:
  // a janela captura o mouse (os eventos continuam chegando mesmo fora dela) e informa a posição na tela ao
  // host, que a repassa à janela por baixo (menu ou submenu) para ela calcular e mostrar o destino.
  function ligarGesto(el, item, acionar) {
    let inicio = null;
    let arrastando = false;
    let suprimirClique = false;
    const suprimir = () => { suprimirClique = true; setTimeout(() => { suprimirClique = false; }, 400); };
    // fimTela: posição final na tela (o host confere o destino ali antes de gravar).
    const terminar = (pointerId, cancelado, fimTela = null) => {
      if (!inicio) return;
      const foiArraste = arrastando;
      inicio = null;
      arrastando = false;
      try { if (pointerId !== undefined && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId); } catch (_) { /* já solto */ }
      if (foiArraste) {
        suprimir();
        el.classList.remove('origem-arraste');
        document.body.classList.remove('arrastando');
        arrasteLocal = null;
        limparIndicadores();
        api.dragEnd({ cancelado: !!cancelado, ...(fimTela && !cancelado ? fimTela : {}) });
      } else if (!cancelado) {
        suprimir();
        acionar(false);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      inicio = { x: e.screenX, y: e.screenY, pointerId: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* sem captura: o arraste fica restrito à janela */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      if (!arrastando) {
        if (Math.hypot(e.screenX - inicio.x, e.screenY - inicio.y) < LIMIAR_ARRASTE_PX) return;
        arrastando = true;
        clearTimeout(subTimer);
        el.classList.add('origem-arraste');
        document.body.classList.add('arrastando');
        const pointerId = inicio.pointerId;
        arrasteLocal = { el, cancelar: () => terminar(pointerId, true) };
        api.dragStart({ category: currentCategory, id: item.id, grupo: item.tipo === 'grupo', origem: ehSub ? 'sub' : 'menu' });
      }
      api.dragMove({ screenX: e.screenX, screenY: e.screenY });
    });
    el.addEventListener('pointerup', (e) => terminar(e.pointerId, false, { screenX: e.screenX, screenY: e.screenY }));
    el.addEventListener('pointercancel', (e) => terminar(e.pointerId, true));
    el.addEventListener('lostpointercapture', (e) => { if (arrastando) terminar(e.pointerId, true); });
    // Teclado (Enter/Espaço) gera só "click"; o clique do mouse já foi tratado no pointerup.
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (suprimirClique || inicio) return;
      acionar(e.detail === 0);
    });
  }

  let abrirGrupoTimer = null;
  let grupoEmEspera = null;
  function limparIndicadores() {
    document.querySelectorAll('.drop-antes, .drop-depois, .drop-dentro, .drop-fim')
      .forEach(el => el.classList.remove('drop-antes', 'drop-depois', 'drop-dentro', 'drop-fim'));
    clearTimeout(abrirGrupoTimer);
    abrirGrupoTimer = null;
    grupoEmEspera = null;
  }

  // Destino sob o ponto (coordenadas desta janela). Devolve null fora da área arrastável ou sobre o próprio item.
  function destinoNoPonto(d) {
    const zona = itemsList.querySelector('[data-zona-arraste]') || (itemsList.dataset.zonaArraste ? itemsList : null);
    const sob = document.elementFromPoint(d.x, d.y);
    if (!zona || !sob || !zona.contains(sob)) return null;
    const linha = sob.closest('.menu-item[data-arrastavel]');
    if (!linha) return { linha: null, zona, alvo: { alvoId: null, posicao: 'fim' } };
    if (linha.dataset.id === d.id) return null;
    const posicao = arraste.zonaDaLinha(linha.getBoundingClientRect(), d.y,
      { linhaEhGrupo: !ehSub && linha.dataset.tipo === 'grupo', arrastandoGrupo: d.arrastandoGrupo === true });
    return { linha, zona, alvo: { alvoId: linha.dataset.id, posicao } };
  }

  api.onDragOver?.((d) => {
    if (!d) { limparIndicadores(); return; }
    const destino = destinoNoPonto(d);
    const anteriorEspera = grupoEmEspera;
    document.querySelectorAll('.drop-antes, .drop-depois, .drop-dentro, .drop-fim')
      .forEach(el => el.classList.remove('drop-antes', 'drop-depois', 'drop-dentro', 'drop-fim'));
    // Autorrolagem perto das bordas da lista.
    const r = itemsList.getBoundingClientRect();
    if (d.y < r.top + 16) itemsList.scrollTop -= 12;
    else if (d.y > r.bottom - 16) itemsList.scrollTop += 12;
    if (!destino) {
      clearTimeout(abrirGrupoTimer); abrirGrupoTimer = null; grupoEmEspera = null;
      api.dragTarget({ seq: d.seq, alvo: null });
      return;
    }
    if (destino.linha) destino.linha.classList.add('drop-' + destino.alvo.posicao);
    else destino.zona.classList.add('drop-fim');
    // Parar sobre um grupo (arrastando do menu principal) abre o submenu dele, como nos favoritos do navegador.
    const linhaGrupo = destino.alvo.posicao === 'dentro' && d.origem !== 'sub' ? destino.linha : null;
    if (linhaGrupo !== anteriorEspera) {
      clearTimeout(abrirGrupoTimer);
      abrirGrupoTimer = null;
      grupoEmEspera = linhaGrupo;
      if (linhaGrupo && subAberto !== linhaGrupo.dataset.id) {
        abrirGrupoTimer = setTimeout(() => {
          if (grupoEmEspera === linhaGrupo && linhaGrupo.isConnected) abrirSub(linhaGrupo, { id: linhaGrupo.dataset.id });
        }, ESPERA_ABRIR_GRUPO_ARRASTANDO_MS);
      }
    }
    api.dragTarget({ seq: d.seq, alvo: destino.alvo });
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
    if (arrasteLocal) return; // arrastando: o menu só fecha ao soltar
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
