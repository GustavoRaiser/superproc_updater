// Dialog Controller
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.dialogAPI;
  if (!api) return;

  const titleEl = document.getElementById('dialog-title');
  const closeBtn = document.getElementById('dialog-close-btn');

  // Views
  const viewUrl = document.getElementById('view-url');
  const viewAddLink = document.getElementById('view-add-link');
  const viewSettings = document.getElementById('view-settings');

  // Elements: View URL
  const urlInput = document.getElementById('url-input');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCloseUrl = document.getElementById('btn-close-url');
  const btnNavigateUrl = document.getElementById('btn-navigate-url');
  const urlStatus = document.getElementById('url-status');

  // Elements: View Add Link
  const addLinkDesc = document.getElementById('add-link-desc');
  const linkNameInput = document.getElementById('link-name');
  const linkUrlInput = document.getElementById('link-url');
  const addLinkStatus = document.getElementById('add-link-status');
  const btnCancelAdd = document.getElementById('btn-cancel-add');
  const btnSaveAdd = document.getElementById('btn-save-add');

  // Elements: View Settings
  const btnSettingsClearCache = document.getElementById('btn-settings-clear-cache');
  const btnSettingsClearAll = document.getElementById('btn-settings-clear-all');
  const btnSettingsClearPrefs = document.getElementById('btn-settings-clear-prefs');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const cacheStatus = document.getElementById('cache-status');

  closeBtn.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.close();
  });

  // Obter dados passados para este diálogo
  const data = await api.getDialogData();
  const type = data.type;

  if (type === 'url') {
    titleEl.textContent = 'Verificar URL da Aba Ativa';
    viewUrl.classList.remove('hidden');
    urlInput.value = data.url || '';
    urlInput.removeAttribute('readonly');
    urlInput.focus();
    urlInput.select();

    btnCopyUrl.addEventListener('click', async () => {
      if (urlInput.value) {
        await navigator.clipboard.writeText(urlInput.value);
        urlStatus.textContent = '✓ Endereço copiado com sucesso!';
        setTimeout(() => { urlStatus.textContent = ''; }, 2500);
      }
    });

    btnNavigateUrl.addEventListener('click', () => {
      let target = urlInput.value.trim();
      if (target) {
        if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
        api.navigateTo(target);
        api.close();
      }
    });

    btnCloseUrl.addEventListener('click', () => api.close());

  } else if (type === 'add-juris' || type === 'add-ferramentas') {
    let category = 'ferramentas';
    if (type === 'add-juris') category = 'jurisprudencia';

    if (category === 'jurisprudencia') {
      titleEl.textContent = 'Adicionar Jurisprudência';
      addLinkDesc.textContent = 'Cadastre um tribunal ou fonte de pesquisa jurídica (menu Jurisprudência):';
    } else {
      titleEl.textContent = 'Adicionar Ferramenta (Workflow)';
      addLinkDesc.textContent = 'Cadastre um sistema, painel ou ferramenta de trabalho (menu Ferramentas):';
    }

    viewAddLink.classList.remove('hidden'); linkNameInput.focus();

    btnSaveAdd.addEventListener('click', async () => {
      const nome = linkNameInput.value.trim();
      let url = linkUrlInput.value.trim();

      if (!nome || !url) {
        addLinkStatus.textContent = 'Informe o Nome e a URL!';
        addLinkStatus.style.color = 'var(--danger)';
        return;
      }

      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      await api.addLink(category, nome, url);
      addLinkStatus.textContent = '✓ Link salvo com sucesso nos favoritos!';
      addLinkStatus.style.color = 'var(--success)';
      setTimeout(() => { api.close(); }, 800);
    });

    btnCancelAdd.addEventListener('click', () => api.close());

  } else if (type === 'settings') {
    titleEl.textContent = 'Configurações';
    viewSettings.classList.remove('hidden');

    // Popover com a descrição de cada botão de dados: aparece após 1s com o mouse parado sobre ele.
    const popover = document.getElementById('data-popover');
    let popTimer = null;
    const esconderPopover = () => { clearTimeout(popTimer); popTimer = null; popover.classList.add('hidden'); };
    const mostrarPopover = (btn) => {
      popover.textContent = btn.dataset.popover || '';
      popover.classList.remove('hidden');
      const r = btn.getBoundingClientRect();
      const p = popover.getBoundingClientRect();
      const margem = 8;
      const left = Math.min(Math.max(margem, r.left), window.innerWidth - p.width - margem);
      let top = r.top - p.height - 6;
      if (top < margem) top = r.bottom + 6;
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    };
    document.querySelectorAll('[data-popover]').forEach(btn => {
      btn.addEventListener('mouseenter', () => { esconderPopover(); popTimer = setTimeout(() => mostrarPopover(btn), 1000); });
      btn.addEventListener('mouseleave', esconderPopover);
      btn.addEventListener('mousedown', esconderPopover);
      btn.addEventListener('blur', esconderPopover);
    });

    btnSettingsClearPrefs.addEventListener('click', async () => {
      try { await api.clearPreferences(); } catch { cacheStatus.textContent = 'Não foi possível limpar as preferências.'; }
    });

    document.getElementById('btn-settings-clear-ext').addEventListener('click', async () => {
      try { await api.clearExtensions(); } catch { cacheStatus.textContent = 'Não foi possível limpar as extensões.'; }
    });

    btnSettingsClearAll.addEventListener('click', async () => {
      try { await api.clearAllData(); } catch { cacheStatus.textContent = 'Não foi possível limpar os dados.'; }
    });

    // Extensões em execução: só as que estão carregadas (extensões eliminadas ou desligadas não aparecem).
    const extList = document.getElementById('ext-list');
    try {
      const rodando = await api.getExtensionsStatus();
      if (!rodando.length) {
        const vazio = document.createElement('li');
        vazio.textContent = 'Nenhuma extensão em execução.';
        extList.appendChild(vazio);
      }
      for (const e of rodando) {
        const li = document.createElement('li');
        const bolinha = document.createElement('span');
        bolinha.className = 'bullet active';
        const nome = document.createElement('strong');
        nome.textContent = e.nome + ':';
        li.append(bolinha, ' ', nome, ' ' + e.detalhe);
        extList.appendChild(li);
      }
    } catch { /* lista indisponível: o card fica vazio */ }

    btnSettingsClearCache.addEventListener('click', async () => {
      await api.clearCache();
      cacheStatus.textContent = '✓ Cache limpo com sucesso!';
      setTimeout(() => { cacheStatus.textContent = ''; }, 3000);
    });

    // Item migrado do menu da engrenagem: Corretor ortográfico
    const chkSettingsCorretor = document.getElementById('chk-settings-corretor');

    const settingsCfg = await api.getConfig();
    chkSettingsCorretor.checked = settingsCfg.corretorOrtografico !== false;
    chkSettingsCorretor.addEventListener('change', async () => {
      try { await api.setCorretorOrtografico(chkSettingsCorretor.checked); }
      catch { chkSettingsCorretor.checked = !chkSettingsCorretor.checked; cacheStatus.textContent = 'Não foi possível salvar o Corretor ortográfico.'; }
    });

    const settingsDlPath = document.getElementById('settings-download-path');
    const btnSettingsChooseFolder = document.getElementById('btn-settings-choose-folder');
    const chkSettingsAutoDl = document.getElementById('chk-settings-auto-download');

    if (api.getDownloadConfig) {
      api.getDownloadConfig().then(dlCfg => {
        if (settingsDlPath) settingsDlPath.value = dlCfg.downloadPath || 'Padrão do Sistema (Downloads)';
        if (chkSettingsAutoDl) chkSettingsAutoDl.checked = !!dlCfg.autoDownload;
      });
    }

    if (btnSettingsChooseFolder) {
      btnSettingsChooseFolder.addEventListener('click', async () => {
        if (api.selectDownloadFolder) {
          const chosen = await api.selectDownloadFolder();
          if (chosen && settingsDlPath) settingsDlPath.value = chosen;
        }
      });
    }

    if (chkSettingsAutoDl) {
      chkSettingsAutoDl.addEventListener('change', async () => {
        if (api.setDownloadConfig) {
          await api.setDownloadConfig({ autoDownload: chkSettingsAutoDl.checked });
        }
      });
    }

    btnCloseSettings.addEventListener('click', () => api.close());

  } else if (type === 'manage-links') {
    titleEl.textContent = '⚡ Configurar Acesso Rápido';
    const viewManage = document.getElementById('view-manage-links');
    viewManage.classList.remove('hidden');

    const catTabs = document.querySelectorAll('.manage-tab-btn');
    const tableBody = document.getElementById('manage-table-body');
    const quickNome = document.getElementById('quick-add-nome');
    const quickUrl = document.getElementById('quick-add-url');
    const btnQuickAdd = document.getElementById('btn-quick-add');
    const btnQuickGroup = document.getElementById('btn-quick-group');
    const btnCatalogo = document.getElementById('btn-quick-catalogo');
    const manageStatus = document.getElementById('manage-status');
    const btnSaveManage = document.getElementById('btn-save-manage');
    const btnCloseManage = document.getElementById('btn-close-manage');
    const ehGrupo = AtalhoAcesso.ehGrupo;

    let currentCat = data.category || 'jurisprudencia';
    if (currentCat === 'juris') currentCat = 'jurisprudencia';
    if (currentCat === 'leis') currentCat = 'legislacao';

    let config = await api.getConfig();
    if (!config.jurisprudencia) config.jurisprudencia = config.juris || [];
    if (!config.legislacao) config.legislacao = config.leis || [];
    if (!config.ferramentas) config.ferramentas = [];
    for (const k of ['jurisprudencia', 'legislacao', 'ferramentas']) {
      config[k].forEach(it => { if (ehGrupo(it) && !Array.isArray(it.itens)) it.itens = []; });
    }
    let currentList = [...(config[currentCat] || [])];

    const novoId = () => AtalhoAcesso.novoId();
    const sincronizar = () => { config[currentCat] = [...currentList]; };

    // Localiza um item (link ou grupo) em qualquer nível da lista atual.
    function localizar(id) {
      for (let i = 0; i < currentList.length; i++) {
        const it = currentList[i];
        if (it.id === id) return { container: currentList, index: i, grupo: null, grupoIndex: -1, item: it };
        if (ehGrupo(it)) {
          const j = it.itens.findIndex(x => x.id === id);
          if (j >= 0) return { container: it.itens, index: j, grupo: it, grupoIndex: i, item: it.itens[j] };
        }
      }
      return null;
    }

    function selectTab(cat) {
      currentCat = cat;
      catTabs.forEach(t => {
        if (t.dataset.cat === cat) t.classList.add('active');
        else t.classList.remove('active');
      });
      currentList = [...(config[currentCat] || [])];
      btnCatalogo.classList.toggle('hidden', cat !== 'legislacao');
      renderTable();
    }

    function adicionarPendente() {
      const pendingNome = quickNome.value.trim();
      let pendingUrl = quickUrl.value.trim();
      if (pendingNome && pendingUrl) {
        if (!/^https?:\/\//i.test(pendingUrl)) pendingUrl = 'https://' + pendingUrl;
        currentList.push({ id: novoId(), nome: pendingNome, url: pendingUrl });
        quickNome.value = '';
        quickUrl.value = '';
      }
    }

    catTabs.forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        adicionarPendente();
        syncInputsToList();
        sincronizar();
        selectTab(tabBtn.dataset.cat);
      });
    });

    function syncInputsToList() {
      const rows = tableBody.querySelectorAll('tr[data-id]');
      rows.forEach((row) => {
        const loc = localizar(row.dataset.id);
        if (!loc) return;
        const nameInput = row.querySelector('.inp-row-name');
        const urlInput = row.querySelector('.inp-row-url');
        if (nameInput) loc.item.nome = nameInput.value.trim();
        if (urlInput) loc.item.url = urlInput.value.trim();
      });
    }

    // ── Ordenação inteligente ────────────────────────────────────────────────
    // ▲▼ movem pelo menu como ele é visto: um link que encosta num grupo entra nele,
    // e um link no extremo do grupo sai dele. Grupos só trocam de lugar entre si e com links.
    function mover(id, dir) {
      syncInputsToList();
      const loc = localizar(id);
      if (!loc) return;
      const { container, index, grupo, grupoIndex, item } = loc;
      const trocar = (arr, a, b) => { [arr[a], arr[b]] = [arr[b], arr[a]]; };
      if (ehGrupo(item)) {
        const j = index + dir;
        if (j < 0 || j >= currentList.length) return;
        trocar(currentList, index, j);
      } else if (grupo) {
        const j = index + dir;
        if (j >= 0 && j < container.length) trocar(container, index, j);
        else {
          container.splice(index, 1);
          currentList.splice(dir < 0 ? grupoIndex : grupoIndex + 1, 0, item);
        }
      } else {
        const j = index + dir;
        if (j < 0 || j >= currentList.length) return;
        const vizinho = currentList[j];
        if (ehGrupo(vizinho)) {
          currentList.splice(index, 1);
          if (dir < 0) vizinho.itens.push(item); else vizinho.itens.unshift(item);
        } else trocar(currentList, index, j);
      }
      sincronizar();
      renderTable();
    }

    function tituloSeta(loc, dir) {
      const { index, grupo, item, container } = loc;
      if (ehGrupo(item)) return dir < 0 ? 'Mover grupo para cima' : 'Mover grupo para baixo';
      if (grupo) {
        const sai = dir < 0 ? index === 0 : index === container.length - 1;
        if (sai) return `Tirar do grupo "${grupo.nome}"`;
      } else {
        const viz = currentList[loc.index + dir];
        if (viz && ehGrupo(viz)) return `Colocar dentro do grupo "${viz.nome}"`;
      }
      return dir < 0 ? 'Mover para cima' : 'Mover para baixo';
    }

    // ── Atalhos do Acesso Rápido ───────────────────────────────────────────
    let capturando = null; // id do link que está aguardando uma combinação de teclas

    function pintarBotaoAtalho(btn, btnLimpar, item) {
      const emCaptura = capturando === item.id;
      const outros = item.atalho ? AtalhoAcesso.contarCompartilhamento(config, item.atalho, item.id) : 0;
      btn.classList.toggle('capturando', emCaptura);
      btn.classList.toggle('definido', !!item.atalho);
      btn.classList.toggle('compartilhado', outros > 0);
      btn.textContent = emCaptura ? 'Pressione…' : (item.atalho ? AtalhoAcesso.descrever(item.atalho) : 'Definir…');
      btn.title = emCaptura ? 'Esc cancela · Backspace remove'
        : outros > 0 ? `Compartilhado com ${outros} outro(s) link(s): este atalho abrirá um menu de escolha.`
        : 'Clique e pressione a combinação desejada';
      btnLimpar.hidden = !item.atalho;
    }

    function cancelarCaptura() {
      if (capturando === null) return;
      const id = capturando;
      capturando = null;
      const tr = tableBody.querySelector(`tr[data-id="${id}"]`);
      const loc = localizar(id);
      if (tr && loc) pintarBotaoAtalho(tr.querySelector('.btn-atalho'), tr.querySelector('.btn-atalho-clear'), loc.item);
    }

    function aplicarAtalho(atalho) {
      syncInputsToList();
      const loc = localizar(capturando);
      capturando = null;
      if (!loc) return;
      const item = loc.item;
      if (atalho) item.atalho = atalho; else delete item.atalho;
      sincronizar();
      const outros = atalho ? AtalhoAcesso.contarCompartilhamento(config, atalho, item.id) : 0;
      manageStatus.textContent = !atalho
        ? 'Atalho removido. Clique em "Salvar Alterações" para confirmar.'
        : outros > 0
          ? `✓ ${AtalhoAcesso.descrever(atalho)} também abre ${outros} outro(s) link(s): ele mostrará um menu de escolha. Salve para confirmar.`
          : `✓ Atalho ${AtalhoAcesso.descrever(atalho)} definido. Clique em "Salvar Alterações" para confirmar.`;
      manageStatus.style.color = 'var(--success)';
      renderTable();
    }

    // Captura em fase de captura: vem antes do Esc que fecha o diálogo.
    window.addEventListener('keydown', (e) => {
      if (capturando === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { cancelarCaptura(); manageStatus.textContent = ''; return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        aplicarAtalho(null);
        return;
      }
      const r = AtalhoAcesso.avaliarTecla(e);
      if (r.estado === 'aguardar') return;
      if (r.estado === 'recusado') {
        manageStatus.textContent = r.motivo;
        manageStatus.style.color = 'var(--danger)';
        return;
      }
      aplicarAtalho(r.atalho);
    }, true);

    // Clicar em qualquer outro lugar cancela a captura (sem redesenhar a tabela).
    document.addEventListener('mousedown', (e) => {
      if (capturando !== null && !e.target.closest('.btn-atalho')) cancelarCaptura();
    }, true);

    // ── Tabela ───────────────────────────────────────────────────────────────
    function botoesOrdem(loc, total) {
      const { index, grupo } = loc;
      const semCima = !grupo && index === 0;
      const semBaixo = !grupo && index === total - 1;
      const off = 'disabled style="opacity:0.3;cursor:default;"';
      return `<div class="order-btn-group">
          <span class="grip" draggable="true" title="Arraste para reordenar">⋮⋮</span>
          <button class="btn-order btn-up" title="${escapeAttr(tituloSeta(loc, -1))}" ${semCima ? off : ''}>▲</button>
          <button class="btn-order btn-down" title="${escapeAttr(tituloSeta(loc, 1))}" ${semBaixo ? off : ''}>▼</button>
        </div>`;
    }

    function ligarOrdemEExclusao(tr, item) {
      const up = tr.querySelector('.btn-up');
      const down = tr.querySelector('.btn-down');
      if (up) up.addEventListener('click', () => mover(item.id, -1));
      if (down) down.addEventListener('click', () => mover(item.id, 1));
      tr.querySelector('.btn-del-row').addEventListener('click', () => {
        syncInputsToList();
        if (ehGrupo(item) && item.itens.length > 0 &&
            !confirm(`Excluir o grupo "${item.nome}" e os ${item.itens.length} link(s) que estão dentro dele?`)) return;
        const loc = localizar(item.id);
        if (loc) loc.container.splice(loc.index, 1);
        sincronizar();
        renderTable();
      });
    }

    function linhaGrupo(item, loc) {
      const tr = document.createElement('tr');
      tr.className = 'grupo-row';
      tr.dataset.id = item.id;
      tr.innerHTML = `
        <td style="text-align: center;">${botoesOrdem(loc, currentList.length)}</td>
        <td colspan="2">
          <div class="grupo-nome"><span class="grupo-ico">📁</span>
            <input type="text" class="inp-row-name inp-grupo" placeholder="Nome do grupo" value="${escapeAttr(item.nome || '')}">
            <span class="grupo-qtd">${item.itens.length} link(s)</span></div>
        </td>
        <td style="text-align: center;">
          <div class="atalho-cell" title="Atalho do grupo: abre todos os links dele">
            <button class="btn-atalho" type="button"></button>
            <button class="btn-atalho-clear" type="button" title="Remover atalho do grupo">✕</button>
          </div>
        </td>
        <td style="text-align: center;"><button class="btn-del-row" title="Excluir este grupo">🗑️</button></td>`;
      ligarAtalho(tr, item);
      ligarOrdemEExclusao(tr, item);
      return tr;
    }

    /** Liga o botão de atalho (captura da combinação) de uma linha de link ou de grupo. */
    function ligarAtalho(tr, item) {
      const btnAtalho = tr.querySelector('.btn-atalho');
      const btnAtalhoLimpar = tr.querySelector('.btn-atalho-clear');
      pintarBotaoAtalho(btnAtalho, btnAtalhoLimpar, item);

      btnAtalho.addEventListener('click', () => {
        const eraEste = capturando === item.id;
        cancelarCaptura();
        if (eraEste) return;
        capturando = item.id;
        pintarBotaoAtalho(btnAtalho, btnAtalhoLimpar, item);
        manageStatus.textContent = 'Pressione a combinação desejada (Esc cancela, Backspace remove).';
        manageStatus.style.color = 'var(--text-muted)';
      });

      btnAtalhoLimpar.addEventListener('click', () => {
        syncInputsToList();
        cancelarCaptura();
        delete item.atalho;
        sincronizar();
        manageStatus.textContent = 'Atalho removido. Clique em "Salvar Alterações" para confirmar.';
        manageStatus.style.color = 'var(--text-muted)';
        renderTable();
      });
    }

    function linhaLink(item, loc) {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      if (loc.grupo) tr.className = 'nested';
      tr.innerHTML = `
        <td style="text-align: center;">${botoesOrdem(loc, currentList.length)}</td>
        <td><input type="text" class="inp-row-name" value="${escapeAttr(item.nome || '')}"></td>
        <td><input type="text" class="inp-row-url" value="${escapeAttr(item.url || '')}"${item.norma ? ' readonly aria-label="Endereço (cópia local da norma, gerado pelo app)" title="Cópia local da norma: o endereço é gerado pelo app e não é editável"' : ''}></td>
        <td style="text-align: center;">
          <div class="atalho-cell">
            <button class="btn-atalho" type="button"></button>
            <button class="btn-atalho-clear" type="button" title="Remover atalho">✕</button>
          </div>
        </td>
        <td style="text-align: center;"><button class="btn-del-row" title="Excluir este link">🗑️</button></td>`;
      ligarAtalho(tr, item);
      ligarOrdemEExclusao(tr, item);
      return tr;
    }

    // ── Arrastar e soltar ────────────────────────────────────────────────────
    // Soltar na metade de cima da linha-alvo coloca ACIMA; na de baixo, ABAIXO. O destino herda o
    // "lado" do alvo: sobre um item dentro de um grupo, entra no grupo; sobre um item de fora, fica fora.
    // Cabeçalho de grupo: metade de cima = antes do grupo; metade de baixo = primeira posição dentro dele.
    let arrastando = null;
    const tabelaContainer = document.querySelector('.manage-table-container');

    function limparIndicadores() {
      tableBody.querySelectorAll('.drop-acima, .drop-abaixo').forEach(el => el.classList.remove('drop-acima', 'drop-abaixo'));
    }

    // Traduz a linha sob o mouse em { id, depois } (ou null para "fim da lista").
    function alvoDoPonto(e) {
      const tr = e.target.closest && e.target.closest('tr');
      if (!tr || !tableBody.contains(tr)) return { tr: null, id: null, depois: true };
      const r = tr.getBoundingClientRect();
      const depois = e.clientY >= r.top + r.height / 2;
      if (tr.classList.contains('grupo-vazio')) return { tr, id: tr.dataset.grupo, depois: true };
      if (!tr.dataset.id) return { tr: null, id: null, depois: true };
      return { tr, id: tr.dataset.id, depois };
    }

    function soltar(idArrastado, alvoId, depois) {
      syncInputsToList();
      const src = localizar(idArrastado);
      if (!src) return false;
      const item = src.item;
      const tgt = alvoId ? localizar(alvoId) : null;
      if (alvoId && !tgt) return false;
      if (tgt && tgt.item.id === item.id) return false;

      if (ehGrupo(item)) {
        // Grupos só existem no nível superior: o alvo é traduzido para a posição do grupo/link de topo.
        let pos = currentList.length;
        if (tgt) {
          if (tgt.grupo && tgt.grupo.id === item.id) return false;
          pos = (tgt.grupo ? tgt.grupoIndex : tgt.index) + (depois ? 1 : 0);
        }
        currentList.splice(src.index, 1);
        if (src.index < pos) pos--;
        currentList.splice(pos, 0, item);
      } else {
        let destino = currentList;
        let pos = currentList.length;
        if (tgt) {
          if (ehGrupo(tgt.item)) {
            if (depois) { destino = tgt.item.itens; pos = 0; } else { destino = currentList; pos = tgt.index; }
          } else {
            destino = tgt.container;
            pos = tgt.index + (depois ? 1 : 0);
          }
        }
        src.container.splice(src.index, 1);
        if (destino === src.container && src.index < pos) pos--;
        destino.splice(pos, 0, item);
      }
      sincronizar();
      renderTable();
      manageStatus.textContent = 'Posição alterada. Clique em "Salvar Alterações" para confirmar.';
      manageStatus.style.color = 'var(--text-muted)';
      return true;
    }

    tableBody.addEventListener('dragstart', (e) => {
      const grip = e.target.closest && e.target.closest('.grip');
      const tr = grip && grip.closest('tr');
      if (!tr) { e.preventDefault(); return; }
      cancelarCaptura();
      arrastando = tr.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastando);
      e.dataTransfer.setDragImage(tr, 16, 12);
      setTimeout(() => tr.classList.add('arrastando'), 0);
    });

    tabelaContainer.addEventListener('dragover', (e) => {
      if (arrastando === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      limparIndicadores();
      const a = alvoDoPonto(e);
      if (a.tr) a.tr.classList.add(a.depois ? 'drop-abaixo' : 'drop-acima');
      // Autorrolagem quando o mouse encosta nas bordas da lista.
      const r = tabelaContainer.getBoundingClientRect();
      if (e.clientY < r.top + 28) tabelaContainer.scrollTop -= 14;
      else if (e.clientY > r.bottom - 28) tabelaContainer.scrollTop += 14;
    });

    tabelaContainer.addEventListener('dragleave', (e) => {
      if (!tabelaContainer.contains(e.relatedTarget)) limparIndicadores();
    });

    tabelaContainer.addEventListener('drop', (e) => {
      if (arrastando === null) return;
      e.preventDefault();
      const id = arrastando;
      arrastando = null;
      limparIndicadores();
      const a = alvoDoPonto(e);
      soltar(id, a.id, a.depois);
    });

    document.addEventListener('dragend', () => {
      arrastando = null;
      limparIndicadores();
      tableBody.querySelectorAll('.arrastando').forEach(el => el.classList.remove('arrastando'));
    });

    function renderTable() {
      tableBody.innerHTML = '';
      if (!currentList || currentList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 25px; color: var(--text-muted);">Nenhum link cadastrado nesta categoria.</td></tr>`;
        return;
      }
      currentList.forEach((item, index) => {
        if (ehGrupo(item)) {
          tableBody.appendChild(linhaGrupo(item, { index, grupo: null, item, container: currentList }));
          if (item.itens.length === 0) {
            const vazio = document.createElement('tr');
            vazio.className = 'grupo-vazio';
            vazio.dataset.grupo = item.id;
            vazio.innerHTML = '<td></td><td colspan="4">Grupo vazio — use ▲▼ nos links vizinhos para colocá-los aqui.</td>';
            tableBody.appendChild(vazio);
          }
          item.itens.forEach((sub, j) => tableBody.appendChild(linhaLink(sub, { index: j, grupo: item, item: sub, container: item.itens })));
        } else {
          tableBody.appendChild(linhaLink(item, { index, grupo: null, item, container: currentList }));
        }
      });
    }

    btnQuickAdd.addEventListener('click', () => {
      const nome = quickNome.value.trim();
      let url = quickUrl.value.trim();
      if (!nome || !url) {
        manageStatus.textContent = 'Informe Nome e URL para adicionar!';
        manageStatus.style.color = 'var(--danger)';
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      syncInputsToList();
      currentList.push({ id: novoId(), nome, url });
      sincronizar();
      quickNome.value = '';
      quickUrl.value = '';
      quickNome.focus();
      manageStatus.textContent = '✓ Link adicionado à lista! Clique em "Salvar Alterações" para confirmar.';
      manageStatus.style.color = 'var(--success)';
      renderTable();
      const container = document.querySelector('.manage-table-container');
      if (container) container.scrollTop = container.scrollHeight;
    });

    btnQuickGroup.addEventListener('click', () => {
      const nome = quickNome.value.trim();
      if (!nome) {
        manageStatus.textContent = 'Digite o nome do grupo no campo "Nome" e clique em "Grupo".';
        manageStatus.style.color = 'var(--danger)';
        return;
      }
      syncInputsToList();
      currentList.push({ id: novoId(), tipo: 'grupo', nome, itens: [] });
      sincronizar();
      quickNome.value = '';
      quickNome.focus();
      manageStatus.textContent = '✓ Grupo criado. Use ▲▼ nos links para movê-los para dentro dele e salve para confirmar.';
      manageStatus.style.color = 'var(--success)';
      renderTable();
      const container = document.querySelector('.manage-table-container');
      if (container) container.scrollTop = container.scrollHeight;
    });

    quickUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnQuickAdd.click();
    });

    btnSaveManage.addEventListener('click', async () => {
      adicionarPendente();
      syncInputsToList();
      currentList.forEach(it => { if (ehGrupo(it) && !it.nome) it.nome = 'Grupo'; });
      sincronizar();

      // Salvar TODAS as categorias simultaneamente (jurisprudencia, legislacao, ferramentas)
      await api.saveAllCategories({
        jurisprudencia: config.jurisprudencia || [],
        legislacao: config.legislacao || [],
        ferramentas: config.ferramentas || []
      });

      manageStatus.textContent = '✓ Todas as alterações foram gravadas com sucesso!';
      manageStatus.style.color = 'var(--success)';
      setTimeout(() => { api.close(); }, 600);
    });

    btnCloseManage.addEventListener('click', () => api.close());

    // O catálogo grava direto na configuração e substitui esta janela: edições não salvas aqui seriam perdidas.
    const instantaneo = () => JSON.stringify([config.jurisprudencia, config.legislacao, config.ferramentas]);
    const instantaneoInicial = instantaneo();
    btnCatalogo.addEventListener('click', () => {
      syncInputsToList();
      sincronizar();
      if (instantaneo() !== instantaneoInicial &&
          !confirm('Há alterações não salvas nesta janela. Abrir o catálogo as descarta. Continuar?')) return;
      api.openDialog('add-leis');
    });

    selectTab(currentCat);
  }

  function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
