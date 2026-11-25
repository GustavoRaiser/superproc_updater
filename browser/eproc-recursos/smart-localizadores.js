// Smart Localizadores do navegador SuperPROC (camada: host; mundo isolado nas abas do eproc). Chave em CFG > Configurações
// ("Smart Localizadores & Eventos"). Porte independente do módulo da extensão (modules/geral/smart_localizadores.js):
// mesma interface e os mesmos dados no localStorage do eproc (eproc_smartloc_*), sem chrome.* e sem a extensão.
// O catálogo dos localizadores (id -> nome) vai para a pool comum (catalogoLoc), que o Organizador e as cores usam.
// Concatenado pelo host depois de base.js (SPBase).

(function smartLocalizadores() {
  if (window.__spSmartLoc) return;
  window.__spSmartLoc = true;
  const { lerLocal, gravarLocal, GRUPO_OCULTOS } = SPBase;
        // Ícones da barra: traço único de 1.75px, herdam a cor do botão.
        const ICO = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
        const SVG = {
            sync: ICO('<path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/>'),
            plus: ICO('<path d="M12 5v14M5 12h14"/>'),
            pack: ICO('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
            grid: ICO('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
        };
        const KEYS = {
            GRUPOS: 'eproc_smartloc_grupos',
            ESTRUTURA: 'eproc_smartloc_estrutura'
        };

        if (!document.getElementById('smartloc-css')) {
            const style = document.createElement('style');
            style.id = 'smartloc-css';
            style.innerHTML = `
                .smartloc-container {
                    width: 100%;
                    margin-bottom: 15px;
                    padding: 12px 15px;
                    background: #f4f6f8;
                    border: 1px solid #c8ced3;
                    border-left: 4px solid #0056b3;
                    border-radius: 4px;
                    font-family: Arial, sans-serif;
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    box-shadow: none;
                }
                .smartloc-title {
                    font-size: 13px;
                    font-weight: bold;
                    color: #0056b3;
                    white-space: nowrap;
                    margin-right: 10px;
                }
                .smartloc-trigger {
                    flex-grow: 1;
                    background: #fff;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    padding: 8px 12px;
                    cursor: default;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 13px;
                    color: #495057;
                    height: 36px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                    position: relative;
                }
                .smartloc-trigger:hover { border-color: #80bdff; box-shadow: none; }
                .smartloc-trigger-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold; width: 100%; cursor: default; }
                .smartloc-search-input {
                    width: 100%;
                    border: none;
                    background: transparent;
                    font-size: 13px;
                    outline: none;
                    padding: 0;
                    display: none;
                    font-family: inherit;
                }
                .smartloc-toolbar {
                    display: flex;
                    gap: 6px;
                }
                .smartloc-icon-btn { cursor: default; padding: 0 12px; height: 36px; border: 1px solid #ced4da; background: #fff; border-radius: 4px; font-size: 15px; display: flex; align-items: center; justify-content: center; box-shadow: none; color: #333; transition: all 0.2s;}
                .smartloc-icon-btn:hover { background: #e2e6ea; border-color: #adb5bd; }
                .smartloc-icon-btn svg { display: block; }
                #smartloc-container .smartloc-org-btn { display: inline-flex !important; align-items: center; justify-content: center; flex: 0 0 36px; width: 36px; height: 36px; padding: 0; box-sizing: border-box; border: 1px solid #0056b3 !important; background: #0056b3 !important; color: #ffffff !important; border-radius: 4px; cursor: pointer; box-shadow: none !important; text-shadow: none !important; transition: background 0.15s; }
                #smartloc-container .smartloc-org-btn svg { color: #ffffff !important; stroke: #ffffff !important; }
                #smartloc-container .smartloc-org-btn svg { background: transparent !important; }
                #smartloc-container .smartloc-org-btn:hover { background: #004494 !important; }
                #smartloc-container .smartloc-icon-btn:focus-visible, #smartloc-container .smartloc-org-btn:focus-visible { outline: 2px solid #0056b3; outline-offset: 2px; }
                .smartloc-dropdown { position: absolute; background: #fff; border: 1px solid #ced4da; border-radius: 4px; box-shadow: none; z-index: 2147483647; display: none; flex-direction: column; font-family: Arial, sans-serif; overflow: hidden; }
                .smartloc-list-container { overflow-y: auto; padding: 5px; flex-grow: 1; }
                .smartloc-quick-drop { position: fixed; background: #f8f9fa; border: 2px solid #0056b3; border-radius: 8px; padding: 10px; box-shadow: none; z-index: 2147483647; display: none; flex-direction: column; gap: 6px; width: 200px; max-height: 80vh; overflow-y: auto; }
                .smartloc-quick-drop-title { font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 5px; color: #0056b3; text-transform: uppercase; }
                .smartloc-quick-drop-target { background: #fff; border: 1px dashed #ced4da; padding: 10px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; color: #495057; text-align: center; cursor: default; transition: all 0.2s; }
                .smartloc-quick-drop-target.drag-over { background: #e3f2fd; border-color: #0056b3; color: #0056b3; transform: scale(1.03); box-shadow: none; }
                .smartloc-group { margin-bottom: 5px; border: 1px solid #e9ecef; border-radius: 4px; }
                .smartloc-group-header { background: #e9ecef; padding: 6px 8px; font-size: 11px; font-weight: bold; color: #495057; display: flex; justify-content: space-between; align-items: center; cursor: default; user-select: none; transition: background 0.15s, border-color 0.15s; }
                .smartloc-group-header:hover { background: #dde2e6; }
                .smartloc-group-header.drag-over { border: 2px dashed #0056b3 !important; background: #e3f2fd !important; }
                .smartloc-items { display: block; padding: 2px; }
                .smartloc-items.collapsed { display: none; }
                .smartloc-item { padding: 6px 8px; font-size: 12px; color: #212529; cursor: default !important; border-bottom: 1px solid #f1f3f5; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
				.smartloc-item:active { cursor: default !important; }
				.smartloc-item:last-child { border-bottom: none; }
                .smartloc-item:hover { background: #f1f3f5; color: #0056b3; }
                .smartloc-item.dragging { opacity: 0.5; background: #e2e6ea; }
                .smartloc-empty-notice { font-size: 11px; color: #adb5bd; padding: 8px; text-align: center; font-style: italic; }
                .toggle-icon { font-size: 10px; transition: transform 0.2s; }
                .collapsed .toggle-icon { transform: rotate(-90deg); }

                /* Modo de arrastar para grupos: recolhe itens e exibe apenas os cabeçalhos de todos os grupos */
                .smartloc-dropdown.is-dragging-mode .smartloc-items { display: none !important; }
                .smartloc-dropdown.is-dragging-mode .smartloc-group { display: block !important; margin-bottom: 4px !important; }
                .smartloc-dropdown.is-dragging-mode .smartloc-group-header { border: 1px dashed #0056b3; background: #f0f7ff; cursor: default !important; padding: 9px 10px; }
                .smartloc-dropdown.is-dragging-mode .smartloc-group-header.drag-over { background: #bbdefb !important; border: 2px dashed #004085 !important; }

                .smartloc-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 2147483647; display: none; justify-content: center; align-items: center; font-family: Arial, sans-serif; }
                .smartloc-modal { background: #fff; width: 450px; max-width: 90%; border-radius: 8px; box-shadow: none; display: flex; flex-direction: column; overflow: hidden; }
                .smartloc-modal-header { background: #0056b3; color: #fff; padding: 12px 15px; font-size: 14px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
                .smartloc-modal-close { cursor: default; font-size: 16px; color: #fff; background: none; border: none; }
                .smartloc-modal-body { padding: 15px; max-height: 60vh; overflow-y: auto; }
.smartloc-cfg-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f8f9fa; border: 1px solid #dee2e6; margin-bottom: 5px; border-radius: 4px; cursor: grab; }
.smartloc-cfg-item:active { cursor: default !important; }
body.smartloc-dragging-mode, body.smartloc-dragging-mode * { cursor: default !important; }
                .smartloc-cfg-item.dragging { opacity: 0.4; }
                .smartloc-cfg-del { cursor: default; color: #dc3545; font-weight: bold; border: none; background: none; padding: 0 5px; }
                .smartloc-cfg-del:hover { background: #f8d7da; border-radius: 3px; }
                .smartloc-cfg-actions { display:flex; gap:3px; align-items:center; } .smartloc-cfg-move { width:24px; height:23px; padding:0; border:1px solid #c8ced3; border-radius:3px; background:#fff; color:#0056b3; font-weight:bold; cursor:pointer; } .smartloc-cfg-move:hover:not(:disabled) { background:#e3f2fd; border-color:#0056b3; } .smartloc-cfg-move:disabled { opacity:.35; cursor:default; }
                .smartloc-input { width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-bottom: 15px; box-sizing: border-box; font-size: 13px; }
                .smartloc-btn-primary { width: 100%; padding: 10px; background: #0056b3; color: #fff; border: none; border-radius: 4px; cursor: default; font-weight: bold; }
                .smartloc-btn-primary:hover { background: #004494; }
            `;
            document.head.appendChild(style);
        }

        let listaDadosNativos = [];
        let draggedItemValue = null;

        function capturarDadosNativos() {
            const select = document.querySelector('#selNovoLocalizador');
            if (!select) return [];
            let temp = [];
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value !== "" && select.options[i].value !== "null") {
                    temp.push({ value: select.options[i].value, text: select.options[i].textContent.trim() });
                }
            }
            return temp;
        }

        function getEstrutura() {
            let grupos = [];
            let estrutura = { "Sem Grupo": [] };

            try {
                const gStr = localStorage.getItem(KEYS.GRUPOS);
                if (gStr) grupos = JSON.parse(gStr);
            } catch (e) {}

            try {
                const eStr = localStorage.getItem(KEYS.ESTRUTURA);
                if (eStr) estrutura = JSON.parse(eStr);
            } catch (e) {}

            if (!estrutura['Sem Grupo']) estrutura['Sem Grupo'] = [];
            grupos.forEach(g => { if (!estrutura[g]) estrutura[g] = []; });
            // Grupos escondidos do campo (olho fechado no organizador): só valem os que ainda existem.
            const gruposOcultos = lerLocal('loc').gruposOcultos.filter(g => grupos.includes(g));
            return { grupos, estrutura, gruposOcultos };
        }

        // Grava no localStorage do eproc e espelha para o organizador. Só carimba (`at`) quando algo mudou de fato.
        // `gruposOcultos` omitido mantém o que já estava gravado.
        function salvarEstrutura(grupos, estrutura, gruposOcultos) {
            try {
                const antes = lerLocal('loc');
                const ocultos = (Array.isArray(gruposOcultos) ? gruposOcultos : antes.gruposOcultos).filter(g => grupos.includes(g));
                const igual = antes.at && JSON.stringify(antes.grupos) === JSON.stringify(grupos) && JSON.stringify(antes.estrutura) === JSON.stringify(estrutura)
                    && JSON.stringify(antes.gruposOcultos) === JSON.stringify(ocultos);
                const dados = { grupos, gruposOcultos: ocultos, estrutura, at: igual ? antes.at : Date.now() };
                if (!igual) gravarLocal('loc', dados);
                if (listaDadosNativos.length) SPBase.mudarPool(p => { p.catalogoLoc = listaDadosNativos.map(c => ({ value: String(c.value), text: String(c.text) })); });
            } catch (e) {}
        }

        function sincronizarComNativo() {
            listaDadosNativos = capturarDadosNativos();
            let { grupos, estrutura } = getEstrutura();
            if (!listaDadosNativos.length) return;
            let todosIdsValidos = listaDadosNativos.map(item => item.value);

            Object.keys(estrutura).forEach(grp => {
                estrutura[grp] = estrutura[grp].filter(val => todosIdsValidos.includes(val));
            });

            let todosSalvos = [];
            Object.keys(estrutura).forEach(grp => { todosSalvos.push(...estrutura[grp]); });

            listaDadosNativos.forEach(item => {
                if (!todosSalvos.includes(item.value)) {
                    const letras = item.text.match(/\p{L}/gu) || [];
                    const sistema = letras.length > 0 && letras.every(letra => /\p{Lu}/u.test(letra));
                    const destino = sistema ? 'SISTEMA' : 'Sem Grupo';
                    if (sistema && !grupos.includes(destino)) grupos.push(destino);
                    (estrutura[destino] ||= []).push(item.value);
                }
            });

            salvarEstrutura(grupos, estrutura);
        }

        function fecharDropdown() {
            const dropdown = document.getElementById('smartloc-dropdown');
            if (dropdown) dropdown.style.display = 'none';

            const triggerText = document.getElementById('smartloc-selected-text');
            const searchInput = document.getElementById('smartloc-search-input');

            if (triggerText) triggerText.style.display = 'block';
            if (searchInput) {
                searchInput.style.display = 'none';
                searchInput.value = '';
            }
        }

        function aplicarNoEproc(valor, texto) {
            fecharDropdown();
            const triggerText = document.getElementById('smartloc-selected-text');
            if (triggerText) triggerText.textContent = texto;

            const select = document.querySelector('#selNovoLocalizador');
            if (select) {
                select.value = valor;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        function injetarInterface() {
            const containerPai = document.querySelector('#fldPreferencias') || document.querySelector('#divMinutas') || document.querySelector('#dvLocalizadoresOrgao');
            const selectOriginal = document.querySelector('#selNovoLocalizador');

            if (!containerPai || !selectOriginal || document.querySelector('#smartloc-container')) return;

            sincronizarComNativo();

            const containerPainel = document.createElement('div');
            containerPainel.id = 'smartloc-container';
            containerPainel.className = 'smartloc-container';

            const textoInicial = selectOriginal.selectedIndex > 0
                ? selectOriginal.options[selectOriginal.selectedIndex].text : 'Buscar Localizador...';
            containerPainel.innerHTML = `
                <div class="smartloc-title">📂 Meus Localizadores</div>
                <div class="smartloc-trigger" id="smartloc-trigger">
                    <span class="smartloc-trigger-text" id="smartloc-selected-text">Buscar Localizador...</span>
                    <input type="text" id="smartloc-search-input" class="smartloc-search-input" placeholder="🔍 Filtrar localizadores..." autocomplete="off">
                    <span style="font-size:10px; margin-left: 8px;">▼</span>
                </div>
                <div class="smartloc-toolbar">
                    <button type="button" class="smartloc-icon-btn" id="btn-sync-loc" title="Recarregar localizadores" aria-label="Recarregar localizadores">${SVG.sync}</button>
                    <button type="button" class="smartloc-org-btn" id="btn-organizar-loc" aria-label="Organizar grupos e localizadores" title="Organizar grupos e localizadores em uma janela própria">${SVG.grid}</button>
                </div>
            `;

            containerPai.parentNode.insertBefore(containerPainel, containerPai);

            const dropdown = document.createElement('div');
            dropdown.className = 'smartloc-dropdown';
            dropdown.id = 'smartloc-dropdown';

            const listContainer = document.createElement('div');
            listContainer.className = 'smartloc-list-container';
            listContainer.id = 'smartloc-list';

            dropdown.appendChild(listContainer);
            document.body.appendChild(dropdown);

            injetarModaisBody();

            const trigger = containerPainel.querySelector('#smartloc-trigger');
            const searchInput = document.getElementById('smartloc-search-input');
            const triggerText = document.getElementById('smartloc-selected-text');
            triggerText.textContent = textoInicial;

            const posicionarMenu = () => {
                const rect = trigger.getBoundingClientRect();
                dropdown.style.top = (rect.bottom + window.scrollY + 2) + 'px';
                dropdown.style.left = (rect.left + window.scrollX) + 'px';
                dropdown.style.width = Math.max(380, rect.width) + 'px';

                const spaceBelow = window.innerHeight - rect.bottom - 15;
                dropdown.style.maxHeight = Math.max(200, spaceBelow) + 'px';
            };

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isFechado = dropdown.style.display === 'none' || dropdown.style.display === '';
                if (isFechado) {
                    posicionarMenu();
                    dropdown.style.display = 'flex';
                    renderizarLista();

                    triggerText.style.display = 'none';
                    searchInput.style.display = 'block';
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                    setTimeout(() => searchInput.focus(), 50);
                } else {
                    fecharDropdown();
                }
            });

            searchInput.addEventListener('input', (e) => {
                const termo = e.target.value.toLowerCase();
                const grupos = dropdown.querySelectorAll('.smartloc-group');

                grupos.forEach(grupo => {
                    let temVisivel = false;
                    const itens = grupo.querySelectorAll('.smartloc-item');
                    const containerItens = grupo.querySelector('.smartloc-items');

                    itens.forEach(item => {
                        const texto = item.textContent.toLowerCase();
                        if (texto.includes(termo)) {
                            item.style.display = '';
                            temVisivel = true;
                        } else {
                            item.style.display = 'none';
                        }
                    });

                    if (termo !== '') {
                        containerItens.classList.remove('collapsed');
                    } else {
                        containerItens.classList.add('collapsed');
                    }

                    grupo.style.display = (temVisivel || termo === '') ? 'block' : 'none';
                });
            });

            document.addEventListener('click', (e) => {
                if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                    fecharDropdown();
                }
            });

            window.addEventListener('resize', () => { if (dropdown.style.display === 'flex') posicionarMenu(); });
            document.addEventListener('scroll', () => { if (dropdown.style.display === 'flex') posicionarMenu(); }, true);

            containerPainel.querySelector('#btn-sync-loc').onclick = () => {
                sincronizarComNativo();
                renderizarLista();
                alert("Localizadores sincronizados!");
            };


            containerPainel.querySelector('#btn-organizar-loc').onclick = () => {
                // O navegador abre o Organizador em janela própria (pedido levado ao host pelo tab-preload.js).
                SPBase.abrirOrganizador('loc');
            };
        }

        function renderizarLista() {
            const listContainer = document.querySelector('#smartloc-list');
            if (!listContainer) return;

            const gruposAbertos = Array.from(listContainer.querySelectorAll('.smartloc-group'))
                .filter(g => !g.querySelector('.smartloc-items').classList.contains('collapsed'))
                .map(g => g.getAttribute('data-group-name'));

            listContainer.innerHTML = '';
            const { grupos, estrutura, gruposOcultos } = getEstrutura();
            const gruposEscondidos = new Set([GRUPO_OCULTOS, ...gruposOcultos]);
            const idsEscondidos = new Set([...gruposEscondidos].flatMap(nome => estrutura[nome] || []));

            for (const nome of new Set([...grupos, 'Sem Grupo'])) {
                if (gruposEscondidos.has(nome)) continue;
                const ids = (estrutura[nome] || []).filter(id => !idsEscondidos.has(id));
                if (!ids.length && nome === 'Sem Grupo') continue;
                criarBlocoGrupo(nome, ids, listContainer, gruposAbertos.includes(nome));
            }

            const searchInput = document.getElementById('smartloc-search-input');
            if (searchInput && searchInput.value.trim() !== '') {
                searchInput.dispatchEvent(new Event('input'));
            }
        }

        function criarBlocoGrupo(nome, ids, container, isOpen = false) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'smartloc-group';
            groupDiv.setAttribute('data-group-name', nome);

            const header = document.createElement('div');
            header.className = 'smartloc-group-header';
            header.innerHTML = `<span>${nome} (${ids.length})</span> <span class="toggle-icon">▼</span>`;

            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'smartloc-items';
            if (!isOpen) itemsContainer.classList.add('collapsed');

            let hoverTimer;
            groupDiv.addEventListener('mouseenter', () => {
                const dropdown = document.getElementById('smartloc-dropdown');
                if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
                hoverTimer = setTimeout(() => { itemsContainer.classList.remove('collapsed'); }, 400);
            });

            groupDiv.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
                const dropdown = document.getElementById('smartloc-dropdown');
                if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
                const searchInput = document.getElementById('smartloc-search-input');
                if (!draggedItemValue && searchInput && searchInput.value.trim() === '') itemsContainer.classList.add('collapsed');
            });

            header.addEventListener('click', () => {
                const dropdown = document.getElementById('smartloc-dropdown');
                if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
                itemsContainer.classList.toggle('collapsed');
            });

            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                header.classList.add('drag-over');
            });
            header.addEventListener('dragleave', () => header.classList.remove('drag-over'));
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                header.classList.remove('drag-over');
                const dropdown = document.getElementById('smartloc-dropdown');
                if (dropdown) dropdown.classList.remove('is-dragging-mode');
                if (draggedItemValue) {
                    moverItem(draggedItemValue, nome);
                }
            });

            if (ids.length === 0) {
                itemsContainer.innerHTML = '<div class="smartloc-empty-notice">Arraste localizadores para cá</div>';
            } else {
                ids.forEach(id => {
                    const nativo = listaDadosNativos.find(item => item.value === id);
                    if (nativo) {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'smartloc-item';
                        itemDiv.textContent = nativo.text;
                        itemDiv.title = nativo.text;
                        itemDiv.draggable = true;

                        itemDiv.addEventListener('click', (e) => {
                            e.stopPropagation();
                            aplicarNoEproc(nativo.value, nativo.text);
                        });

                        itemDiv.addEventListener('dragstart', (e) => {
                            draggedItemValue = nativo.value;
                            itemDiv.classList.add('dragging');
                            e.dataTransfer.effectAllowed = 'move';
                            try {
                                e.dataTransfer.setData('text/plain', nativo.text);
                            } catch (err) {}

                            // Executa no próximo ciclo de renderização para permitir que o navegador
                            // inicie a captura do drag ghost antes de ocultar os itens
                            setTimeout(() => {
                                if (draggedItemValue) {
                                    const dropdown = document.getElementById('smartloc-dropdown');
                                    if (dropdown) dropdown.classList.add('is-dragging-mode');
                                }
                            }, 0);
                        });

                        itemDiv.addEventListener('dragend', () => {
                            itemDiv.classList.remove('dragging');
                            draggedItemValue = null;
                            const dropdown = document.getElementById('smartloc-dropdown');
                            if (dropdown) {
                                dropdown.classList.remove('is-dragging-mode');
                                const searchInput = document.getElementById('smartloc-search-input');
                                if (searchInput) searchInput.dispatchEvent(new Event('input'));
                            }
                        });

                        itemsContainer.appendChild(itemDiv);
                    }
                });
            }

            groupDiv.appendChild(header);
            groupDiv.appendChild(itemsContainer);
            container.appendChild(groupDiv);
        }

        function moverItem(id, grupoDestino) {
            let { grupos, estrutura } = getEstrutura();
            Object.keys(estrutura).forEach(grp => {
                estrutura[grp] = estrutura[grp].filter(v => v !== id);
            });

            if (!estrutura[grupoDestino]) estrutura[grupoDestino] = [];
            if (!estrutura[grupoDestino].includes(id)) {
                estrutura[grupoDestino].push(id);
            }

            salvarEstrutura(grupos, estrutura);
            renderizarLista();
        }

        function injetarModaisBody() {
            if (document.querySelector('#smartloc-overlay-cfg')) return;

            const modalCfg = document.createElement('div');
            modalCfg.id = 'smartloc-overlay-cfg';
            modalCfg.className = 'smartloc-overlay';
            modalCfg.innerHTML = `
                <div class="smartloc-modal">
                    <div class="smartloc-modal-header">
                        <span>⚙️ Organizar Grupos de Localizadores</span>
                        <button class="smartloc-modal-close" id="btn-close-modal-loc-cfg">✖</button>
                    </div>
                    <div class="smartloc-modal-body">
                        <p style="font-size:12px; color:#666; margin-top:0;">Arraste para reordenar. O X exclui o grupo (itens voltam para Sem Grupo).</p>
                        <div id="smartloc-cfg-list"></div>
                    </div>
                </div>
            `;

            const modalBloco = document.createElement('div');
            modalBloco.id = 'smartloc-overlay-bloco';
            modalBloco.className = 'smartloc-overlay';
            modalBloco.innerHTML = `
                <div class="smartloc-modal">
                    <div class="smartloc-modal-header">
                        <span>📦 Inclusão em Bloco (Localizadores)</span>
                        <button class="smartloc-modal-close" id="btn-close-modal-loc-bloco">✖</button>
                    </div>
                    <div class="smartloc-modal-body">
                        <label style="font-size:12px; font-weight:bold;">Grupo de Destino:</label>
                        <select id="bloco-alvo-loc" class="smartloc-input"></select>

                        <label style="font-size:12px; font-weight:bold;">Texto a procurar no Localizador:</label>
                        <input type="text" id="bloco-termo-loc" class="smartloc-input" placeholder="Ex: GABINETE">

                        <button id="bloco-executar-loc" class="smartloc-btn-primary">Puxar Localizadores</button>
                    </div>
                </div>
            `;

            const modalNewGrp = document.createElement('div');
            modalNewGrp.id = 'smartloc-overlay-newgrp';
            modalNewGrp.className = 'smartloc-overlay';
            modalNewGrp.innerHTML = `
                <div class="smartloc-modal">
                    <div class="smartloc-modal-header">
                        <span>➕ Criar Novo Grupo de Localizadores</span>
                        <button class="smartloc-modal-close" id="btn-close-modal-loc-newgrp">✖</button>
                    </div>
                    <div class="smartloc-modal-body">
                        <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:5px;">Nome do Grupo:</label>
                        <input type="text" id="smartloc-new-grp-input" class="smartloc-input" placeholder="Ex: URGENTES, GABINETE..." autocomplete="off">
                        <div id="smartloc-new-grp-error" style="color:#dc3545; font-size:11px; margin-top:-10px; margin-bottom:10px; display:none;"></div>
                        <div style="display:flex; gap:10px;">
                            <button id="btn-confirm-loc-newgrp" class="smartloc-btn-primary" style="flex:1;">Criar Grupo</button>
                            <button id="btn-cancel-loc-newgrp" style="flex:1; padding:10px; background:#e9ecef; border:1px solid #ced4da; border-radius:4px; cursor:default; font-weight:bold; color:#495057;">Cancelar</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modalCfg);
            document.body.appendChild(modalBloco);
            document.body.appendChild(modalNewGrp);

            document.getElementById('btn-close-modal-loc-cfg').onclick = () => {
                modalCfg.style.display = 'none';
            };
            document.getElementById('btn-close-modal-loc-bloco').onclick = () => {
                modalBloco.style.display = 'none';
            };
            document.getElementById('btn-close-modal-loc-newgrp').onclick = () => {
                modalNewGrp.style.display = 'none';
            };
            document.getElementById('btn-cancel-loc-newgrp').onclick = () => {
                modalNewGrp.style.display = 'none';
            };
        }

        function abrirModalNovoGrupo() {
            const overlay = document.getElementById('smartloc-overlay-newgrp');
            const input = document.getElementById('smartloc-new-grp-input');
            const errorDiv = document.getElementById('smartloc-new-grp-error');
            const btnConfirm = document.getElementById('btn-confirm-loc-newgrp');
            if (!overlay || !input) return;

            input.value = '';
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.style.display = 'none';
            }
            overlay.style.display = 'flex';
            setTimeout(() => input.focus(), 50);

            const confirmar = () => {
                const nome = input.value.trim();
                if (!nome) {
                    errorDiv.textContent = 'Por favor, informe o nome do grupo.';
                    errorDiv.style.display = 'block';
                    input.focus();
                    return;
                }
                if (nome.toLowerCase() === 'sem grupo' || nome.toLowerCase() === 'ocultos') {
                    errorDiv.textContent = 'Nome reservado pelo sistema.';
                    errorDiv.style.display = 'block';
                    input.focus();
                    return;
                }

                let { grupos, estrutura } = getEstrutura();
                if (grupos.some(g => g.toLowerCase() === nome.toLowerCase())) {
                    errorDiv.textContent = 'Já existe um grupo com este nome.';
                    errorDiv.style.display = 'block';
                    input.focus();
                    return;
                }

                grupos.push(nome);
                if (!estrutura[nome]) estrutura[nome] = [];
                salvarEstrutura(grupos, estrutura);

                overlay.style.display = 'none';

                // Garante abertura e renderização do grupo
                const dropdown = document.getElementById('smartloc-dropdown');
                const triggerText = document.getElementById('smartloc-selected-text');
                const searchInput = document.getElementById('smartloc-search-input');
                const listContainer = document.getElementById('smartloc-list');

                if (dropdown) {
                    const isFechado = dropdown.style.display === 'none' || dropdown.style.display === '';
                    if (isFechado) {
                        posicionarMenu();
                        dropdown.style.display = 'flex';
                        if (triggerText) triggerText.style.display = 'none';
                        if (searchInput) searchInput.style.display = 'block';
                    }
                    if (searchInput) searchInput.value = '';
                    renderizarLista();

                    setTimeout(() => {
                        const grupoElem = listContainer ? listContainer.querySelector(`[data-group-name="${CSS.escape(nome)}"]`) : null;
                        if (grupoElem) {
                            grupoElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            const headerElem = grupoElem.querySelector('.smartloc-group-header');
                            if (headerElem) {
                                headerElem.style.transition = 'background-color 0.4s';
                                headerElem.style.backgroundColor = '#bbdefb';
                                setTimeout(() => headerElem.style.backgroundColor = '', 1200);
                            }
                        }
                    }, 100);
                }
            };

            btnConfirm.onclick = confirmar;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmar();
                } else if (e.key === 'Escape') {
                    overlay.style.display = 'none';
                }
            };
        }

        function abrirModalConfiguracao() {
            const overlay = document.getElementById('smartloc-overlay-cfg');
            const listDiv = document.getElementById('smartloc-cfg-list');
            overlay.style.display = 'flex';

            function renderizarListaConfig() {
                listDiv.innerHTML = '';
                let { grupos, estrutura } = getEstrutura();
                let dragSourceIndex = null;

                if (grupos.length === 0) {
                    listDiv.innerHTML = '<span style="font-size:12px; color:#999;">Nenhum grupo criado.</span>';
                    return;
                }

                grupos.forEach((grupoNome, index) => {
                    const item = document.createElement('div');
                    item.className = 'smartloc-cfg-item';
                    item.draggable = true;
                    item.innerHTML = `<span>≡ ${grupoNome}</span><span class="smartloc-cfg-actions"><button type="button" class="smartloc-cfg-move" data-move="up" title="Mover grupo para cima" ${index === 0 ? 'disabled' : ''}>▲</button><button type="button" class="smartloc-cfg-move" data-move="down" title="Mover grupo para baixo" ${index === grupos.length - 1 ? 'disabled' : ''}>▼</button><button type="button" class="smartloc-cfg-del" title="Excluir Grupo">X</button></span>`;

                    const moverGrupo = (direction) => {
                        const currentIndex = grupos.indexOf(grupoNome);
                        const targetIndex = currentIndex + direction;
                        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= grupos.length) return;
                        [grupos[currentIndex], grupos[targetIndex]] = [grupos[targetIndex], grupos[currentIndex]];
                        salvarEstrutura(grupos, estrutura);
                        renderizarListaConfig();
                        renderizarLista();
                    };
                    item.querySelector('[data-move="up"]').onclick = (event) => { event.stopPropagation(); moverGrupo(-1); };
                    item.querySelector('[data-move="down"]').onclick = (event) => { event.stopPropagation(); moverGrupo(1); };

                    item.querySelector('.smartloc-cfg-del').onclick = () => {
                        if (confirm(`Tem certeza que deseja excluir o grupo "${grupoNome}"? Os localizadores voltarão para "Sem Grupo".`)) {
                            let itensDoGrupo = estrutura[grupoNome] || [];
                            estrutura['Sem Grupo'].push(...itensDoGrupo);
                            delete estrutura[grupoNome];
                            grupos.splice(index, 1);
                            salvarEstrutura(grupos, estrutura);
                            renderizarListaConfig();
                            renderizarLista();
                        }
                    };

                    item.addEventListener('dragstart', (e) => {
    dragSourceIndex = grupos.indexOf(grupoNome);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('smartloc-dragging-mode');
});

item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.body.classList.remove('smartloc-dragging-mode');
});
                    item.addEventListener('dragover', (e) => { e.preventDefault(); });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const dropIndex = grupos.indexOf(grupoNome);
                        if (dragSourceIndex !== null && dragSourceIndex !== dropIndex) {
                            const movido = grupos.splice(dragSourceIndex, 1)[0];
                            grupos.splice(dropIndex, 0, movido);
                            salvarEstrutura(grupos, estrutura);
                            renderizarListaConfig();
                            renderizarLista();
                        }
                    });

                    listDiv.appendChild(item);
                });
            }
            renderizarListaConfig();
        }

        function abrirModalBloco() {
            const overlay = document.getElementById('smartloc-overlay-bloco');
            const selectAlvo = document.getElementById('bloco-alvo-loc');
            const inputTermo = document.getElementById('bloco-termo-loc');
            const btnExecutar = document.getElementById('bloco-executar-loc');

            let { grupos } = getEstrutura();

            selectAlvo.innerHTML = '';
            const allOptions = [...grupos, 'Sem Grupo'];
            allOptions.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = g;
                selectAlvo.appendChild(opt);
            });

            inputTermo.value = '';
            overlay.style.display = 'flex';

            btnExecutar.onclick = () => {
                const termo = inputTermo.value.trim().toLowerCase();
                const alvo = selectAlvo.value;

                if (termo === '') {
                    alert("Digite um termo para a busca.");
                    return;
                }

                let { grupos, estrutura } = getEstrutura();
                let contagemMoved = 0;

                Object.keys(estrutura).forEach(grpAtual => {
                    if (grpAtual === alvo || grpAtual === 'Ocultos') return; // itens ocultos não entram no lote

                    estrutura[grpAtual] = estrutura[grpAtual].filter(id => {
                        const itemNativo = listaDadosNativos.find(i => i.value === id);
                        if (itemNativo && itemNativo.text.toLowerCase().includes(termo)) {
                            if (!estrutura[alvo]) estrutura[alvo] = [];
                            if (!estrutura[alvo].includes(id)) {
                                estrutura[alvo].push(id);
                                contagemMoved++;
                            }
                            return false;
                        }
                        return true;
                    });
                });

                if (contagemMoved > 0) {
                    salvarEstrutura(grupos, estrutura);
                    renderizarLista();
                    alert(`✅ Sucesso! ${contagemMoved} localizador(es) movido(s) para "${alvo}".`);
                    overlay.style.display = 'none';
                } else {
                    alert(`Nenhum localizador encontrado contendo "${inputTermo.value}" fora do grupo "${alvo}".`);
                }
            };
        }

        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (document.querySelector('#smartloc-container')) {
                observer.disconnect();
                return;
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                injetarInterface();
                if (document.querySelector('#smartloc-container')) {
                    observer.disconnect();
                }
            }, 250);
        });
        // Mudanças feitas no Organizador (ou em outra aba) chegam pela própria base: redesenha a lista aberta.
        SPBase.aoMudarBase(() => { sincronizarComNativo(); renderizarLista(); });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
        setTimeout(() => observer.disconnect(), 6000);
        injetarInterface();
})();
