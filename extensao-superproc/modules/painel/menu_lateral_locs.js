/**
 * SuperPROC - Módulo: Meus Localizadores (painel flutuante)
 *
 * O que faz: transforma o botão "Meus Localizadores" em um painel (flyout) de 4 colunas, com grupos personalizados,
 *   reordenação por arrastar e soltar e atualização dos dados em segundo plano.
 * Onde roda: páginas do eproc que têm o botão "Meus Localizadores".
 * Dados (localStorage do eproc): eproc_locs_grupos_lista (grupos), eproc_locs_estrutura_ordem ({ "<grupo>": [nomes] })
 *   e eproc_locs_dados_cache (cache dos localizadores e contagens, refeito a partir da própria página).
 */

export default {
    id: 'painel_menu_lateral_locs',
    name: 'Meus Localizadores',
    category: 'Painel & Menus',
    description: 'Painel flyout em 4 colunas sob o ícone "Meus Localizadores" com drag-and-drop.',
    defaultEnabled: false,

    matches: (url, params) => url.pathname.includes('controlador.php'),

    async init() {
        if (window.__superprocMenuLateralInjetado) return;
        window.__superprocMenuLateralInjetado = true;

        const STORAGE_KEY_GRUPOS = 'eproc_locs_grupos_lista';
        const STORAGE_KEY_ESTRUTURA = 'eproc_locs_estrutura_ordem';
        const STORAGE_KEY_CACHE = 'eproc_locs_dados_cache';

        let bgFetchJaExecutadoNestaPagina = false;

        // Helpers de armazenamento síncrono e confiável
        function getStorage(key, defaultVal) {
            try {
                const val = localStorage.getItem(key);
                return val !== null ? JSON.parse(val) : defaultVal;
            } catch {
                return defaultVal;
            }
        }

        function setStorage(key, val) {
            try {
                localStorage.setItem(key, JSON.stringify(val));
            } catch (e) {
                console.warn('[SuperPROC: MenuLateral] Erro ao salvar storage:', e);
            }
        }

        // 1. ESTILOS BASE
        if (!document.getElementById('superproc-menulateral-style')) {
            const style = document.createElement('style');
            style.id = 'superproc-menulateral-style';
            style.innerHTML = `
                
                #btn-meus-localizadores { position: relative; cursor: pointer !important; }

                #flyout-quick-localizadores { position: absolute; top: 100%; width: max-content; max-width: calc(100vw - 20px); max-height: calc(100vh - 65px); background-color: #ffffff; border-radius: 6px; box-shadow: 0 12px 35px rgba(0,0,0,0.4); z-index: 9999999; overflow-x: hidden; overflow-y: auto; border: 1px solid #ced4da; font-family: Roboto, Arial, sans-serif; font-size: 12px; color: #212529; display: none; padding: 0; box-sizing: border-box; user-select: none; touch-action: none; }

                /* Barra superior: filtro e ocultar vazios */
                .quick-locs-toolbar { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 14px; padding: 8px 12px; background: #ffffff; border-bottom: 1px solid #dee2e6; }
                .quick-locs-filter { flex: 1; min-width: 140px; height: 28px; padding: 0 8px; border: 1px solid #ced4da; border-radius: 4px; background: #ffffff; color: #212529; font: 12px Roboto, Arial, sans-serif; box-sizing: border-box; user-select: text; }
                .quick-locs-filter::placeholder { color: #6c757d; }
                .quick-locs-filter:focus { outline: 2px solid #0056b3; outline-offset: 0; border-color: #0056b3; }
                .quick-locs-toggle { display: inline-flex; align-items: center; gap: 6px; color: #495057; cursor: pointer; white-space: nowrap; }
                .quick-locs-toggle input { margin: 0; accent-color: #0056b3; cursor: pointer; }

                /* Colunas montadas por script: os grupos seguem a ordem do usuário e as colunas ficam equilibradas */
                .quick-locs-columns { display: flex; align-items: flex-start; gap: 12px; padding: 4px 12px 8px; }
                .quick-locs-col { width: 255px; flex: none; }
                .quick-group-wrapper { width: 100%; margin-bottom: 10px; }
                .quick-locs-nores { padding: 24px 12px; text-align: center; color: #6c757d; display: none; }

                .quick-group-header { font-size: 11px; font-weight: bold; color: #0056b3; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 4px 3px 4px; margin-top: 6px; margin-bottom: 4px; border-bottom: 2px solid #0056b3; display: flex; justify-content: space-between; align-items: center; cursor: default !important; user-select: none; width: 100%; box-sizing: border-box; background: #ffffff; }
                .quick-group-header:active { cursor: grabbing; }
                .quick-group-header.dragging-group { opacity: 0.4; }
                .quick-group-header.drag-over-group-top { border-top: 2px dashed #0056b3 !important; }
                .quick-group-header.drag-over-group-bottom { border-bottom: 2px dashed #0056b3 !important; }
                .quick-group-total { color: #6c757d; font-weight: normal; letter-spacing: 0; font-variant-numeric: tabular-nums; }

                .quick-group-empty-notice { font-size: 11px; color: #6c757d; font-style: italic; padding: 6px; border: 1px dashed #ced4da; border-radius: 4px; text-align: center; width: 100%; box-sizing: border-box; }

                .quick-loc-item { width: 100%; height: 28px; margin-bottom: 2px; background: #ffffff; border: 1px solid #dee2e6; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px; box-sizing: border-box; cursor: pointer !important; user-select: none; text-decoration: none !important; }
                .quick-loc-item:hover { background-color: #f1f3f5; border-color: #ced4da; text-decoration: none !important; }
                .quick-loc-item:focus-visible { outline: 2px solid #0056b3; outline-offset: -2px; }
                .quick-loc-item.dragging { opacity: 0.4; }
                .quick-loc-item.drag-over-top { border-top: 2px solid #0056b3 !important; }
                .quick-loc-item.drag-over-bottom { border-bottom: 2px solid #0056b3 !important; }

                .quick-loc-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #212529; font-weight: 500; pointer-events: none; }
                .quick-loc-count { color: #0056b3; font-weight: bold; text-decoration: none; min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; pointer-events: none; }

                .quick-loc-empty { opacity: 0.65; cursor: default !important; }
                .quick-loc-empty .quick-loc-name { font-weight: normal; }
                .quick-loc-empty .quick-loc-count { color: #6c757d; }

                /* Rodapé: à esquerda atualizar/ir para a página; à direita a gestão de grupos */
                .quick-locs-footer { position: sticky; bottom: 0; background: #ffffff; border-top: 1px solid #dee2e6; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; z-index: 100; }
                .quick-footer-set { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
                .quick-btn-group-action { font: 500 11px Roboto, Arial, sans-serif; height: 26px; padding: 0 10px; border-radius: 4px; border: 1px solid #ced4da; background: #ffffff; cursor: pointer; color: #495057; display: inline-flex; align-items: center; gap: 5px; box-sizing: border-box; }
                .quick-btn-group-action:hover:not(:disabled) { background: #f1f3f5; color: #212529; }
                .quick-btn-group-action:focus-visible { outline: 2px solid #0056b3; outline-offset: 1px; }
                .quick-btn-group-action:disabled { opacity: 0.65; cursor: default; }
                .quick-btn-group-action.is-primary { color: #0056b3; border-color: #0056b3; }
                .quick-btn-group-action.is-danger:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; border-color: #b91c1c; }
                .quick-btn-group-action.is-loading svg { animation: quick-locs-giro 0.8s linear infinite; }
                @keyframes quick-locs-giro { to { transform: rotate(360deg); } }
                @media (prefers-reduced-motion: reduce) { .quick-btn-group-action.is-loading svg { animation: none; } }

                /* Formulários em linha (novo grupo, estilo) */
                .quick-inline-form { flex-basis: 100%; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 6px; }
                .quick-inline-form input[type="text"], .quick-inline-form textarea { border: 1px solid #ced4da; border-radius: 4px; background: #ffffff; color: #212529; font: 12px Roboto, Arial, sans-serif; box-sizing: border-box; user-select: text; }
                .quick-inline-form input[type="text"] { flex: 1; min-width: 0; height: 26px; padding: 0 8px; }
                .quick-inline-form input[type="text"]:focus, .quick-inline-form textarea:focus { outline: 2px solid #0056b3; outline-offset: 0; border-color: #0056b3; }
                .quick-style-editor { flex-direction: column; align-items: stretch; }
                .quick-style-editor label { color: #495057; }
                .quick-style-editor textarea { display: block; width: 100%; height: 160px; margin-top: 6px; padding: 6px 8px; font: 11px Consolas, monospace; }
                .quick-style-editor .quick-footer-set { justify-content: flex-start; }
                .quick-inline-msg { color: #b02a37; font-size: 11px; }

                #modal-del-grupos { position: absolute; bottom: 44px; right: 12px; background: #ffffff; border: 1px solid #adb5bd; border-radius: 5px; box-shadow: 0 4px 15px rgba(0,0,0,0.25); padding: 8px; z-index: 101; width: 230px; max-height: 220px; overflow-y: auto; display: none; }
                .del-group-title { font-weight: bold; color: #212529; }
                .del-group-hint { color: #6c757d; font-size: 10px; margin: 2px 0 6px; }
                .del-group-item { width: 100%; padding: 5px 6px; font: 11px Roboto, Arial, sans-serif; color: #212529; background: none; border: 0; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 3px; }
                .del-group-item:hover { background-color: #fee2e2; color: #b91c1c; }
                .del-group-item:focus-visible { outline: 2px solid #0056b3; outline-offset: -2px; }
            `;
            document.head.appendChild(style);
        }

        // Painel do botão original de Meus Localizadores
        let dadosLocalizadoresCache = [];
        let reposicionarFlyout = () => {};
        let filtroAtual = '';
        const STORAGE_KEY_OCULTAR_VAZIOS = 'eproc_locs_ocultar_vazios';
        const LARGURA_COLUNA = 255;
        const ESPACO_COLUNAS = 12;

        const normalizarTexto = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

        // Divide a lista (na ordem do usuário) em até `n` colunas contíguas, minimizando a altura da maior.
        function particionarEmColunas(alturas, n) {
            if (!alturas.length) return [];
            let lo = Math.max(...alturas);
            let hi = alturas.reduce((a, b) => a + b, 0);
            const cabe = (H) => {
                let cols = 1, atual = 0;
                for (const a of alturas) { if (atual + a > H) { cols++; atual = a; } else atual += a; }
                return cols <= n;
            };
            while (lo < hi) { const mid = (lo + hi) >> 1; if (cabe(mid)) hi = mid; else lo = mid + 1; }
            const colunas = [[]];
            let atual = 0;
            alturas.forEach((a, i) => {
                if (atual + a > lo && colunas[colunas.length - 1].length) { colunas.push([]); atual = 0; }
                colunas[colunas.length - 1].push(i);
                atual += a;
            });
            return colunas;
        }

        function colunasDisponiveis() {
            const util = document.documentElement.clientWidth - 40 - 24;
            return Math.max(1, Math.min(4, Math.floor((util + ESPACO_COLUNAS) / (LARGURA_COLUNA + ESPACO_COLUNAS))));
        }

        function initQuickLocalizadores() {
            const btnOriginal = document.getElementById('btn-meus-localizadores');
            if (!btnOriginal || document.getElementById('flyout-quick-localizadores')) return;

            const urlAlvo = btnOriginal.href;

            const flyout = document.createElement('div');
            flyout.id = 'flyout-quick-localizadores';
            flyout.setAttribute('role', 'dialog');
            flyout.setAttribute('aria-label', 'Meus Localizadores');
            document.body.appendChild(flyout);

            let hoverTimer = null;

            // O painel tem a largura do conteúdo: alinha a borda direita ao botão e nunca sai da janela.
            function atualizarPosicao() {
                const rect = btnOriginal.getBoundingClientRect();
                const largura = flyout.offsetWidth || 560;
                const esquerdaMax = window.scrollX + document.documentElement.clientWidth - largura - 10;
                flyout.style.top = (rect.bottom + window.scrollY + 8) + 'px';
                flyout.style.left = Math.max(window.scrollX + 10, Math.min(rect.right + window.scrollX - largura, esquerdaMax)) + 'px';
            }
            reposicionarFlyout = atualizarPosicao;

            btnOriginal.addEventListener('mouseenter', () => {
                hoverTimer = setTimeout(() => { 
                    atualizarPosicao();
                    abrirMenuFlyout(flyout, urlAlvo, false); 
                }, 150); 
            });
            
            btnOriginal.addEventListener('mouseleave', () => { 
                if (hoverTimer) clearTimeout(hoverTimer); 
            });
            
            flyout.addEventListener('mouseenter', () => { 
                if (hoverTimer) clearTimeout(hoverTimer); 
            });
            
            flyout.addEventListener('mouseleave', () => { 
                hoverTimer = setTimeout(() => { 
                    if (draggedItemNome || draggedGrupoNome || flyout.contains(document.activeElement)) return;
                    flyout.style.display = 'none'; 
                }, 400); 
            });

            btnOriginal.addEventListener('click', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                if (hoverTimer) clearTimeout(hoverTimer);
                if (flyout.style.display === 'block') { 
                    flyout.style.display = 'none'; 
                } else {
                    atualizarPosicao();
                    flyout._focarFiltro = true; // clique: leva o cursor ao filtro (o hover não rouba o foco)
                    abrirMenuFlyout(flyout, urlAlvo, false);
                }
            });

            flyout.addEventListener('click', (e) => { e.stopPropagation(); });
            
            document.addEventListener('click', (e) => { 
                if (!flyout.contains(e.target) && e.target !== btnOriginal && !btnOriginal.contains(e.target)) { 
                    flyout.style.display = 'none'; 
                } 
            });
            
            document.addEventListener('keydown', (e) => { 
                if (e.key === 'Escape' && flyout.style.display === 'block') {
                    flyout.style.display = 'none';
                    if (flyout.contains(document.activeElement)) btnOriginal.focus({ preventScroll: true });
                }
            });
        }

        function abrirMenuFlyout(flyout, url, forcarAtualizacao) {
            flyout.style.display = 'block';

            const cachedData = getStorage(STORAGE_KEY_CACHE, null);
            if (cachedData && !forcarAtualizacao && dadosLocalizadoresCache.length === 0) {
                try { 
                    const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
                    dadosLocalizadoresCache = parsed.map(i => ({
                        nomeCompleto: i.nomeCompleto || '',
                        nomeCurto: i.nomeCurto || (i.nomeCompleto ? i.nomeCompleto.split(/\s+-\s+/)[0].trim() : ''),
                        qtdTexto: i.qtdTexto || '0',
                        link: i.link || null,
                        isEmpty: i.isEmpty ?? (i.qtdTexto === '0')
                    })).filter(i => i.nomeCompleto);
                } catch (e) {}
            }

            if (dadosLocalizadoresCache.length > 0 && !forcarAtualizacao) {
                renderizarFlyout(flyout, url);
                if (!bgFetchJaExecutadoNestaPagina) {
                    carregarTabelaLocalizadores(url, flyout, true);
                    bgFetchJaExecutadoNestaPagina = true;
                }
            } else {
                if (!flyout.dataset.loaded) {
                    flyout.innerHTML = '<div role="status" style="padding: 16px 24px; min-width: 220px; text-align: center; color: #6c757d;">Carregando localizadores…</div>';
                }
                carregarTabelaLocalizadores(url, flyout, false);
                bgFetchJaExecutadoNestaPagina = true;
            }
        }

        // 4. ESTRUTURAÇÃO E ORDENAÇÃO DE GRUPOS
        function getEstrutura() {
            let grupos = getStorage(STORAGE_KEY_GRUPOS, null);
            let estrutura = getStorage(STORAGE_KEY_ESTRUTURA, null);

            if (!grupos || !estrutura) {
                grupos = [];
                estrutura = { "Sem Grupo": [] };
                setStorage(STORAGE_KEY_GRUPOS, grupos);
                setStorage(STORAGE_KEY_ESTRUTURA, estrutura);
            }

            if (!estrutura['Sem Grupo']) estrutura['Sem Grupo'] = [];
            grupos.forEach(g => { if (!estrutura[g]) estrutura[g] = []; });
            return { grupos, estrutura };
        }

        function salvarEstrutura(grupos, estrutura) { 
            setStorage(STORAGE_KEY_GRUPOS, grupos); 
            setStorage(STORAGE_KEY_ESTRUTURA, estrutura); 
        }

        function sincronizarEstruturaComServidor(itensServidor) {
            let { grupos, estrutura } = getEstrutura();
            const nomesServidor = itensServidor.map(i => i.nomeCompleto);
            
            // Uma resposta parcial (ou cache antigo) não deve apagar a organização salva.
            
            const todosAlocados = [].concat(...Object.values(estrutura));
            nomesServidor.forEach(nome => { 
                if (!todosAlocados.includes(nome)) { 
                    estrutura['Sem Grupo'].push(nome); 
                } 
            });
            
            salvarEstrutura(grupos, estrutura); 
            return { grupos, estrutura };
        }

        function prepararListaParaRender() {
            const { grupos, estrutura } = sincronizarEstruturaComServidor(dadosLocalizadoresCache);
            const mapItens = new Map(dadosLocalizadoresCache.map(i => [i.nomeCompleto, i]));
            const listaFinal = [];

            grupos.forEach(grupoNome => {
                listaFinal.push({ tipo: 'HEADER', nome: grupoNome });
                const itensDoGrupo = (estrutura[grupoNome] || []).map(nome => mapItens.get(nome)).filter(Boolean);
                if (itensDoGrupo.length > 0) { 
                    itensDoGrupo.forEach(it => listaFinal.push({ tipo: 'ITEM', item: it, grupo: grupoNome })); 
                } else { 
                    listaFinal.push({ tipo: 'EMPTY_NOTICE', grupo: grupoNome }); 
                }
            });

            const semGrupoItens = (estrutura['Sem Grupo'] || []).map(nome => mapItens.get(nome)).filter(Boolean);
            if (semGrupoItens.length > 0) {
                listaFinal.push({ tipo: 'HEADER', nome: 'Sem Grupo', fixo: true });
                semGrupoItens.forEach(it => listaFinal.push({ tipo: 'ITEM', item: it, grupo: 'Sem Grupo' }));
            }
            return listaFinal;
        }

        // 5. RENDERIZAÇÃO COM BLOCOS AGRUPADOS E 4 COLUNAS
        let draggedItemNome = null; 
        let draggedGrupoNome = null;

        function renderizarFlyout(flyout, urlOriginal) {
            const elementos = prepararListaParaRender();
            const containerFlow = document.createElement('div');
            containerFlow.className = 'quick-locs-columns';

            // Um registro por grupo: o layout das colunas é refeito a partir dele (filtro, ocultar vazios, largura da janela).
            const grupos = [];
            let grupoAtual = null;
            let currentGroupWrapper = null;

            elementos.forEach(elem => {
                if (elem.tipo === 'HEADER') {
                    currentGroupWrapper = document.createElement('div');
                    currentGroupWrapper.className = 'quick-group-wrapper';
                    grupoAtual = { el: currentGroupWrapper, itens: [], avisoEl: null, totalEl: null, total: 0, altura: 0 };
                    grupos.push(grupoAtual);
                }

                const wrapperDiv = document.createElement('div');

                if (elem.tipo === 'HEADER') {
                    const hDiv = document.createElement('div');
                    hDiv.className = 'quick-group-header';
                    const nomeSpan = document.createElement('span');
                    nomeSpan.textContent = elem.nome;
                    hDiv.appendChild(nomeSpan);
                    grupoAtual.totalEl = document.createElement('span');
                    grupoAtual.totalEl.className = 'quick-group-total';
                    grupoAtual.totalEl.title = 'Total de processos no grupo';
                    hDiv.appendChild(grupoAtual.totalEl);
                    hDiv.dataset.grupo = elem.nome;
                    
                    if (!elem.fixo) {
                        hDiv.draggable = true;
                        hDiv.addEventListener('dragstart', (e) => { 
                            e.stopPropagation();
                            draggedGrupoNome = elem.nome; 
                            draggedItemNome = null; 
                            hDiv.classList.add('dragging-group'); 
                            e.dataTransfer.effectAllowed = 'move'; 
                            e.dataTransfer.setData('text/plain', elem.nome);
                        });
                        
                        hDiv.addEventListener('dragend', () => { 
                            draggedGrupoNome = null;
                            draggedItemNome = null;
                            hDiv.classList.remove('dragging-group'); 
                            document.querySelectorAll('.drag-over-group-top, .drag-over-group-bottom').forEach(el => { 
                                el.classList.remove('drag-over-group-top', 'drag-over-group-bottom'); 
                            }); 
                        });
                        
                        hDiv.addEventListener('dragover', (e) => { 
                            e.preventDefault(); 
                            if (draggedGrupoNome && draggedGrupoNome !== elem.nome) { 
                                const rect = hDiv.getBoundingClientRect(); 
                                const mid = rect.top + rect.height / 2; 
                                if (e.clientY < mid) { 
                                    hDiv.classList.add('drag-over-group-top'); 
                                    hDiv.classList.remove('drag-over-group-bottom'); 
                                } else { 
                                    hDiv.classList.add('drag-over-group-bottom'); 
                                    hDiv.classList.remove('drag-over-group-top'); 
                                } 
                            } 
                        });
                        
                        hDiv.addEventListener('dragleave', () => { 
                            hDiv.classList.remove('drag-over-group-top', 'drag-over-group-bottom'); 
                        });
                        
                        hDiv.addEventListener('drop', (e) => { 
                            e.preventDefault(); 
                            hDiv.classList.remove('drag-over-group-top', 'drag-over-group-bottom'); 
                            if (draggedGrupoNome && draggedGrupoNome !== elem.nome) { 
                                const rect = hDiv.getBoundingClientRect(); 
                                const mid = rect.top + rect.height / 2; 
                                const antes = e.clientY < mid; 
                                reordenarGrupos(draggedGrupoNome, elem.nome, antes, flyout, urlOriginal); 
                            } 
                        });
                    }
                    
                    hDiv.addEventListener('dragover', (e) => e.preventDefault());
                    hDiv.addEventListener('drop', (e) => { 
                        e.preventDefault(); 
                        if (draggedItemNome) { 
                            moverItemParaGrupo(draggedItemNome, elem.nome, 0, flyout, urlOriginal); 
                        } 
                    });
                    
                    wrapperDiv.appendChild(hDiv);
                } else if (elem.tipo === 'EMPTY_NOTICE') {
                    const eDiv = document.createElement('div'); 
                    eDiv.className = 'quick-group-empty-notice'; 
                    eDiv.textContent = 'Arraste um localizador para cá';
                    
                    eDiv.addEventListener('dragover', (e) => e.preventDefault());
                    eDiv.addEventListener('drop', (e) => { 
                        e.preventDefault(); 
                        if (draggedItemNome) { 
                            moverItemParaGrupo(draggedItemNome, elem.grupo, 0, flyout, urlOriginal); 
                        } 
                    });
                    
                    wrapperDiv.appendChild(eDiv);
                    if (grupoAtual) grupoAtual.avisoEl = wrapperDiv;
                } else {
                    const item = elem.item; 
                    const itemDiv = document.createElement('a'); 
                    itemDiv.className = `quick-loc-item ${item.isEmpty ? 'quick-loc-empty' : ''}`; 
                    itemDiv.title = `${item.nomeCompleto}\n(Clique para abrir | Arraste para mover/reordenar)`; 
                    itemDiv.draggable = true;

                    if (item.link && !item.isEmpty) {
                        itemDiv.href = item.link;
                    }
                    
                    itemDiv.innerHTML = `<span class="quick-loc-name">${item.nomeCurto}</span><span class="quick-loc-count">${item.qtdTexto}</span>`;

                    itemDiv.addEventListener('dragstart', (e) => { 
                        e.stopPropagation();
                        draggedItemNome = item.nomeCompleto; 
                        draggedGrupoNome = null; 
                        itemDiv.classList.add('dragging'); 
                        e.dataTransfer.effectAllowed = 'move'; 
                        e.dataTransfer.setData('text/plain', item.nomeCompleto);
                    });
                    
                    itemDiv.addEventListener('dragend', () => { 
                        draggedGrupoNome = null;
                        draggedItemNome = null;
                        itemDiv.classList.remove('dragging'); 
                        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => { 
                            el.classList.remove('drag-over-top', 'drag-over-bottom'); 
                        }); 
                    });
                    
                    itemDiv.addEventListener('dragover', (e) => { 
                        e.preventDefault(); 
                        if (draggedItemNome) { 
                            const rect = itemDiv.getBoundingClientRect(); 
                            const mid = rect.top + rect.height / 2; 
                            if (e.clientY < mid) { 
                                itemDiv.classList.add('drag-over-top'); 
                                itemDiv.classList.remove('drag-over-bottom'); 
                            } else { 
                                itemDiv.classList.add('drag-over-bottom'); 
                                itemDiv.classList.remove('drag-over-top'); 
                            } 
                        } 
                    });
                    
                    itemDiv.addEventListener('dragleave', () => { 
                        itemDiv.classList.remove('drag-over-top', 'drag-over-bottom'); 
                    });
                    
                    itemDiv.addEventListener('drop', (e) => { 
                        e.preventDefault(); 
                        itemDiv.classList.remove('drag-over-top', 'drag-over-bottom'); 
                        if (draggedItemNome) { 
                            const rect = itemDiv.getBoundingClientRect(); 
                            const mid = rect.top + rect.height / 2; 
                            const antes = e.clientY < mid; 
                            moverItemParaPosicao(draggedItemNome, elem.grupo, item.nomeCompleto, antes, flyout, urlOriginal); 
                        } 
                    });
                    
                    wrapperDiv.appendChild(itemDiv);
                    if (grupoAtual) {
                        grupoAtual.itens.push({ el: wrapperDiv, texto: normalizarTexto(item.nomeCompleto), vazio: !!item.isEmpty, link: (item.link && !item.isEmpty) ? item.link : null });
                        grupoAtual.total += parseInt(String(item.qtdTexto).replace(/\D/g, ''), 10) || 0;
                    }
                }

                currentGroupWrapper.appendChild(wrapperDiv);
            });
            grupos.forEach(g => { g.totalEl.textContent = g.itens.length ? g.total : ''; });

            const footer = document.createElement('div'); 
            footer.className = 'quick-locs-footer';
            footer.innerHTML = `
                <div class="quick-footer-set">
                    <button type="button" class="quick-btn-group-action" id="btn-atualizar-locs" title="Atualizar a lista e as contagens"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.68-5.68"/></svg><span>Atualizar</span></button>
                    <button type="button" class="quick-btn-group-action is-primary" id="btn-ir-localizadores" title="Ir para a página nativa de Meus Localizadores">Meus Localizadores</button>
                </div>
                <div class="quick-footer-set">
                    <button type="button" class="quick-btn-group-action" id="btn-add-grupo">Criar Grupo</button>
                    <button type="button" class="quick-btn-group-action is-danger" id="btn-del-grupo" aria-haspopup="true">Deletar Grupo</button>
                    <button type="button" class="quick-btn-group-action" id="btn-copiar-estilo" title="Copiar ou colar a organização (grupos e ordem)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copiar Estilo</button>
                </div>
                <div id="modal-del-grupos"></div>
            `;

            // Barra superior: filtro por texto e ocultar localizadores sem processos.
            const toolbar = document.createElement('div');
            toolbar.className = 'quick-locs-toolbar';
            toolbar.innerHTML = `
                <input type="search" class="quick-locs-filter" id="quick-locs-filtro" placeholder="Filtrar localizadores…" aria-label="Filtrar localizadores" autocomplete="off" spellcheck="false">
                <label class="quick-locs-toggle"><input type="checkbox" id="quick-locs-ocultar-vazios"> Ocultar vazios</label>
            `;
            const filtroEl = toolbar.querySelector('#quick-locs-filtro');
            const ocultarEl = toolbar.querySelector('#quick-locs-ocultar-vazios');
            filtroEl.value = filtroAtual;
            ocultarEl.checked = getStorage(STORAGE_KEY_OCULTAR_VAZIOS, false) === true;

            const semResultado = document.createElement('div');
            semResultado.className = 'quick-locs-nores';
            semResultado.setAttribute('role', 'status');
            semResultado.textContent = 'Nenhum localizador encontrado.';

            // Refaz as colunas com o que está visível, mantendo a ordem dos grupos e equilibrando a altura.
            function montarColunas() {
                const termo = normalizarTexto(filtroEl.value.trim());
                const ocultarVazios = ocultarEl.checked;
                const visiveis = [];
                grupos.forEach(g => {
                    let n = 0;
                    g.itens.forEach(i => {
                        const ok = (!termo || i.texto.includes(termo)) && !(ocultarVazios && i.vazio);
                        i.el.style.display = ok ? '' : 'none';
                        if (ok) n++;
                    });
                    const mostraAviso = !g.itens.length && !termo;
                    if (g.avisoEl) g.avisoEl.style.display = mostraAviso ? '' : 'none';
                    const visivel = g.itens.length ? n > 0 : mostraAviso;
                    g.el.style.display = visivel ? '' : 'none';
                    g.altura = 38 + (g.itens.length ? n * 30 : 32) + 10;
                    if (visivel) visiveis.push(g);
                });
                const numCols = Math.min(colunasDisponiveis(), Math.max(1, visiveis.length));
                containerFlow.textContent = '';
                particionarEmColunas(visiveis.map(g => g.altura), numCols).forEach(indices => {
                    const col = document.createElement('div');
                    col.className = 'quick-locs-col';
                    indices.forEach(i => col.appendChild(visiveis[i].el));
                    containerFlow.appendChild(col);
                });
                semResultado.style.display = visiveis.length ? 'none' : 'block';
                reposicionarFlyout();
            }

            filtroEl.addEventListener('input', () => { filtroAtual = filtroEl.value; montarColunas(); });
            filtroEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && filtroEl.value) {
                    e.stopPropagation();
                    filtroEl.value = '';
                    filtroAtual = '';
                    montarColunas();
                } else if (e.key === 'Enter') {
                    // Enter abre o localizador quando o filtro deixa um único resultado com processos.
                    const abertos = grupos.flatMap(g => g.itens).filter(i => i.el.style.display !== 'none' && i.link);
                    if (abertos.length === 1) window.location.href = abertos[0].link;
                }
            });
            ocultarEl.addEventListener('change', () => { setStorage(STORAGE_KEY_OCULTAR_VAZIOS, ocultarEl.checked); montarColunas(); });

            flyout.innerHTML = '';
            flyout.appendChild(toolbar);
            flyout.appendChild(containerFlow);
            flyout.appendChild(semResultado);
            flyout.appendChild(footer);
            flyout.dataset.loaded = 'true';
            montarColunas();
            if (flyout._focarFiltro) { flyout._focarFiltro = false; filtroEl.focus({ preventScroll: true }); }

            const btnAtualizar = footer.querySelector('#btn-atualizar-locs'); 
            const btnCopiarEstilo = footer.querySelector('#btn-copiar-estilo'); 
            const btnAdd = footer.querySelector('#btn-add-grupo'); 
            const btnDel = footer.querySelector('#btn-del-grupo'); 
            const modalDel = footer.querySelector('#modal-del-grupos');
            const btnMeusLocs = footer.querySelector('#btn-ir-localizadores');

            btnMeusLocs.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = urlOriginal;
            };

            btnAtualizar.onclick = (e) => { 
                e.stopPropagation(); 
                if (btnAtualizar.disabled) return;
                btnAtualizar.disabled = true;
                btnAtualizar.classList.add('is-loading');
                btnAtualizar.setAttribute('aria-busy', 'true');
                btnAtualizar.querySelector('span').textContent = 'Atualizando…';
                carregarTabelaLocalizadores(urlOriginal, flyout, false);
            };

            btnCopiarEstilo.onclick = (e) => {
                e.stopPropagation();
                const existente = footer.querySelector('.quick-style-editor');
                if (existente) { existente.querySelector('textarea').focus(); return; }
                const { grupos, estrutura } = getEstrutura();
                const menu = document.createElement('form');
                menu.className = 'quick-inline-form quick-style-editor';
                menu.innerHTML = '<label>Estilo atual: copie, ou cole outro JSON para substituir.<textarea aria-label="JSON do estilo dos localizadores" spellcheck="false"></textarea></label><div class="quick-footer-set"><button type="button" class="quick-btn-group-action" data-copy>Copiar</button><button type="submit" class="quick-btn-group-action is-primary">Substituir estilo</button><button type="button" class="quick-btn-group-action" data-close>Fechar</button><span class="quick-inline-msg" role="status"></span></div>';
                const campo = menu.querySelector('textarea');
                const status = menu.querySelector('[role="status"]');
                menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); menu.remove(); } });
                campo.value = JSON.stringify({ grupos, estrutura }, null, 4);
                menu.querySelector('[data-close]').onclick = () => menu.remove();
                menu.querySelector('[data-copy]').onclick = () => {
                    Promise.resolve().then(() => navigator.clipboard.writeText(campo.value)).then(() => {
                        status.textContent = 'Estilo copiado.';
                    }).catch(() => {
                        campo.focus();
                        campo.select();
                        status.textContent = 'Use Ctrl+C para copiar o texto selecionado.';
                    });
                };
                menu.onsubmit = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                        const novo = validarEstiloLocalizadores(campo.value);
                        salvarEstrutura(novo.grupos, novo.estrutura);
                        renderizarFlyout(flyout, urlOriginal);
                    } catch (erro) {
                        status.textContent = erro.message;
                    }
                };
                footer.appendChild(menu);
                campo.focus();
            };
            
            btnAdd.onclick = (e) => { 
                e.stopPropagation(); 
                const existente = footer.querySelector('.quick-new-group');
                if (existente) { existente.querySelector('input').focus(); return; }
                const form = document.createElement('form');
                form.className = 'quick-inline-form quick-new-group';
                form.innerHTML = '<input type="text" aria-label="Nome do novo grupo" placeholder="Nome do novo grupo" required autocomplete="off"><button type="submit" class="quick-btn-group-action is-primary">Criar</button><button type="button" class="quick-btn-group-action">Cancelar</button><span class="quick-inline-msg" role="status"></span>';
                footer.appendChild(form);
                form.querySelector('button[type="button"]').onclick = () => form.remove();
                form.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); form.remove(); } });
                form.querySelector('input').focus();
                form.onsubmit = (event) => {
                event.preventDefault();
                event.stopPropagation();
                const nome = form.querySelector('input').value;
                if (nome && nome.trim()) { 
                    const { grupos, estrutura } = getEstrutura(); 
                    const grupoLimpo = nome.trim(); 
                    if (grupoLimpo.toLowerCase() === 'sem grupo') { 
                        form.querySelector('[role="status"]').textContent = 'Nome reservado.';
                        return; 
                    } 
                    if (!grupos.includes(grupoLimpo)) { 
                        grupos.push(grupoLimpo); 
                        estrutura[grupoLimpo] = []; 
                        salvarEstrutura(grupos, estrutura); 
                        renderizarFlyout(flyout, urlOriginal); 
                    } else { 
                        form.querySelector('[role="status"]').textContent = 'Grupo já existente.';
                    } 
                } 
                };
            };
            
            btnDel.onclick = (e) => { 
                e.stopPropagation(); 
                // O CSS esconde o menu; o estilo em linha só existe depois da primeira abertura (antes, o 1º clique não abria).
                const aberto = modalDel.style.display === 'block';
                modalDel.style.display = aberto ? 'none' : 'block';
                btnDel.setAttribute('aria-expanded', String(!aberto));
                if (!aberto) atualizarModalDelete(modalDel, flyout, urlOriginal);
            };
        }

        function validarEstiloLocalizadores(json) {
            let estilo;
            try { estilo = JSON.parse(json); } catch { throw new Error('JSON inválido. A organização atual não foi alterada.'); }
            const proibidos = ['__proto__', 'constructor', 'prototype'];
            if (!estilo || !Array.isArray(estilo.grupos) || !estilo.estrutura ||
                typeof estilo.estrutura !== 'object' || Array.isArray(estilo.estrutura) ||
                estilo.grupos.some(g => typeof g !== 'string' || !g.trim() || g !== g.trim() || g.toLowerCase() === 'sem grupo' || proibidos.includes(g)) ||
                new Set(estilo.grupos).size !== estilo.grupos.length) {
                throw new Error('Estilo inválido: informe grupos únicos e uma estrutura de localizadores.');
            }
            const permitidos = new Set([...estilo.grupos, 'Sem Grupo']);
            const nomes = new Set();
            for (const [grupo, itens] of Object.entries(estilo.estrutura)) {
                if (!permitidos.has(grupo) || !Array.isArray(itens) || itens.some(n => typeof n !== 'string' || !n.trim())) {
                    throw new Error('Estrutura inválida: cada grupo deve conter uma lista de nomes.');
                }
                for (const nome of itens) {
                    if (nomes.has(nome)) throw new Error('Um localizador não pode aparecer em mais de uma posição.');
                    nomes.add(nome);
                }
            }
            for (const grupo of permitidos) {
                if (!Object.hasOwn(estilo.estrutura, grupo)) estilo.estrutura[grupo] = [];
            }
            return { grupos: estilo.grupos, estrutura: estilo.estrutura };
        }

        function reordenarGrupos(grupoMovido, grupoAlvo, antes, flyout, url) { 
            const { grupos, estrutura } = getEstrutura(); 
            const idxMovido = grupos.indexOf(grupoMovido); 
            if (idxMovido > -1) grupos.splice(idxMovido, 1); 
            let idxAlvo = grupos.indexOf(grupoAlvo); 
            if (idxAlvo === -1) { 
                idxAlvo = antes ? 0 : grupos.length; 
            } else if (!antes) { 
                idxAlvo++; 
            } 
            grupos.splice(idxAlvo, 0, grupoMovido); 
            salvarEstrutura(grupos, estrutura); 
            renderizarFlyout(flyout, url); 
        }
        
        function moverItemParaGrupo(nomeItem, grupoDestino, index, flyout, url) { 
            if (!nomeItem) return; 
            const { grupos, estrutura } = getEstrutura(); 
            Object.keys(estrutura).forEach(grp => { 
                estrutura[grp] = estrutura[grp].filter(n => n !== nomeItem); 
            }); 
            if (!estrutura[grupoDestino]) estrutura[grupoDestino] = []; 
            estrutura[grupoDestino].splice(index, 0, nomeItem); 
            salvarEstrutura(grupos, estrutura); 
            renderizarFlyout(flyout, url); 
        }
        
        function moverItemParaPosicao(nomeItem, grupoDestino, targetItemNome, antes, flyout, url) { 
            if (!nomeItem || nomeItem === targetItemNome) return; 
            const { grupos, estrutura } = getEstrutura(); 
            Object.keys(estrutura).forEach(grp => { 
                estrutura[grp] = estrutura[grp].filter(n => n !== nomeItem); 
            }); 
            if (!estrutura[grupoDestino]) estrutura[grupoDestino] = []; 
            let targetIndex = estrutura[grupoDestino].indexOf(targetItemNome); 
            if (targetIndex === -1) { 
                targetIndex = antes ? 0 : estrutura[grupoDestino].length; 
            } else if (!antes) { 
                targetIndex++; 
            } 
            estrutura[grupoDestino].splice(targetIndex, 0, nomeItem); 
            salvarEstrutura(grupos, estrutura); 
            renderizarFlyout(flyout, url); 
        }
        
        function atualizarModalDelete(modalDel, flyout, url) { 
            const { grupos, estrutura } = getEstrutura(); 
            modalDel.innerHTML = '<div class="del-group-title">Excluir grupo</div><div class="del-group-hint">Os localizadores do grupo vão para &quot;Sem Grupo&quot;.</div>';
            if (grupos.length === 0) {
                modalDel.innerHTML += '<div class="del-group-hint">Nenhum grupo criado ainda.</div>';
                return;
            }
            grupos.forEach(grupo => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'del-group-item';
                const nomeEl = document.createElement('span');
                nomeEl.textContent = grupo;
                const xEl = document.createElement('span');
                xEl.setAttribute('aria-hidden', 'true');
                xEl.style.cssText = 'font-weight:bold;font-size:13px';
                xEl.textContent = '×';
                item.append(nomeEl, xEl);
                item.setAttribute('aria-label', `Excluir o grupo ${grupo}`);
                item.onclick = (e) => { 
                    e.stopPropagation(); 
                    const novosGrupos = grupos.filter(g => g !== grupo); 
                    const itensDoGrupo = estrutura[grupo] || []; 
                    estrutura['Sem Grupo'] = [...(estrutura['Sem Grupo'] || []), ...itensDoGrupo]; 
                    delete estrutura[grupo]; 
                    salvarEstrutura(novosGrupos, estrutura); 
                    renderizarFlyout(flyout, url); 
                }; 
                modalDel.appendChild(item); 
            }); 
        }

        function carregarTabelaLocalizadores(urlDestino, flyout, isBackground) {
            fetch(urlDestino).then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.arrayBuffer();
            }).then(buffer => {
                const decoder = new TextDecoder('iso-8859-1'); 
                const html = decoder.decode(buffer); 
                const parser = new DOMParser(); 
                const doc = parser.parseFromString(html, 'text/html'); 
                const linhas = Array.from(doc.querySelectorAll('table.infraTable tr, table[summary*="Localizadores"] tr'));
                
                if (linhas.length > 1) {
                    const novaLista = [];
                    linhas.forEach(tr => { 
                        const tds = tr.querySelectorAll('td'); 
                        if (tds.length >= 2) { 
                            const nomeCompleto = tds[0].textContent.trim(); 
                            const nomeCurto = nomeCompleto.split(/\s+-\s+/)[0].trim(); 
                            const linkElem = tds[1].querySelector('a'); 
                            const qtdTexto = tds[1].textContent.trim(); 
                            const isEmpty = qtdTexto === '0' || !linkElem || !linkElem.href; 
                            novaLista.push({ nomeCompleto, nomeCurto, qtdTexto, link: linkElem ? new URL(linkElem.getAttribute('href'), urlDestino).href : null, isEmpty }); 
                        } 
                    });
                    dadosLocalizadoresCache = novaLista; 
                    setStorage(STORAGE_KEY_CACHE, novaLista); 
                    renderizarFlyout(flyout, urlDestino);
                } else if (!isBackground) { 
                    renderizarFlyout(flyout, urlDestino);
                    avisarFalhaAtualizacao(flyout, 'Não foi possível carregar a lista. A organização foi mantida.');
                }
            }).catch(err => { 
                if (!isBackground) { 
                    renderizarFlyout(flyout, urlDestino);
                    avisarFalhaAtualizacao(flyout, `Erro ao atualizar: ${err.message}`);
                } 
            });
        }

        function avisarFalhaAtualizacao(flyout, mensagem) {
            const aviso = document.createElement('div');
            aviso.setAttribute('role', 'status');
            aviso.style.cssText = 'padding:8px 12px;color:#b02a37;border-bottom:1px solid #dee2e6';
            aviso.textContent = mensagem;
            flyout.prepend(aviso);
        }

        let tentativas = 0;
        let locsIniciado = false;

        function tentar() {
            if (!locsIniciado) {
                const btnOriginal = document.getElementById('btn-meus-localizadores');
                if (btnOriginal) {
                    initQuickLocalizadores();
                    locsIniciado = true;
                }
            }

            tentativas++;
            if (!locsIniciado && tentativas < 25) {
                setTimeout(tentar, 250);
            }
        }

        tentar();
    }
};
