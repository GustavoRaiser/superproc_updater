(function() {
  const card = document.getElementById('cfg-card');
  const menuMain = document.getElementById('menu-main');
  const menuDev = document.getElementById('menu-dev');
  const itemAddons = document.getElementById('item-addons');
  const flyout = document.getElementById('flyout-addons');
  const itemAbertura = document.getElementById('item-abertura');
  const flyoutAbertura = document.getElementById('flyout-abertura');
  const descDoisMonitores = document.getElementById('desc-dois-monitores');
  const inputCopilot = document.getElementById('pct-copilot');
  const inputArvore = document.getElementById('pct-arvore');
  const rowPctCopilot = document.getElementById('row-pct-copilot');
  const rowPctArvore = document.getElementById('row-pct-arvore');
  const switchColuna = document.getElementById('switch-coluna-copilot');
  // Mesmas faixas de layout-geometry.js (o host também limita; aqui só evita mostrar valor fora da faixa)
  const PCT = { copilot: { min: 15, max: 50, el: inputCopilot, atual: 25 }, arvore: { min: 20, max: 80, el: inputArvore, atual: 50 } };
  // Submenus: só um aberto por vez; ambos têm a mesma largura (a janela do menu cresce igual).
  const itemAtualizacao = document.getElementById('item-atualizacao');
  const flyoutAtualizacao = document.getElementById('flyout-atualizacao');
  const flyouts = { addons: { item: itemAddons, el: flyout }, abertura: { item: itemAbertura, el: flyoutAbertura }, atualizacao: { item: itemAtualizacao, el: flyoutAtualizacao },
    conta: { item: document.getElementById('item-conta'), el: document.getElementById('flyout-conta') } };
  let conta = { status: 'sem-sessao' }; // estado da conta Microsoft (ver renderConta)
  let activeFlyout = null;
  let modoAbertura = 'integrada';
  let colunaCopilot = false;
  let relacionadosPilha = true;
  const switchRelacionados = document.getElementById('switch-relacionados-pilha');
  let doisMonitoresDisponivel = false;
  const btnUpdate = document.getElementById('btn-update');
  const updateBtnText = document.getElementById('update-btn-text');
  const checkDebugger = document.getElementById('check-debugger');
  const itemDebugger = document.getElementById('item-debugger');

  // Estado de carregamento dos addons (true = carregado; alterações são aplicadas na hora pelo host)
  const loading = { azflow: false, epryx: false, superproc: false, pdf: true };
  const installed = { azflow: false, epryx: false, superproc: false }; // nenhuma extensão vem instalada: o usuário instala
  let isDebuggerEnabled = false;
  let flyoutOpen = false;
  let closeTimer = null;
  let currentMode = 'main';
  let keyboardNavigation = false;
  const visibleControl = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0;
  const controlsIn = (root) => [...root.querySelectorAll('button,input,[role="radio"]')].filter(visibleControl);

  // ---------- Ajuste da janela (altura e área do submenu) ----------
  // Sem piscar (30/10/2026): no menu principal a janela já fica com a largura e a altura de que os submenus
  // precisam; abrir/fechar um submenu só mostra/oculta o elemento, sem redimensionar nem mover a janela.
  const topoDoSubmenu = (f) => Math.max(6, f.item.getBoundingClientRect().top - 7);
  function fundoDoSubmenu(f) {
    const oculto = f.el.classList.contains('hidden');
    const visibilidade = f.el.style.visibility;
    if (oculto) { f.el.style.visibility = 'hidden'; f.el.classList.remove('hidden'); }
    f.el.style.top = topoDoSubmenu(f) + 'px';
    const fundo = f.el.getBoundingClientRect().bottom;
    if (oculto) { f.el.classList.add('hidden'); f.el.style.visibility = visibilidade; }
    return fundo;
  }
  async function fitWindow() {
    // Altura NATURAL do cartão (scrollHeight + bordas): o max-height (100vh) corta o cartão na altura atual da
    // janela; medir o retângulo cortado pedia a mesma altura de novo e o menu ficava parcial com rolagem.
    const caixa = card.getBoundingClientRect();
    let bottom = caixa.top + card.scrollHeight + (card.offsetHeight - card.clientHeight);
    const largo = currentMode === 'main';
    if (largo) for (const f of Object.values(flyouts)) bottom = Math.max(bottom, fundoDoSubmenu(f));
    const height = Math.ceil(bottom + 8);
    if (window.api && window.api.layout) {
      try {
        const res = await window.api.layout({ flyout: largo, height });
        document.body.classList.toggle('flyout-right', !!(largo && res && res.side === 'right'));
        return res;
      } catch (_) { /* janela fechando */ }
    }
    return null;
  }

  // ---------- Submenu Addons ----------
  const marcadoresAddons = new Map(
    [...flyout.querySelectorAll('.addon-row[data-key] .addon-icon')]
      .map(icone => [icone.closest('.addon-row').dataset.key, icone.cloneNode(true)])
  );

  function aplicarIconesNativos(icones) {
    // O leitor PDF mantém o marcador vermelho "PDF" (não usa o ícone do manifest da extensão).
    for (const key of ['azflow', 'epryx', 'superproc']) {
      const alvo = flyout.querySelector('.addon-row[data-key="' + key + '"] .addon-icon');
      const url = icones && typeof icones[key] === 'string' && icones[key].startsWith('data:image/') && installed[key] ? icones[key] : null;
      if (!alvo) continue;
      const voltarAoMarcador = (icone) => icone.replaceWith(marcadoresAddons.get(key).cloneNode(true));
      if (!url) {
        if (alvo.tagName === 'IMG') voltarAoMarcador(alvo);
        continue;
      }
      if (alvo.tagName === 'IMG') {
        if (alvo.getAttribute('src') !== url) alvo.src = url;
        continue;
      }
      const img = document.createElement('img');
      img.className = 'addon-icon';
      img.alt = '';
      img.addEventListener('error', () => voltarAoMarcador(img), { once: true });
      img.src = url;
      alvo.replaceWith(img);
    }
  }
  function renderSwitches() {
    flyout.querySelectorAll('.switch').forEach((sw) => {
      const key = sw.dataset.toggle, falta = key in installed && !installed[key];
      sw.setAttribute('aria-checked', String(!!loading[key] && !falta));
      sw.closest('.addon-row')?.classList.toggle('not-installed', falta);
    });
    // Extensões não instaladas vão para o fim da lista (ordem original entre as demais).
    const rodape = flyout.querySelector('.flyout-footer');
    const linhas = ['azflow', 'epryx', 'superproc', 'pdf'].map(k => flyout.querySelector('.addon-row[data-key="' + k + '"]')).filter(Boolean);
    [...linhas.filter(r => !r.classList.contains('not-installed')), ...linhas.filter(r => r.classList.contains('not-installed'))].forEach(r => flyout.insertBefore(r, rodape));
  }

  async function openFlyout(name = 'addons', focus = false) {
    clearTimeout(closeTimer);
    if (currentMode !== 'main') return;
    const target = flyouts[name];
    if (activeFlyout && activeFlyout !== name) {
      // Troca de submenu: fecha o anterior sem encolher a janela
      flyouts[activeFlyout].item.classList.remove('open');
      flyouts[activeFlyout].item.setAttribute('aria-expanded', 'false');
      flyouts[activeFlyout].el.classList.add('hidden');
    }
    activeFlyout = name;
    target.item.classList.add('open');
    target.item.setAttribute('aria-expanded', 'true');
    target.el.style.top = topoDoSubmenu(target) + 'px';
    flyoutOpen = true;
    // A janela já tem o espaço do submenu (fitWindow ao abrir o menu): só exibe.
    target.el.style.visibility = 'visible';
    target.el.classList.remove('hidden');
    if (focus) (target.el.querySelector('[role="radio"][aria-checked="true"]') || controlsIn(target.el)[0])?.focus();
  }

  async function closeFlyout() {
    clearTimeout(closeTimer);
    if (activeFlyout) {
      flyouts[activeFlyout].item.classList.remove('open');
      flyouts[activeFlyout].item.setAttribute('aria-expanded', 'false');
    }
    if (!flyoutOpen) return;
    flyoutOpen = false;
    for (const f of Object.values(flyouts)) f.el.classList.add('hidden');
    activeFlyout = null;
  }

  // A janela é mais larga/alta que o cartão (espaço dos submenus): clique na área transparente = clique fora, fecha o menu.
  document.addEventListener('mousedown', (e) => {
    if (card.contains(e.target) || Object.values(flyouts).some((f) => !f.el.classList.contains('hidden') && f.el.contains(e.target))) return;
    e.preventDefault();
    if (window.api && window.api.closeMenu) window.api.closeMenu();
  });

  function scheduleClose() {
    clearTimeout(closeTimer);
    if (keyboardNavigation) return;
    closeTimer = setTimeout(closeFlyout, 220);
  }

  for (const [name, f] of Object.entries(flyouts)) {
    f.item.addEventListener('mouseenter', () => openFlyout(name));
    f.item.addEventListener('mouseleave', scheduleClose);
    f.item.addEventListener('click', (e) => {
      e.stopPropagation();
      // Sem login, clicar na conta inicia o login (o submenu só explica); com login, abre/fecha o submenu de atalhos.
      if (name === 'conta' && conta.limitada !== true && conta.status !== 'autenticada') { if (conta.status !== 'entrando') window.api.sendAction('conta-entrar'); return; }
      (flyoutOpen && activeFlyout === name) ? closeFlyout() : openFlyout(name, e.detail === 0);
    });
    f.el.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    f.el.addEventListener('mouseleave', scheduleClose);
  }

  document.addEventListener('pointermove', () => { keyboardNavigation = false; });
  document.addEventListener('keydown', (e) => {
    keyboardNavigation = true;
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const focused = document.activeElement;
    const entry = Object.entries(flyouts).find(([,f]) => f.item === focused);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (activeFlyout) {
        const parent = flyouts[activeFlyout].item;
        closeFlyout(); parent.focus();
      } else window.api.closeMenu(true);
      return;
    }
    if (entry && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); openFlyout(entry[0], true); return;
    }
    if (focused.matches('input,[role="radio"]')) return;
    const inFlyout = activeFlyout && flyouts[activeFlyout].el.contains(focused);
    const backKey = document.body.classList.contains('flyout-right') ? 'ArrowLeft' : 'ArrowRight';
    if (inFlyout && e.key === backKey) {
      e.preventDefault();
      const parent = flyouts[activeFlyout].item;
      closeFlyout(); parent.focus(); return;
    }
    if (!['ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
    const root = inFlyout ? flyouts[activeFlyout].el : (currentMode === 'dev' ? menuDev : menuMain);
    const controls = controlsIn(root), index = controls.indexOf(focused);
    if (!controls.length) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? controls.length-1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus();
  });

  // ---------- Atualização do próprio SuperPROC ----------
  const switchAtualVerificar = document.getElementById('switch-atualizacao-verificar');
  const switchAtualAutomatica = document.getElementById('switch-atualizacao-automatica');
  const btnAtualAcao = document.getElementById('btn-atualizacao-acao');
  const textoAtualAcao = document.getElementById('atualizacao-acao-texto');
  const statusAtual = document.getElementById('atualizacao-status');
  let atualVerificar = true, atualAutomatica = false;
  let atualStatus = { fase: 'ocioso', mensagem: '' };
  const ROTULO_ACAO = { ocioso: 'VERIFICAR AGORA', atual: 'VERIFICAR AGORA', erro: 'TENTAR DE NOVO', verificando: 'VERIFICANDO…', disponivel: 'BAIXAR ATUALIZAÇÃO', baixando: 'BAIXANDO…', extraindo: 'CONFERINDO…', pronto: 'INSTALAR E REINICIAR', instalando: 'INSTALANDO…' };
  function renderAtualizacao() {
    switchAtualVerificar.setAttribute('aria-checked', String(atualVerificar));
    switchAtualAutomatica.setAttribute('aria-checked', String(atualAutomatica));
    const fase = atualStatus.fase in ROTULO_ACAO ? atualStatus.fase : 'ocioso';
    const ocupado = ['verificando', 'baixando', 'extraindo', 'instalando'].includes(fase);
    textoAtualAcao.textContent = fase === 'baixando' && Number.isFinite(atualStatus.progresso) ? 'BAIXANDO ' + atualStatus.progresso + '%' : ROTULO_ACAO[fase];
    btnAtualAcao.disabled = ocupado;
    btnAtualAcao.classList.toggle('updating', ocupado);
    statusAtual.textContent = atualStatus.mensagem || '';
  }
  switchAtualVerificar.addEventListener('click', (e) => {
    e.stopPropagation();
    atualVerificar = !atualVerificar;
    if (!atualVerificar) atualAutomatica = false; // automática exige a verificação ligada
    renderAtualizacao();
    window.api.sendAction('atualizacao-set-verificar', { ligado: atualVerificar });
  });
  switchAtualAutomatica.addEventListener('click', (e) => {
    e.stopPropagation();
    atualAutomatica = !atualAutomatica;
    if (atualAutomatica) atualVerificar = true;
    renderAtualizacao();
    window.api.sendAction('atualizacao-set-automatica', { ligado: atualAutomatica });
  });
  btnAtualAcao.addEventListener('click', (e) => { e.stopPropagation(); if (!btnAtualAcao.disabled) window.api.sendAction('atualizacao-acao'); });
  if (window.api && window.api.onAppUpdateStatus) {
    window.api.onAppUpdateStatus((s) => {
      if (!s || typeof s !== 'object') return;
      atualStatus = s;
      if (typeof s.verificar === 'boolean') atualVerificar = s.verificar;
      if (typeof s.automatica === 'boolean') atualAutomatica = s.automatica;
      renderAtualizacao();
    });
  }

  // ---------- Modo de abertura ----------
  function renderModoAbertura() {
    flyoutAbertura.querySelectorAll('.mode-row').forEach((row) => {
      const modo = row.dataset.modo;
      const indisponivel = modo === 'doisMonitores' && !doisMonitoresDisponivel;
      row.setAttribute('aria-checked', String(modo === modoAbertura));
      row.tabIndex = modo === modoAbertura && !indisponivel ? 0 : -1;
      if (indisponivel) row.setAttribute('aria-disabled', 'true');
      else row.removeAttribute('aria-disabled');
    });
    switchColuna.setAttribute('aria-checked', String(colunaCopilot));
    switchRelacionados.setAttribute('aria-checked', String(relacionadosPilha));
    inputCopilot.disabled = !colunaCopilot;
    rowPctCopilot.classList.toggle('desligado', !colunaCopilot);
    // Em Dois monitores a árvore ocupa o outro monitor inteiro: o percentual da árvore não se aplica
    const arvoreSemEfeito = modoAbertura === 'doisMonitores' && doisMonitoresDisponivel;
    inputArvore.disabled = arvoreSemEfeito;
    rowPctArvore.classList.toggle('desligado', arvoreSemEfeito);
    descDoisMonitores.textContent = doisMonitoresDisponivel
      ? 'Árvore/documentos no monitor oposto.'
      : 'Indisponível: requer exatamente 2 monitores.';
  }

  function escolherModo(row) {
    if (row.getAttribute('aria-disabled') === 'true') return;
    modoAbertura = row.dataset.modo;
    renderModoAbertura();
    window.api.sendAction('set-open-mode', { modo: modoAbertura });
  }

  switchRelacionados.addEventListener('click', (e) => {
    e.stopPropagation();
    relacionadosPilha = !relacionadosPilha;
    renderModoAbertura();
    window.api.sendAction('set-relacionados-em-pilha', { ligado: relacionadosPilha });
  });

  switchColuna.addEventListener('click', (e) => {
    e.stopPropagation();
    colunaCopilot = !colunaCopilot;
    renderModoAbertura();
    window.api.sendAction('set-coluna-copilot', { ligada: colunaCopilot });
  });

  // Percentuais do layout: gravam ao confirmar (Enter, sair do campo ou setas do campo)
  function mostrarPct() {
    for (const campo of Object.values(PCT)) campo.el.value = String(campo.atual);
  }
  function confirmarPct(nome) {
    const campo = PCT[nome];
    let n = Math.round(Number(String(campo.el.value).replace(',', '.')));
    if (!Number.isFinite(n)) n = campo.atual;
    n = Math.min(campo.max, Math.max(campo.min, n));
    campo.atual = n;
    campo.el.value = String(n);
    window.api.sendAction('set-layout-pct', { campo: nome, valor: n });
  }
  for (const nome of Object.keys(PCT)) {
    PCT[nome].el.addEventListener('change', () => confirmarPct(nome));
    PCT[nome].el.addEventListener('click', (e) => e.stopPropagation());
    PCT[nome].el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  }

  flyoutAbertura.querySelectorAll('.mode-row').forEach((row) => {
    row.addEventListener('click', (e) => { e.stopPropagation(); escolherModo(row); });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolherModo(row); }
      else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        const rows = [...flyoutAbertura.querySelectorAll('.mode-row')].filter(visibleControl);
        const index = rows.indexOf(row);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length-1 : (index + (['ArrowUp','ArrowLeft'].includes(e.key) ? -1 : 1) + rows.length) % rows.length;
        if (rows[next]) { escolherModo(rows[next]); rows[next].focus(); }
      }
    });
  });

  // Chaves liga/desliga: salvam a preferência e o host aplica na hora, sem fechar o menu
  flyout.querySelectorAll('.switch').forEach((sw) => {
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = sw.dataset.toggle;
      if (key in installed && !installed[key]) { window.api.sendAction('install-ext-' + key, { silent: false }); return; }
      loading[key] = !loading[key];
      renderSwitches();
      window.api.sendAction('toggle-load-' + key, { enabled: loading[key], silent: true });
    });
  });

  flyout.querySelectorAll('[data-install]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('install-ext-' + btn.dataset.install); });
  });

  // Clique no nome/ícone abre as opções do addon (AZflow, Epryx, SuperPROC)
  flyout.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.closest('.addon-row')?.classList.contains('not-installed')) return; // sem instalação não há opções
      window.api.sendAction(btn.dataset.open);
    });
  });

  if (btnUpdate) {
    btnUpdate.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnUpdate.classList.contains('updating')) return;
      btnUpdate.classList.add('updating');
      updateBtnText.textContent = '⏳';
      window.api.sendAction('force-update');
    });
  }

  // Fechar o submenu ao passar o mouse em qualquer outro item do cartão
  menuMain.querySelectorAll('.menu-item:not(.has-flyout)').forEach((item) => {
    item.addEventListener('mouseenter', scheduleClose);
  });

  // ---------- Atalho "Colar PDF da árvore no Copilot" ----------
  // Clique em "Definir…" e pressione a combinação. Durante a captura, Esc cancela (mantém o atalho antigo) e
  // Delete/Backspace remove o atalho; fora da captura essas teclas não fazem nada aqui.
  const btnAtalho = document.getElementById('btn-atalho-pdf');
  const btnAtalhoLimpar = document.getElementById('btn-atalho-limpar');
  const statusAtalho = document.getElementById('atalho-status');
  const Nucleo = window.AtalhoAcesso;
  let atalhoPdf = null;
  let capturando = false;

  function mostrarStatusAtalho(texto) {
    statusAtalho.textContent = texto || '';
    statusAtalho.classList.toggle('hidden', !texto);
    fitWindow();
  }
  function renderAtalho() {
    btnAtalho.classList.toggle('capturando', capturando);
    btnAtalho.textContent = capturando ? 'Pressione… (Esc cancela, Del remove)' : (atalhoPdf ? Nucleo.descrever(atalhoPdf) : 'Definir…');
    btnAtalhoLimpar.classList.toggle('hidden', !atalhoPdf || capturando);
  }
  function pararCaptura() {
    capturando = false;
    window.removeEventListener('keydown', aoTeclaCaptura, true);
    document.removeEventListener('mousedown', aoCliqueFora, true);
    renderAtalho();
  }
  function iniciarCaptura() {
    if (capturando) return;
    capturando = true;
    mostrarStatusAtalho('');
    window.addEventListener('keydown', aoTeclaCaptura, true);
    document.addEventListener('mousedown', aoCliqueFora, true);
    renderAtalho();
  }
  function aoCliqueFora(e) { if (!btnAtalho.contains(e.target)) pararCaptura(); }
  function aoTeclaCaptura(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const semModificador = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (e.code === 'Escape' && semModificador) { pararCaptura(); mostrarStatusAtalho('Cancelado: o atalho anterior foi mantido.'); return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && semModificador) {
      pararCaptura();
      window.api.sendAction('set-atalho-pdf', { atalho: null });
      return;
    }
    const r = Nucleo.avaliarTecla(e);
    if (r.estado === 'aguardar') return; // só modificadores até agora
    if (r.estado === 'recusado') { mostrarStatusAtalho(r.motivo); return; } // continua capturando
    pararCaptura();
    window.api.sendAction('set-atalho-pdf', { atalho: r.atalho });
  }
  btnAtalho.addEventListener('click', (e) => { e.stopPropagation(); iniciarCaptura(); });
  btnAtalhoLimpar.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.sendAction('set-atalho-pdf', { atalho: null });
  });
  document.getElementById('item-atalho-pdf').addEventListener('click', (e) => e.stopPropagation());

  // ---------- Atalho do botão "Minuta" do Copilot (mesma captura; ação própria) ----------
  const btnMn = document.getElementById('btn-atalho-mn');
  const btnMnLimpar = document.getElementById('btn-atalho-mn-limpar');
  const statusMn = document.getElementById('atalho-mn-status');
  let atalhoMn = null, capturandoMn = false;
  function mostrarStatusMn(texto) { statusMn.textContent = texto || ''; statusMn.classList.toggle('hidden', !texto); }
  function renderMn() {
    btnMn.classList.toggle('capturando', capturandoMn);
    btnMn.textContent = capturandoMn ? 'Pressione… (Esc cancela, Del remove)' : (atalhoMn ? Nucleo.descrever(atalhoMn) : 'Definir…');
    btnMnLimpar.classList.toggle('hidden', !atalhoMn || capturandoMn);
  }
  function pararCapturaMn() {
    capturandoMn = false;
    window.removeEventListener('keydown', aoTeclaCapturaMn, true);
    document.removeEventListener('mousedown', aoCliqueForaMn, true);
    renderMn();
  }
  function aoCliqueForaMn(e) { if (!btnMn.contains(e.target)) pararCapturaMn(); }
  function aoTeclaCapturaMn(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const semModificador = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (e.code === 'Escape' && semModificador) { pararCapturaMn(); mostrarStatusMn('Cancelado: o atalho anterior foi mantido.'); return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && semModificador) { pararCapturaMn(); window.api.sendAction('set-atalho-minuta', { atalho: null }); return; }
    const r = Nucleo.avaliarTecla(e);
    if (r.estado === 'aguardar') return;
    if (r.estado === 'recusado') { mostrarStatusMn(r.motivo); return; }
    pararCapturaMn();
    window.api.sendAction('set-atalho-minuta', { atalho: r.atalho });
  }
  btnMn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (capturandoMn) return;
    if (capturando) pararCaptura();
    capturandoMn = true; mostrarStatusMn('');
    window.addEventListener('keydown', aoTeclaCapturaMn, true);
    document.addEventListener('mousedown', aoCliqueForaMn, true);
    renderMn();
  });
  btnMnLimpar.addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('set-atalho-minuta', { atalho: null }); });
  document.getElementById('item-atalho-mn').addEventListener('click', (e) => e.stopPropagation());

  // ---------- Atalho "Fast Copilot no Editor" (mesma captura do atalho do PDF; ação própria) ----------
  const btnFc = document.getElementById('btn-atalho-fc');
  const btnFcLimpar = document.getElementById('btn-atalho-fc-limpar');
  const statusFc = document.getElementById('atalho-fc-status');
  let atalhoFc = null, capturandoFc = false;
  function mostrarStatusFc(texto) { statusFc.textContent = texto || ''; statusFc.classList.toggle('hidden', !texto); }
  function renderFc() {
    btnFc.classList.toggle('capturando', capturandoFc);
    btnFc.textContent = capturandoFc ? 'Pressione… (Esc cancela, Del remove)' : (atalhoFc ? Nucleo.descrever(atalhoFc) : 'Definir…');
    btnFcLimpar.classList.toggle('hidden', !atalhoFc || capturandoFc);
  }
  function pararCapturaFc() {
    capturandoFc = false;
    window.removeEventListener('keydown', aoTeclaCapturaFc, true);
    document.removeEventListener('mousedown', aoCliqueForaFc, true);
    renderFc();
  }
  function aoCliqueForaFc(e) { if (!btnFc.contains(e.target)) pararCapturaFc(); }
  function aoTeclaCapturaFc(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const semModificador = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (e.code === 'Escape' && semModificador) { pararCapturaFc(); mostrarStatusFc('Cancelado: o atalho anterior foi mantido.'); return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && semModificador) { pararCapturaFc(); window.api.sendAction('set-atalho-fast-copilot', { atalho: null }); return; }
    const r = Nucleo.avaliarTecla(e);
    if (r.estado === 'aguardar') return;
    if (r.estado === 'recusado') { mostrarStatusFc(r.motivo); return; }
    pararCapturaFc();
    window.api.sendAction('set-atalho-fast-copilot', { atalho: r.atalho });
  }
  btnFc.addEventListener('click', (e) => {
    e.stopPropagation();
    if (capturandoFc) return;
    if (capturando) pararCaptura();
    capturandoFc = true; mostrarStatusFc('');
    window.addEventListener('keydown', aoTeclaCapturaFc, true);
    document.addEventListener('mousedown', aoCliqueForaFc, true);
    renderFc();
  });
  btnFcLimpar.addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('set-atalho-fast-copilot', { atalho: null }); });
  document.getElementById('item-atalho-fc').addEventListener('click', (e) => e.stopPropagation());

  // ---------- Atalho "Alteração de Texto" (mesma captura; ação própria) ----------
  const btnAt = document.getElementById('btn-atalho-at');
  const btnAtLimpar = document.getElementById('btn-atalho-at-limpar');
  const statusAt = document.getElementById('atalho-at-status');
  let atalhoAt = null, capturandoAt = false;
  function mostrarStatusAt(texto) { statusAt.textContent = texto || ''; statusAt.classList.toggle('hidden', !texto); }
  function renderAt() {
    btnAt.classList.toggle('capturando', capturandoAt);
    btnAt.textContent = capturandoAt ? 'Pressione… (Esc cancela, Del remove)' : (atalhoAt ? Nucleo.descrever(atalhoAt) : 'Definir…');
    btnAtLimpar.classList.toggle('hidden', !atalhoAt || capturandoAt);
  }
  function pararCapturaAt() {
    capturandoAt = false;
    window.removeEventListener('keydown', aoTeclaCapturaAt, true);
    document.removeEventListener('mousedown', aoCliqueForaAt, true);
    renderAt();
  }
  function aoCliqueForaAt(e) { if (!btnAt.contains(e.target)) pararCapturaAt(); }
  function aoTeclaCapturaAt(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const semModificador = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (e.code === 'Escape' && semModificador) { pararCapturaAt(); mostrarStatusAt('Cancelado: o atalho anterior foi mantido.'); return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && semModificador) { pararCapturaAt(); window.api.sendAction('set-atalho-alteracao-texto', { atalho: null }); return; }
    const r = Nucleo.avaliarTecla(e);
    if (r.estado === 'aguardar') return;
    if (r.estado === 'recusado') { mostrarStatusAt(r.motivo); return; }
    pararCapturaAt();
    window.api.sendAction('set-atalho-alteracao-texto', { atalho: r.atalho });
  }
  btnAt.addEventListener('click', (e) => {
    e.stopPropagation();
    if (capturandoAt) return;
    if (capturando) pararCaptura();
    capturandoAt = true; mostrarStatusAt('');
    window.addEventListener('keydown', aoTeclaCapturaAt, true);
    document.addEventListener('mousedown', aoCliqueForaAt, true);
    renderAt();
  });
  btnAtLimpar.addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('set-atalho-alteracao-texto', { atalho: null }); });
  document.getElementById('item-atalho-at').addEventListener('click', (e) => e.stopPropagation());

  // ---------- Conta Microsoft ----------
  const contaFoto = document.getElementById('conta-foto');
  const contaNome = document.getElementById('conta-nome');
  const contaSub = document.getElementById('conta-sub');
  const contaTipo = document.getElementById('conta-tipo');
  const contaCabeca = document.getElementById('conta-cabeca');
  const contaLogada = document.getElementById('conta-logada');
  const contaDeslogada = document.getElementById('conta-deslogada');
  const btnContaEntrar = document.getElementById('btn-conta-entrar');
  const FOTO_OK = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  function renderConta(c) {
    conta = c && typeof c === 'object' ? c : { status: 'sem-sessao' };
    const limitada = conta.limitada === true;
    const logada = !limitada && conta.status === 'autenticada', entrando = !limitada && conta.status === 'entrando';
    contaNome.textContent = limitada ? 'Conta Microsoft' : logada ? conta.nome : entrando ? 'Entrando…' : 'Entrar com conta Microsoft';
    contaSub.textContent = limitada ? 'Indisponível no momento' : logada ? (conta.licenca || conta.usuario || '') : entrando ? 'Conclua o login no navegador' : (conta.erro ? 'Falha no login (' + conta.erro + ')' : 'Trabalho ou pessoal');
    // Login limitado: o aviso aparece, as opções continuam visíveis mas desativadas (nada é selecionável).
    document.getElementById('conta-aviso').classList.toggle('hidden', !limitada);
    document.getElementById('item-conta').classList.toggle('limitada', limitada);
    document.getElementById('flyout-conta').querySelectorAll('button').forEach((b) => { b.disabled = limitada || (b === btnContaEntrar && entrando); });
    contaTipo.textContent = logada ? (conta.tipo || '') : '';
    contaTipo.classList.toggle('hidden', !logada || !conta.tipo);
    // Foto da conta; sem foto, a inicial do nome. A origem é o processo principal, mas só aceita data URL de imagem.
    const foto = logada && typeof conta.foto === 'string' && FOTO_OK.test(conta.foto) ? conta.foto : '';
    contaFoto.style.backgroundImage = foto ? 'url("' + foto + '")' : '';
    contaFoto.textContent = foto ? '' : (logada ? (String(conta.nome || '?').trim().charAt(0).toUpperCase() || '?') : '');
    contaFoto.classList.toggle('sem-foto', !foto);
    contaFoto.classList.toggle('deslogada', !logada);
    contaLogada.classList.toggle('hidden', !(logada || limitada));
    contaDeslogada.classList.toggle('hidden', logada || limitada);
    contaCabeca.textContent = logada ? (conta.usuario || '') : '';
    if (!logada && !limitada && activeFlyout === 'conta') closeFlyout();
  }
  btnContaEntrar.addEventListener('click', (e) => { e.stopPropagation(); if (conta.status !== 'entrando') window.api.sendAction('conta-entrar'); });
  document.getElementById('btn-conta-trocar').addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('conta-entrar', { trocar: true }); });
  document.getElementById('btn-conta-sair').addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('conta-sair'); });
  document.querySelectorAll('[data-conta-abrir]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); window.api.sendAction('conta-abrir', { id: btn.dataset.contaAbrir }); });
  });
  if (window.api && window.api.onContaEstado) window.api.onContaEstado((c) => { renderConta(c); fitWindow(); });

  // ---------- Itens de ação ----------
  document.querySelectorAll('.menu-item[data-action]').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.getAttribute('data-action');
      if (!action) return;

      if (action === 'toggle-debugger') {
        updateDebuggerState(!isDebuggerEnabled);
        window.api.sendAction('toggle-debugger', { enabled: isDebuggerEnabled });
        return;
      }
      window.api.sendAction(action);
    });
  });

  function updateDebuggerState(checked) {
    isDebuggerEnabled = !!checked;
    itemDebugger?.setAttribute('aria-pressed', String(isDebuggerEnabled));
    if (checkDebugger) checkDebugger.classList.toggle('hidden', !isDebuggerEnabled);
  }

  // ---------- Estado recebido do processo principal a cada abertura ----------
  if (window.api && window.api.onMenuState) {
    window.api.onMenuState((data) => {
      currentMode = data && data.mode === 'dev' ? 'dev' : 'main';
      menuMain.classList.toggle('hidden', currentMode !== 'main');
      menuDev.classList.toggle('hidden', currentMode !== 'dev');

      const ext = (data && data.extensionLoading) || {};
      for (const key of ['superproc', 'azflow', 'epryx']) loading[key] = ext[key] === true;
      loading.pdf = ext.pdf !== false;
      for (const key of ['azflow', 'epryx', 'superproc']) installed[key] = !!(data && data.extensionInstalled && data.extensionInstalled[key]);
      renderSwitches();
      aplicarIconesNativos(data && data.extensionIcons);

      modoAbertura = ['simples', 'integrada', 'doisMonitores'].includes(data && data.modoAbertura) ? data.modoAbertura : 'integrada';
      colunaCopilot = !!(data && data.colunaCopilot);
      relacionadosPilha = !data || data.relacionadosEmPilha !== false;
      for (const [nome, chave] of [['copilot', 'copilotColunaPct'], ['arvore', 'arvorePct']]) {
        const v = Number(data && data[chave]);
        if (Number.isFinite(v)) PCT[nome].atual = Math.min(PCT[nome].max, Math.max(PCT[nome].min, Math.round(v)));
      }
      mostrarPct();
      doisMonitoresDisponivel = !!(data && data.doisMonitoresDisponivel);
      renderModoAbertura();

      if (data && data.atualizacao && typeof data.atualizacao === 'object') {
        atualStatus = data.atualizacao;
        atualVerificar = data.atualizacao.verificar !== false;
        atualAutomatica = data.atualizacao.automatica === true;
        renderAtualizacao();
      }

      if (data && typeof data.debuggerEnabled === 'boolean') updateDebuggerState(data.debuggerEnabled);
      renderConta(data && data.conta);

      if (capturando) pararCaptura();
      atalhoPdf = Nucleo.normalizarSalvo(data && data.atalhoColarPdf);
      renderAtalho();
      mostrarStatusAtalho(data && data.mensagemAtalho ? data.mensagemAtalho : '');
      if (capturandoMn) pararCapturaMn();
      atalhoMn = Nucleo.normalizarSalvo(data && data.atalhoMinutaCopilot);
      renderMn();
      mostrarStatusMn(data && data.mensagemAtalhoMinuta ? data.mensagemAtalhoMinuta : '');
      if (capturandoFc) pararCapturaFc();
      atalhoFc = Nucleo.normalizarSalvo(data && data.atalhoFastCopilot);
      renderFc();
      mostrarStatusFc(data && data.mensagemAtalhoFc ? data.mensagemAtalhoFc : '');
      if (capturandoAt) pararCapturaAt();
      atalhoAt = Nucleo.normalizarSalvo(data && data.atalhoAlteracaoTexto);
      renderAt();
      mostrarStatusAt(data && data.mensagemAtalhoAt ? data.mensagemAtalhoAt : '');

      // Cada abertura começa com o submenu fechado
      clearTimeout(closeTimer);
      flyoutOpen = false;
      activeFlyout = null;
      for (const f of Object.values(flyouts)) { f.el.classList.add('hidden'); f.item.classList.remove('open'); f.item.setAttribute('aria-expanded','false'); }
      document.body.classList.remove('flyout-right');

      if (btnUpdate && !(data && data.isUpdating)) {
        btnUpdate.classList.remove('updating');
        updateBtnText.textContent = '↻';
      }
      card.scrollTop = 0;
      fitWindow();
      if (data && data.focusFirst) {
        keyboardNavigation = true;
        controlsIn(currentMode === 'dev' ? menuDev : menuMain)[0]?.focus();
      }
    });
  }

  // Feedback de progresso e conclusão da atualização
  if (window.api && window.api.onUpdateStatus) {
    window.api.onUpdateStatus((status) => {
      if (status && status.state === 'updating') {
        btnUpdate.classList.add('updating');
        updateBtnText.textContent = '⏳';
      } else {
        btnUpdate.classList.remove('updating');
        updateBtnText.textContent = '↻';
      }
    });
  }
})();
