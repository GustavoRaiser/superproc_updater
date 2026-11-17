/**
 * SuperPROC - Módulo: Editor - Minutas & Textos Rápidos (Janela flutuante)
 * 
 * Funcionalidades:
 * 1. Adiciona botões "📚 Área de Trabalho (Base)" e "📝 Textos Padrão" na barra do CKEditor.
 * 2. Abre uma janela flutuante da janela principal (por cima de editor, árvore e PDF; ver browser/janela-flutuante.js); sem host, cai numa janela dentro do editor.
 * 3. Fecha suavemente com a tecla ESC ou pelo botão de fechar.
 */

export default {
    id: 'editor_minutas_textos',
    name: 'Editor - Minutas & Textos (Split Screen)',
    category: 'Editor de Minutas',
    description: 'Janela flutuante para consultar Textos Padrão e Minutas Base diretamente sobre o editor.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),

    async init() {
        if (window.__superprocEditorMinutasTextosInjetado) return;
        window.__superprocEditorMinutasTextosInjetado = true;

        const KEY_AREA_TRABALHO = 'eproc_link_area_trabalho';
        const KEY_TEXTO_PADRAO  = 'eproc_link_texto_padrao';

        function capturarLinksSessao() {
            const linkArea = document.querySelector('a[href*="acao=minuta_area_trabalho"]');
            if (linkArea && linkArea.href) {
                localStorage.setItem(KEY_AREA_TRABALHO, linkArea.href);
            }

            const linkTexto = document.querySelector('a[href*="acao=texto_padrao_listar"]');
            if (linkTexto && linkTexto.href) {
                localStorage.setItem(KEY_TEXTO_PADRAO, linkTexto.href);
            }
        }

        function obterLinkAreaTrabalho() {
            capturarLinksSessao();
            return localStorage.getItem(KEY_AREA_TRABALHO);
        }

        function obterLinkTextoPadrao() {
            capturarLinksSessao();
            return localStorage.getItem(KEY_TEXTO_PADRAO);
        }

        function fecharPainelBase() {
            const lateral = document.getElementById('eproc-split-sidebar');
            if (lateral) {
                lateral.remove();
            }

            document.body.style.paddingRight = '';
            document.body.style.boxSizing = '';

            const infoMsg = document.getElementById('infoMessage');
            if (infoMsg) {
                infoMsg.style.width = '';
                infoMsg.style.maxWidth = '';
            }

            window.dispatchEvent(new Event('resize'));
        }

        function emularJanelaNativa(iframe, tituloEsperado) {
            try {
                const innerWin = iframe.contentWindow;
                const innerDoc = iframe.contentDocument || innerWin.document;
                if (!innerDoc || !innerWin) return;

                innerDoc.title = tituloEsperado;

                try {
                    Object.defineProperty(innerWin, 'top', { get: () => innerWin });
                    Object.defineProperty(innerWin, 'parent', { get: () => innerWin });
                    Object.defineProperty(innerWin, 'opener', { get: () => window });

                    innerWin.open = function(url) {
                        if (url) {
                            innerWin.location.href = url;
                        }
                        return innerWin;
                    };
                } catch (e) {}

                if (iframe.name === 'win_texto_padrao_listar' || (innerWin.location && innerWin.location.href.includes('texto_padrao_listar'))) {
                    const styleId = 'eproc-split-tp-clean';
                    if (!innerDoc.getElementById(styleId)) {
                        const styleEl = innerDoc.createElement('style');
                        styleEl.id = styleId;
                        styleEl.textContent = `html:not(:has(#sidebar-wrapper)) .navbar-wrapper { display: none !important; }`;
                        (innerDoc.head || innerDoc.documentElement).appendChild(styleEl);
                    }
                }

                if (iframe.name === 'win_minuta_area_trabalho' || (innerWin.location && innerWin.location.href.includes('minuta_area_trabalho'))) {
                    const styleId = 'eproc-split-minuta-clean';
                    if (!innerDoc.getElementById(styleId)) {
                        const styleEl = innerDoc.createElement('style');
                        styleEl.id = styleId;
                        styleEl.textContent = `
                            html:not(:has(#sidebar-wrapper)) :is(.navbar-wrapper, #divInfraBarraLocalizacao) { display: none !important; }
                        `;
                        (innerDoc.head || innerDoc.documentElement).appendChild(styleEl);
                    }
                }
            } catch (err) {
                console.warn('[SuperPROC: Split] Emulação concluída:', err);
            }
        }

        // No SuperPROC, window.open com estes nomes vira uma janela flutuante da janela principal (por cima de editor,
        // árvore e PDF; ver browser/janela-flutuante.js). Só se a abertura for bloqueada cai na janela dentro do editor.
        let janelaHost = null;
        let janelaHostNome = null;
        function alternarPainelBase(link, tituloNativo, frameName) {
            if (janelaHost && !janelaHost.closed) {
                const mesma = janelaHostNome === frameName;
                try { janelaHost.close(); } catch (_) { /* já fechada */ }
                janelaHost = null;
                if (mesma) return;
            }
            let aberta = null;
            try { aberta = window.open(link, frameName); } catch (_) { /* bloqueada: usa a janela do editor */ }
            if (aberta) { janelaHost = aberta; janelaHostNome = frameName; return; }
            alternarPainelNoEditor(link, tituloNativo, frameName);
        }

        function alternarPainelNoEditor(link, tituloNativo, frameName) {
            const painelExistente = document.getElementById('eproc-split-sidebar');

            if (painelExistente) {
                const iframeAtual = painelExistente.querySelector('iframe');
                if (iframeAtual && iframeAtual.src === link) {
                    fecharPainelBase();
                    return;
                }
                if (iframeAtual) {
                    const rotulo = painelExistente.querySelector('[data-titulo-frame]');
                    if (rotulo) rotulo.textContent = tituloDoFrame(tituloNativo);
                    iframeAtual.name = frameName;
                    iframeAtual.src = link;
                    return;
                }
            }

            const janela = document.createElement('div');
            janela.id = 'eproc-split-sidebar'; // mesmo id de antes: o ESC e o fechamento continuam funcionando
            Object.assign(janela.style, {
                position: 'fixed',
                zIndex: '999999',
                backgroundColor: '#ffffff',
                border: '1px solid #64748b',
                borderRadius: '8px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden'
            });
            aplicarGeometria(janela, geometriaSalva());

            const btnFechar = document.createElement('button');
            btnFechar.title = 'Fechar (ESC)';
            btnFechar.innerHTML = '✕';
            Object.assign(btnFechar.style, {
                width: '22px', height: '22px', borderRadius: '50%', background: '#ef4444', color: '#ffffff',
                border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none'
            });
            btnFechar.onclick = fecharPainelBase;

            const btnMax = document.createElement('button');
            btnMax.title = 'Maximizar / restaurar (duplo clique na barra)';
            btnMax.textContent = '▢';
            Object.assign(btnMax.style, {
                width: '22px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,.35)', cursor: 'pointer', fontSize: '12px', lineHeight: '1', flex: 'none'
            });

            // Barra da janela: arrastar move; duplo clique maximiza/restaura.
            const barra = document.createElement('div');
            Object.assign(barra.style, {
                display: 'flex', alignItems: 'center', gap: '8px', flex: 'none', height: '30px',
                padding: '0 8px 0 12px', background: '#1e3a5f', color: '#fff',
                font: '12px Arial,sans-serif', cursor: 'move', userSelect: 'none'
            });
            const titulo = document.createElement('span');
            titulo.dataset.tituloFrame = '1';
            titulo.textContent = tituloDoFrame(tituloNativo);
            Object.assign(titulo.style, { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
            barra.append(titulo, btnMax, btnFechar);

            let maximizada = null; // geometria anterior, enquanto maximizada
            const alternarMaximizada = () => {
                if (maximizada) { aplicarGeometria(janela, maximizada); maximizada = null; return; }
                maximizada = lerGeometria(janela);
                aplicarGeometria(janela, { x: 8, y: 8, w: window.innerWidth - 16, h: window.innerHeight - 16 });
            };
            btnMax.onclick = alternarMaximizada;
            barra.addEventListener('dblclick', (ev) => { if (!ev.target.closest('button')) alternarMaximizada(); });

            // Arrasto (mover/redimensionar): um escudo transparente cobre a página para o iframe não engolir o mouse.
            const arrastar = (ev, calcular) => {
                if (ev.button !== 0) return;
                ev.preventDefault();
                const inicio = lerGeometria(janela);
                const x0 = ev.clientX, y0 = ev.clientY;
                const escudo = document.createElement('div');
                Object.assign(escudo.style, { position: 'fixed', inset: '0', zIndex: '1000002', cursor: ev.currentTarget.style.cursor });
                document.body.appendChild(escudo);
                const mover = (m) => aplicarGeometria(janela, calcular(inicio, m.clientX - x0, m.clientY - y0));
                const soltar = () => {
                    escudo.remove();
                    window.removeEventListener('mousemove', mover, true);
                    window.removeEventListener('mouseup', soltar, true);
                    if (!maximizada) salvarGeometria(lerGeometria(janela));
                };
                window.addEventListener('mousemove', mover, true);
                window.addEventListener('mouseup', soltar, true);
            };
            barra.addEventListener('mousedown', (ev) => {
                if (ev.target.closest('button') || maximizada) return;
                arrastar(ev, (g, dx, dy) => ({ ...g, x: g.x + dx, y: g.y + dy }));
            });

            // Alças nas bordas e cantos.
            const ALCAS = [
                ['n', 'ns-resize', { top: '-3px', left: '8px', right: '8px', height: '8px' }],
                ['s', 'ns-resize', { bottom: '-3px', left: '8px', right: '8px', height: '8px' }],
                ['w', 'ew-resize', { left: '-3px', top: '8px', bottom: '8px', width: '8px' }],
                ['e', 'ew-resize', { right: '-3px', top: '8px', bottom: '8px', width: '8px' }],
                ['nw', 'nwse-resize', { top: '-3px', left: '-3px', width: '12px', height: '12px' }],
                ['ne', 'nesw-resize', { top: '-3px', right: '-3px', width: '12px', height: '12px' }],
                ['sw', 'nesw-resize', { bottom: '-3px', left: '-3px', width: '12px', height: '12px' }],
                ['se', 'nwse-resize', { bottom: '-3px', right: '-3px', width: '12px', height: '12px' }]
            ];
            const alcas = ALCAS.map(([lado, cursor, pos]) => {
                const alca = document.createElement('div');
                Object.assign(alca.style, { position: 'absolute', zIndex: '1000001', cursor, ...pos });
                alca.addEventListener('mousedown', (ev) => {
                    if (maximizada) return;
                    arrastar(ev, (g, dx, dy) => {
                        let { x, y, w, h } = g;
                        if (lado.includes('e')) w += dx;
                        if (lado.includes('s')) h += dy;
                        if (lado.includes('w')) { x += dx; w -= dx; }
                        if (lado.includes('n')) { y += dy; h -= dy; }
                        return { x, y, w, h };
                    });
                });
                return alca;
            });

            const iframe = document.createElement('iframe');
            iframe.name = frameName;
            iframe.id = frameName;
            iframe.src = link;
            Object.assign(iframe.style, { flex: '1', width: '100%', minHeight: '0', border: 'none' });

            iframe.onload = () => {
                emularJanelaNativa(iframe, tituloNativo);
                setTimeout(() => emularJanelaNativa(iframe, tituloNativo), 500);
            };

            janela.append(barra, iframe, ...alcas);
            document.body.appendChild(janela);
        }

        // Janela flutuante: fica por cima do editor (que mantém a largura total), pode ser movida e redimensionada;
        // posição e tamanho ficam memorizados.
        const KEY_GEOMETRIA = 'superproc_janela_geometria';
        const MIN_W = 360, MIN_H = 240;
        function tituloDoFrame(t) { return t.replace(/^[\s:]+|[\s:]+$/g, '').replace(/^eproc - - /, ''); }
        function limitarGeometria({ x, y, w, h }) {
            w = Math.round(Math.min(Math.max(w, MIN_W), window.innerWidth));
            h = Math.round(Math.min(Math.max(h, MIN_H), window.innerHeight));
            x = Math.round(Math.min(Math.max(x, 0), window.innerWidth - w));
            y = Math.round(Math.min(Math.max(y, 0), window.innerHeight - 30)); // a barra nunca sai da tela
            return { x, y, w, h };
        }
        function geometriaSalva() {
            try {
                const g = JSON.parse(localStorage.getItem(KEY_GEOMETRIA));
                if (g && [g.x, g.y, g.w, g.h].every(Number.isFinite)) return limitarGeometria(g);
            } catch (_) { /* usa o padrão */ }
            const w = Math.min(900, Math.round(window.innerWidth * 0.6)), h = Math.round(window.innerHeight * 0.8);
            return limitarGeometria({ x: window.innerWidth - w - 16, y: 40, w, h });
        }
        function salvarGeometria(g) { try { localStorage.setItem(KEY_GEOMETRIA, JSON.stringify(g)); } catch (_) { /* sem armazenamento */ } }
        function lerGeometria(el) {
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        }
        function aplicarGeometria(el, g) {
            const { x, y, w, h } = limitarGeometria(g);
            Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('eproc-split-sidebar')) {
                fecharPainelBase();
            }
        });

        function criarBotaoToolbar(id, titulo, emoji, onClickHandler) {
            const btn = document.createElement('a');
            btn.id = id;
            btn.className = 'cke_button cke_button_off superproc-editor-split-btn';
            btn.setAttribute('role', 'button');
            btn.setAttribute('tabindex', '-1');
            btn.setAttribute('href', 'javascript:void(0);');
            btn.setAttribute('target', '_self');
            btn.setAttribute('title', titulo);
            btn.setAttribute('aria-label', titulo);
            btn.style.cursor = 'pointer';
            btn.style.userSelect = 'none';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'cke_button_icon';
            iconSpan.style.backgroundImage = 'none';
            iconSpan.style.textAlign = 'center';
            iconSpan.style.fontSize = '14px';
            iconSpan.style.lineHeight = '16px';
            iconSpan.style.display = 'inline-block';
            iconSpan.style.pointerEvents = 'none';
            iconSpan.innerHTML = emoji;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'cke_button_label';
            labelSpan.style.display = 'none';
            labelSpan.style.pointerEvents = 'none';
            labelSpan.textContent = titulo;

            btn.appendChild(iconSpan);
            btn.appendChild(labelSpan);

            const dispararAcao = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
                onClickHandler();
                return false;
            };

            const travar = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
                return false;
            };

            btn.addEventListener('click', dispararAcao, true);
            btn.addEventListener('click', dispararAcao, false);
            btn.onclick = dispararAcao;

            btn.addEventListener('mousedown', travar, true);
            btn.addEventListener('mousedown', travar, false);
            btn.addEventListener('mouseup', travar, true);
            btn.addEventListener('mouseup', travar, false);
            btn.addEventListener('pointerdown', travar, true);
            btn.addEventListener('pointerup', travar, true);

            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    dispararAcao(e);
                } else {
                    e.stopPropagation();
                }
            }, true);

            return btn;
        }

        function injetarFerramentas() {
            capturarLinksSessao();
            if (!window.location.href.includes('minuta_editar')) return;

            const btnBaseRef = document.querySelector('.cke_button__inserirtextobase');
            const linkTrabalho = obterLinkAreaTrabalho();

            if (btnBaseRef && linkTrabalho && !btnBaseRef.dataset.superprocSplitInterceptado) {
                btnBaseRef.dataset.superprocSplitInterceptado = 'true';
                const dispararBaseNativo = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alternarPainelBase(linkTrabalho, ':: eproc - - Minuta Área de Trabalho ::', 'win_minuta_area_trabalho');
                    return false;
                };
                btnBaseRef.addEventListener('click', dispararBaseNativo, true);
                btnBaseRef.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            }

            if (btnBaseRef && linkTrabalho && !document.getElementById('az-btn-base-container')) {
                const novoBtn = criarBotaoToolbar(
                    'az-btn-base-container',
                    'Abrir/Fechar Área de Trabalho (Base)',
                    '📚',
                    () => alternarPainelBase(linkTrabalho, ':: eproc - - Minuta Área de Trabalho ::', 'win_minuta_area_trabalho')
                );
                btnBaseRef.parentNode.insertBefore(novoBtn, btnBaseRef.nextSibling);
            }

            const linkTextoPadrao = obterLinkTextoPadrao();
            const baseAncoragem = document.getElementById('az-btn-base-container') || btnBaseRef;
            if (baseAncoragem && linkTextoPadrao && !document.getElementById('az-btn-texto-padrao-container')) {
                const btnTextoPadrao = criarBotaoToolbar(
                    'az-btn-texto-padrao-container',
                    'Abrir/Fechar Textos Padrão (Modelos)',
                    '📝',
                    () => alternarPainelBase(linkTextoPadrao, ':: eproc - - Textos Padrão ::', 'win_texto_padrao_listar')
                );
                baseAncoragem.parentNode.insertBefore(btnTextoPadrao, baseAncoragem.nextSibling);
            }
        }

        injetarFerramentas();
        const obs = new MutationObserver(injetarFerramentas);
        obs.observe(document.body, { childList: true, subtree: true });
    }
};