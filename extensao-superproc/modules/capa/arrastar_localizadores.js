/**
 * SuperPROC - Módulo: Capa - Arrastar Localizadores
 * 
 * Permite clicar e arrastar qualquer localizador para fora da caixa de localizadores
 * para removê-lo imediatamente do processo de forma limpa, suave e com feedback visual instantâneo.
 * 
 * Correções arquiteturais:
 * 1. Previne drag nativo do Chromium (dragstart de links <a> e imagens) que causava o ícone de bloqueio 🚫
 *    e imagem fantasma cinza com texto/link.
 * 2. Bloqueia a criação do interaction-blocker e overlay persistente do script legado AZflow.
 * 3. Fecha automaticamente overlays e executa a remoção ao soltar fora, sem deixar tela vermelha presa.
 */

const MODULE_ID = 'capa_arrastar_localizadores';
const OVERLAY_ID = 'superproc-drag-overlay-localizadores';
const ATTR_CONFIGURED = 'data-superproc-drag-configured';

export default {
    id: MODULE_ID,
    name: 'Capa - Arrastar Localizadores',
    category: 'Capa do Processo',
    description: 'Permite clicar e arrastar qualquer localizador para fora da caixa de localizadores para removê-lo do processo.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init() {
        // Desativa permanentemente os handlers legados do AZflow
        function neutralizarAZflow() {
            try {
                localStorage.setItem('azflowDragDropLocalizadorStatus', 'off');
                if (typeof window.__azflowCancelarDragLocalizadorAtivo === 'function') {
                    window.__azflowCancelarDragLocalizadorAtivo(false);
                }
                const blocker = document.getElementById('azflow-drag-interaction-blocker-localizadores');
                if (blocker) blocker.remove();
                const azOverlay = document.getElementById('azflow-drag-overlay-localizadores');
                if (azOverlay) azOverlay.remove();
            } catch (_) {}
        }
        neutralizarAZflow();

        // Estilos CSS para feedback de arrasto fluido
        function injetarEstilos() {
            if (document.getElementById('superproc-drag-css')) return;
            const style = document.createElement('style');
            style.id = 'superproc-drag-css';
            style.textContent = `
                /* Clone flutuante do localizador durante o arrasto */
                .superproc-dragging-clone {
                    position: fixed !important;
                    z-index: 2147483647 !important;
                    pointer-events: none !important;
                    opacity: 0.95 !important;
                    background-color: #343a40 !important;
                    color: #ffffff !important;
                    border-radius: 6px !important;
                    padding: 6px 14px !important;
                    font-weight: 600 !important;
                    font-size: 13px !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
                    will-change: transform;
                    transition: background-color 0.12s ease, border-color 0.12s ease, transform 0.05s linear;
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    user-select: none !important;
                    cursor: grabbing !important;
                }

                .superproc-dragging-clone.fora-container {
                    background-color: #dc2626 !important;
                    border: 1px solid #ef4444 !important;
                    box-shadow: 0 8px 25px rgba(220, 38, 38, 0.5) !important;
                }

                /* Overlay sutil de confirmação de exclusão */
                #${OVERLAY_ID} {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background-color: rgba(220, 38, 38, 0.12) !important;
                    z-index: 2147483646 !important;
                    pointer-events: none !important;
                    transition: opacity 0.12s ease !important;
                }

                /* Neutralização rígida de elementos intrusivos do AZflow */
                #azflow-drag-overlay-localizadores,
                #azflow-drag-interaction-blocker-localizadores {
                    display: none !important;
                    pointer-events: none !important;
                }

                /* Previne cursor de texto ou bloqueio nos badges */
                #dvLocalizadoresOrgao a[data-superproc-drag-configured],
                .azflow-localizador-barra-fixa[data-superproc-drag-configured] {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    -webkit-user-drag: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        function limparOverlays() {
            const el = document.getElementById(OVERLAY_ID);
            if (el) el.remove();
            const azOverlay = document.getElementById('azflow-drag-overlay-localizadores');
            if (azOverlay) azOverlay.remove();
            const blocker = document.getElementById('azflow-drag-interaction-blocker-localizadores');
            if (blocker) blocker.remove();
            document.body.style.removeProperty('cursor');
        }

        // Remoção confiável do localizador
        function removerLocalizador(linkElement, nomeLocalizador) {
            const nomeLimpo = (nomeLocalizador || '').trim();
            if (!nomeLimpo) return;

            limparOverlays();

            // 1. Tentar API direta de sincronização por nome do AZflow
            if (typeof window.azflowRemoverLocalizadorPorNomeSeguro === 'function') {
                try {
                    window.azflowRemoverLocalizadorPorNomeSeguro(nomeLimpo).catch(() => {
                        tentarRemocaoNativaSelect2(nomeLimpo);
                    });
                    return;
                } catch (_) {}
            }

            // 2. Tentar API geral do AZflow
            if (typeof window.azflowRemoverLocalizador === 'function') {
                try {
                    window.azflowRemoverLocalizador(linkElement, nomeLimpo);
                    return;
                } catch (_) {}
            }

            // 3. Fallback nativo eProc / Select2
            tentarRemocaoNativaSelect2(nomeLimpo);
        }

        // Display inline original das regiões, guardado só quando nós forçamos a abertura do editor.
        let estadoOriginalForcado = null;

        // Assinatura textual da região de visualização: muda quando o eProc a reescreve após salvar.
        function assinaturaRegiaoLocalizadores() {
            const orgao = document.getElementById('dvLocalizadoresOrgao');
            return orgao ? (orgao.textContent || '').replace(/\s+/g, ' ').trim() : '';
        }

        // Devolve a capa ao modo de visualização (forma ativa) se, após o salvamento, o eProc a deixou
        // presa no modo de edição. Só age quando fomos nós a forçar o editor e o estado está de fato preso.
        function restaurarModoVisualizacao(motivo) {
            const original = estadoOriginalForcado;
            estadoOriginalForcado = null;
            if (!original) return;
            const orgao = document.getElementById('dvLocalizadoresOrgao');
            const editor = document.getElementById('dvLocalizadores');
            let corrigiu = false;
            if (orgao && window.getComputedStyle(orgao).display === 'none') {
                orgao.style.display = original.orgao;
                if (window.getComputedStyle(orgao).display === 'none') orgao.style.display = 'block';
                corrigiu = true;
            }
            if (editor && window.getComputedStyle(editor).display !== 'none') {
                editor.style.display = original.editor || 'none';
                corrigiu = true;
            }
            if (corrigiu) {
                console.warn('[SuperPROC] Capa devolvida ao modo de visualização dos localizadores (' + motivo + ').');
            }
            window.dispatchEvent(new CustomEvent('superproc:localizadores-atualizados'));
        }

        // Aguarda o eProc reescrever a região após o Salvar e então garante o retorno à visualização.
        function acompanharSalvamentoLocalizadores(assinaturaAntes) {
            if (!estadoOriginalForcado) return;
            let finalizado = false;
            let debounce = null;
            let limite = null;
            let observador = null;
            const concluir = (motivo) => {
                if (finalizado) return;
                finalizado = true;
                if (observador) observador.disconnect();
                clearTimeout(debounce);
                clearTimeout(limite);
                restaurarModoVisualizacao(motivo);
            };
            observador = new MutationObserver(() => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (assinaturaRegiaoLocalizadores() !== assinaturaAntes) concluir('regiao-reescrita');
                }, 250);
            });
            observador.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
            limite = setTimeout(() => concluir('tempo-esgotado'), 10000);
        }

        function tentarRemocaoNativaSelect2(nomeLimpo) {
            try {
                if (typeof window.azflowRemoverLocalizadorViaSelect2 === 'function') {
                    if (window.azflowRemoverLocalizadorViaSelect2(nomeLimpo, true)) {
                        return;
                    }
                }

                const assinaturaAntes = assinaturaRegiaoLocalizadores();
                const dvLocalizadores = document.getElementById('dvLocalizadores');
                const dvLocalizadoresOrgao = document.getElementById('dvLocalizadoresOrgao');

                if (dvLocalizadores && dvLocalizadores.style.display === 'none') {
                    // Guarda o estado inline original para devolver a região ao modo de visualização
                    // depois de salvar (sem deixar display forçado preso).
                    estadoOriginalForcado = {
                        orgao: dvLocalizadoresOrgao ? dvLocalizadoresOrgao.style.display : '',
                        editor: dvLocalizadores.style.display
                    };
                    if (dvLocalizadoresOrgao) dvLocalizadoresOrgao.style.display = 'none';
                    dvLocalizadores.style.display = 'block';
                }

                const alvo = nomeLimpo.toLowerCase();
                const select2Container = document.getElementById('s2id_selLocalizadoresProcesso');
                let removido = false;

                if (select2Container) {
                    const choices = Array.from(select2Container.querySelectorAll('li.select2-search-choice'));
                    for (const choice of choices) {
                        const divLabel = choice.querySelector('div') || choice;
                        const text = (divLabel.textContent || '').trim().toLowerCase();
                        if (text === alvo) {
                            const closeBtn = choice.querySelector('.select2-search-choice-close, a.select2-search-choice-close');
                            if (closeBtn) {
                                closeBtn.click();
                                removido = true;
                                break;
                            }
                        }
                    }
                }

                if (!removido && window.$ && window.$('#selLocalizadoresProcesso').length) {
                    const $select = window.$('#selLocalizadoresProcesso');
                    const values = $select.val() || [];
                    const newValues = values.filter(v => (v || '').trim().toLowerCase() !== alvo);
                    if (newValues.length !== values.length) {
                        $select.val(newValues).trigger('change');
                        removido = true;
                    }
                }

                const btnSalvar = document.querySelector('#salvar') ||
                    Array.from(document.querySelectorAll('a.infraButton, button.infraButton, a, button'))
                        .find(el => ((el.textContent || '').trim().toLowerCase() === 'salvar'));

                if (btnSalvar) {
                    acompanharSalvamentoLocalizadores(assinaturaAntes);
                    btnSalvar.click();
                } else {
                    restaurarModoVisualizacao('sem-botao-salvar');
                }
            } catch (e) {
                console.error('[SuperPROC] Erro ao remover localizador nativamente:', e);
            }
        }

        // Obtém elementos de localizadores válidos na capa
        function obterBadgesLocalizadores() {
            const dvLocalizadoresOrgao = document.getElementById('dvLocalizadoresOrgao');
            const azflowBarraFixa = document.getElementById('azflow-fixa-localizadores');
            const badges = [];

            function extrairDeContainer(container) {
                if (!container) return;
                const cand = container.querySelectorAll('a, span.azflow-localizador-barra-fixa');
                cand.forEach(el => {
                    const href = el.getAttribute('href') || '';
                    const texto = (el.textContent || '').trim();

                    if (!texto) return;
                    if (href.includes('processo_localizador_historico_listar')) return;
                    if (href.includes('localizador_orgao_tooltip_cadastrar_subform')) return;
                    if (href.includes('duvida.png')) return;
                    if (el.querySelector('img[src*="duvida.png"]')) return;
                    if (el.classList.contains('memoLocalizadorOrgao')) return;
                    if (el.getAttribute('data-azflow-troca-rapida-btn') === '1') return;
                    if (el.closest && el.closest('[data-azflow-troca-rapida-wrap="1"]')) return;

                    const nome = el.getAttribute('data-loc-nome') || texto.replace(/[📌✖️✕×]/g, '').trim();
                    if (nome && nome !== 'Localizador(es):') {
                        badges.push({ element: el, nome: nome });
                    }
                });
            }

            extrairDeContainer(dvLocalizadoresOrgao);
            extrairDeContainer(azflowBarraFixa);

            return badges;
        }

        // Aplica o comportamento de arrasto para os badges
        function aplicarDragDrop() {
            neutralizarAZflow();
            injetarEstilos();

            const badges = obterBadgesLocalizadores();
            const totalLocalizadores = badges.length;
            const temApenasUm = totalLocalizadores === 1;

            badges.forEach(({ element: badge, nome }) => {
                // Abortar controllers legados do AZflow
                if (badge.azflowDragAbortController) {
                    try { badge.azflowDragAbortController.abort(); } catch (_) {}
                    delete badge.azflowDragAbortController;
                }

                if (badge.hasAttribute(ATTR_CONFIGURED)) return;
                badge.setAttribute(ATTR_CONFIGURED, 'true');

                // Desativa o drag nativo do HTML5 no <a> para não gerar a imagem fantasma cinza e ícone 🚫
                badge.setAttribute('draggable', 'false');
                badge.addEventListener('dragstart', (e) => {
                    e.preventDefault();
                    return false;
                });

                const contemBarraInvertida = nome.includes('\\');
                const podeRemover = !temApenasUm && !contemBarraInvertida;

                if (temApenasUm) {
                    badge.title = 'Localizador único - não pode ser removido';
                } else if (contemBarraInvertida) {
                    badge.title = 'Localizador não pode ser removido';
                } else {
                    badge.title = 'Arraste para fora da caixa para remover';
                    badge.style.cursor = 'grab';
                }

                if (!podeRemover) return;

                let isDragging = false;
                let startX = 0;
                let startY = 0;
                const dragThreshold = 5;
                let clone = null;
                let estaFora = false;
                let originalOpacity = badge.style.opacity || '';

                function handleMouseDown(e) {
                    if (e.button !== 0) return; // Apenas botão esquerdo

                    // Previne seleção nativa de texto e início de drag nativo do browser no link <a>
                    e.preventDefault();

                    startX = e.clientX;
                    startY = e.clientY;
                    isDragging = false;
                    estaFora = false;

                    document.addEventListener('mousemove', handleMouseMove, { capture: true });
                    document.addEventListener('mouseup', handleMouseUp, { capture: true });
                    document.addEventListener('keydown', handleKeyDown, { capture: true });
                }

                function handleMouseMove(e) {
                    const deltaX = Math.abs(e.clientX - startX);
                    const deltaY = Math.abs(e.clientY - startY);

                    if (!isDragging && (deltaX > dragThreshold || deltaY > dragThreshold)) {
                        isDragging = true;
                        badge.setAttribute('data-superproc-dragging', 'true');
                        badge.style.opacity = '0.35';
                        document.body.style.setProperty('cursor', 'grabbing', 'important');

                        // Criar elemento clonado flutuante
                        clone = document.createElement('div');
                        clone.className = 'superproc-dragging-clone';
                        clone.innerHTML = `<span>${nome}</span>`;
                        document.body.appendChild(clone);
                    }

                    if (isDragging && clone) {
                        clone.style.transform = `translate3d(${e.clientX - 25}px, ${e.clientY - 14}px, 0)`;

                        // Container de referência
                        const container = document.getElementById('dvLocalizadoresOrgao') || badge.parentElement;
                        let fora = false;

                        if (container) {
                            const rect = container.getBoundingClientRect();
                            // Se saiu dos limites do container com uma margem de folga
                            fora = (
                                e.clientX < (rect.left - 10) ||
                                e.clientX > (rect.right + 10) ||
                                e.clientY < (rect.top - 10) ||
                                e.clientY > (rect.bottom + 10)
                            );
                        } else {
                            const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            fora = dist > 35;
                        }

                        estaFora = fora;

                        let overlay = document.getElementById(OVERLAY_ID);
                        if (estaFora) {
                            clone.classList.add('fora-container');
                            clone.innerHTML = `<span>✕ Solte para remover: <b>${nome}</b></span>`;
                            if (!overlay) {
                                overlay = document.createElement('div');
                                overlay.id = OVERLAY_ID;
                                document.body.appendChild(overlay);
                            }
                        } else {
                            clone.classList.remove('fora-container');
                            clone.innerHTML = `<span>${nome}</span>`;
                            limparOverlays();
                        }
                    }
                }

                function finalizarDrag() {
                    document.removeEventListener('mousemove', handleMouseMove, { capture: true });
                    document.removeEventListener('mouseup', handleMouseUp, { capture: true });
                    document.removeEventListener('keydown', handleKeyDown, { capture: true });

                    if (clone) {
                        clone.remove();
                        clone = null;
                    }
                    limparOverlays();

                    badge.removeAttribute('data-superproc-dragging');
                    badge.style.opacity = originalOpacity;
                }

                function handleMouseUp(e) {
                    if (isDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof e.stopImmediatePropagation === 'function') {
                            e.stopImmediatePropagation();
                        }

                        const foiFora = estaFora;
                        finalizarDrag();

                        if (foiFora) {
                            removerLocalizador(badge, nome);
                        }
                        return;
                    }
                    finalizarDrag();
                }

                function handleKeyDown(e) {
                    if (e.key === 'Escape') {
                        finalizarDrag();
                    }
                }

                badge.addEventListener('mousedown', handleMouseDown);

                // Evitar clique e navegação nativa ao soltar de um arrasto
                badge.addEventListener('click', function(e) {
                    if (isDragging || badge.hasAttribute('data-superproc-dragging')) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof e.stopImmediatePropagation === 'function') {
                            e.stopImmediatePropagation();
                        }
                        isDragging = false;
                    }
                }, true);
            });
        }

        // Executar imediatamente e monitorar alterações na capa do processo
        aplicarDragDrop();

        const observer = new MutationObserver(() => {
            aplicarDragDrop();
        });

        const targetNode = document.getElementById('divCapaProcesso') || document.body;
        observer.observe(targetNode, { childList: true, subtree: true });
    }
};
