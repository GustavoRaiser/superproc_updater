/**
 * SuperPROC - Módulo: Capa - Processos Relacionados
 * 
 * Funcionalidades:
 * 1. Oculta o bloco volumoso original #divRelacionados da capa.
 * 2. Cria um botão/pílula elegante de status "RELACIONADOS (N)" à direita da linha do cabeçalho
 *    (junto à Classe e Número do Processo, ou na primeira linha).
 * 3. O ícone de Histórico fica incorporado diretamente no início do botão ("do lado do botão principal").
 * 4. Canto com border-radius suave (6px), como nos balões e botões do sistema.
 * 5. O balão flutuante tem dimensionamento livre e compacto (sem barra de rolagem horizontal desnecessária)
 *    e contém um botão "×" pequeno no canto superior para fechamento manual.
 * 6. O balão abre por clique ou hover no botão, e fecha APENAS ao clicar no "×" ou em qualquer outro lugar fora
 *    (sem fechar ao tirar o hover).
 */

import { iniciarCompacto } from './_compacto.js';

const MODULE_ID = 'capa_relacionados';
const STYLE_ID = 'superproc-capa-relacionados-style';
const BTN_ID = 'superproc-btn-relacionados-trigger';
// Atraso (ms) do hover para abrir o balão. Antes: 0 (imediato); agora 300.
const HOVER_DELAY_MS = 300;
let hoverTimer = null;
const BALAO_ID = 'superproc-balao-relacionados';

export default {
    id: MODULE_ID,
    name: 'Capa - Processos Relacionados',
    category: 'Capa do Processo',
    description: 'Compacta os processos relacionados em um botão elegante na linha do cabeçalho com balão flutuante.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init(context = {}) {
        if (window.__superprocCapaRelacionadosInjetado) return;
        window.__superprocCapaRelacionadosInjetado = true;

        // Modo Compacto PRÓPRIO deste módulo (botão no popup): o ícone de histórico some do botão (não ocupa espaço)
        // e o clique no botão abre o histórico; abrir/fechar o balão fica só por conta do hover.
        const compacto = await iniciarCompacto({
            meta: context.meta || { id: MODULE_ID }, storage: context.storage, classe: 'eproc-compacto-relacionados',
            aoMudar: () => { try { aplicarProcessosRelacionados(); } catch (erro) { console.warn('[SuperPROC] Relacionados: falha ao reaplicar o compacto', erro); } }
        });

        function abrirHistoricoNativo() {
            const link = obterLinkHistoricoRelacionados();
            if (!link) return false;
            link.click(); // link NATIVO do eProc: abre o histórico sem reimplementá-lo
            return true;
        }

        function injetarEstilos() {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                /* Oculta o bloco nativo do divRelacionados da página para não ocupar espaço no corpo */
                #divRelacionados.superproc-rel-oculto,
                body.superproc-relacionados-ativo #divRelacionados:not(.superproc-balao-rel-interno) {
                    display: none !important;
                }

                /* Wrapper do botão com cantos arredondados de 6px (consistente com minutas e lembretes) */
                #${BTN_ID} {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 5px !important;
                    height: 24px !important;
                    padding: 0 8px 0 6px !important;
                    font-size: 11px !important;
                    font-weight: 700 !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                    line-height: 1 !important;
                    border-radius: 6px !important;
                    cursor: pointer !important;
                    user-select: none !important;
                    box-sizing: border-box !important;
                    transition: all 0.2s ease !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.03em !important;
                    margin-left: 8px !important;
                    vertical-align: middle !important;
                    outline: none !important;
                }

                #${BTN_ID}.com-relacionados {
                    background: #e0f2fe !important;
                    color: #0369a1 !important;
                    border: 1px solid #7dd3fc !important;
                    box-shadow: 0 1px 2px rgba(2, 132, 199, 0.1) !important;
                }

                #${BTN_ID}.com-relacionados:hover,
                #${BTN_ID}.com-relacionados.aberto {
                    background: #bae6fd !important;
                    color: #0284c7 !important;
                    border-color: #38bdf8 !important;
                    box-shadow: 0 2px 4px rgba(2, 132, 199, 0.15) !important;
                }

                #${BTN_ID}.sem-relacionados {
                    background: #f1f5f9 !important;
                    color: #94a3b8 !important;
                    border: 1px solid #cbd5e1 !important;
                    cursor: default !important;
                }

                /* Modo compacto: o ícone sai do botão; o clique no botão abre o histórico */
                body.eproc-compacto-relacionados #${BTN_ID} .superproc-rel-hist-icon {
                    display: none !important;
                }

                /* Modo compacto: só o símbolo de conexão e o número (sem a palavra e sem a bolinha) */
                body.eproc-compacto-relacionados #${BTN_ID} .superproc-rel-texto {
                    display: none !important;
                }
                body.eproc-compacto-relacionados #${BTN_ID} {
                    gap: 4px !important;
                    padding: 0 7px !important;
                }
                body.eproc-compacto-relacionados #${BTN_ID} .superproc-rel-badge-count,
                body.eproc-compacto-relacionados #${BTN_ID}.com-relacionados:hover .superproc-rel-badge-count,
                body.eproc-compacto-relacionados #${BTN_ID}.com-relacionados.aberto .superproc-rel-badge-count {
                    background: transparent !important;
                    color: inherit !important;
                    min-width: 0 !important;
                    height: auto !important;
                    padding: 0 !important;
                    border-radius: 0 !important;
                    font-size: 12px !important;
                }

                /* Ícone de Histórico integrado no botão */
                #${BTN_ID} .superproc-rel-hist-icon {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 1px 2px !important;
                    margin-right: 2px !important;
                    cursor: pointer !important;
                    border-radius: 3px !important;
                    transition: transform 0.15s ease, background 0.15s ease !important;
                }

                #${BTN_ID} .superproc-rel-hist-icon:hover {
                    transform: scale(1.15) !important;
                    background: rgba(2, 132, 199, 0.15) !important;
                }

                #${BTN_ID} .superproc-rel-hist-icon img {
                    width: 14px !important;
                    height: 14px !important;
                    display: block !important;
                    border: 0 !important;
                }

                #${BTN_ID} svg.superproc-rel-main-icon {
                    width: 13px !important;
                    height: 13px !important;
                    fill: currentColor !important;
                    flex-shrink: 0 !important;
                }

                #${BTN_ID} .superproc-rel-badge-count {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 16px !important;
                    height: 16px !important;
                    padding: 0 4px !important;
                    border-radius: 8px !important;
                    font-size: 10px !important;
                    font-weight: 800 !important;
                    background: #0284c7 !important;
                    color: #ffffff !important;
                    line-height: 1 !important;
                    transition: all 0.2s ease !important;
                }

                #${BTN_ID}.com-relacionados:hover .superproc-rel-badge-count,
                #${BTN_ID}.com-relacionados.aberto .superproc-rel-badge-count {
                    background: #0369a1 !important;
                    color: #ffffff !important;
                }

                /* Balão Flutuante Compacto e Direto */
                #${BALAO_ID} {
                    position: absolute !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
                    padding: 6px 26px 6px 10px !important;
                    z-index: 10060 !important;
                    box-sizing: border-box !important;
                    width: max-content !important;
                    max-width: calc(100vw - 30px) !important;
                    display: none;
                    flex-direction: column !important;
                    pointer-events: auto !important;
                    overflow: visible !important;
                }

                #${BALAO_ID}.aberto {
                    display: inline-flex !important;
                }

                /* Botão 'x' fechar no canto superior */
                .superproc-balao-rel-close {
                    position: absolute !important;
                    top: 4px !important;
                    right: 6px !important;
                    width: 16px !important;
                    height: 16px !important;
                    border-radius: 3px !important;
                    border: none !important;
                    background: transparent !important;
                    color: #94a3b8 !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 14px !important;
                    line-height: 1 !important;
                    font-family: Arial, sans-serif !important;
                    font-weight: 700 !important;
                    cursor: pointer !important;
                    transition: all 0.15s ease !important;
                    padding: 0 !important;
                }

                .superproc-balao-rel-close:hover {
                    background: #f1f5f9 !important;
                    color: #0f172a !important;
                }

                /* Conteúdo Interno da Tabela de Processos */
                .superproc-balao-rel-content {
                    width: max-content !important;
                    overflow: visible !important;
                    box-sizing: border-box !important;
                }

                .superproc-balao-rel-content table {
                    width: max-content !important;
                    border-collapse: collapse !important;
                    font-size: 12px !important;
                    line-height: 1.4 !important;
                    margin: 0 !important;
                }

                .superproc-balao-rel-content tr {
                    border-bottom: 1px solid #f1f5f9 !important;
                }

                .superproc-balao-rel-content tr:last-child {
                    border-bottom: none !important;
                }

                .superproc-balao-rel-content td {
                    padding: 2px 4px !important;
                    vertical-align: middle !important;
                    color: #334155 !important;
                    white-space: nowrap !important;
                    font-size: 12px !important;
                }

                .superproc-balao-rel-content a {
                    color: #0284c7 !important;
                    font-weight: 600 !important;
                    text-decoration: none !important;
                }

                .superproc-balao-rel-content a:hover {
                    text-decoration: underline !important;
                    color: #0369a1 !important;
                }

                /* Botão Verificar Situação */
                .superproc-balao-rel-content button,
                .superproc-balao-rel-content [data-azflow-rel-situacao-btn] {
                    font-size: 11px !important;
                    padding: 1px 6px !important;
                    border-radius: 4px !important;
                    line-height: 1.3 !important;
                }
            `;
            document.head.appendChild(style);
        }

        function reposicionarBalao(balao, btn) {
            if (!balao || !btn || !balao.classList.contains('aberto')) return;

            if (balao.parentNode !== document.body) {
                document.body.appendChild(balao);
            }

            const rectBtn = btn.getBoundingClientRect();
            const topOffset = 5;
            const topPos = rectBtn.bottom + topOffset + window.scrollY;

            // Largura necessária do conteúdo
            const balaoWidth = balao.offsetWidth || 300;
            const margin = 15;

            // Alinha à esquerda do botão por padrão
            let leftPos = rectBtn.left + window.scrollX;
            const maxLeft = window.innerWidth - balaoWidth - margin + window.scrollX;
            const minLeft = margin + window.scrollX;

            if (leftPos > maxLeft) leftPos = maxLeft;
            if (leftPos < minLeft) leftPos = minLeft;

            balao.style.top = `${topPos}px`;
            balao.style.left = `${leftPos}px`;
        }

        function fecharBalao() {
            const balao = document.getElementById(BALAO_ID);
            const btn = document.getElementById(BTN_ID);
            if (balao) {
                balao.classList.remove('aberto');
            }
            if (btn) {
                btn.classList.remove('aberto');
            }
        }

        function abrirBalao() {
            const balao = document.getElementById(BALAO_ID);
            const btn = document.getElementById(BTN_ID);
            if (!balao || !btn || btn.classList.contains('sem-relacionados')) return;

            balao.classList.add('aberto');
            btn.classList.add('aberto');
            reposicionarBalao(balao, btn);
        }

        function obterLinkHistoricoRelacionados() {
            const divRel = document.getElementById('divRelacionados');
            if (!divRel) return null;
            const aHist = divRel.querySelector('a[href*="processos_relacionados_historico"]');
            return aHist;
        }

        function montarOuAtualizarBalao() {
            let balao = document.getElementById(BALAO_ID);
            if (!balao) {
                balao = document.createElement('div');
                balao.id = BALAO_ID;
                document.body.appendChild(balao);
            }

            balao.innerHTML = '';

            // Botão "x" pequeno no canto superior direito
            const btnClose = document.createElement('button');
            btnClose.type = 'button';
            btnClose.className = 'superproc-balao-rel-close';
            btnClose.setAttribute('aria-label', 'Fechar');
            btnClose.title = 'Fechar';
            btnClose.innerHTML = '&times;';
            btnClose.addEventListener('click', (e) => {
                e.stopPropagation();
                fecharBalao();
            });
            balao.appendChild(btnClose);

            // Conteúdo: Tabela de processos relacionados
            const content = document.createElement('div');
            content.className = 'superproc-balao-rel-content';

            const divRel = document.getElementById('divRelacionados');
            const tableRel = divRel ? divRel.querySelector('#tableRelacionado') : null;

            if (tableRel) {
                const tableClone = tableRel.cloneNode(true);
                tableClone.id = 'tableRelacionadoBalao';

                // Mantém os eventos e conexões com o original
                const botoesOriginais = tableRel.querySelectorAll('button, a');
                const botoesClonados = tableClone.querySelectorAll('button, a');
                botoesOriginais.forEach((btnOrig, idx) => {
                    const btnClone = botoesClonados[idx];
                    if (btnClone) {
                        btnClone.addEventListener('click', (e) => {
                            // O link "+ outros" já traz o seu onclick nativo
                            // clonado. Reencaminhá-lo ao elemento oculto o
                            // executava duas vezes e derrubava o balão.
                            const texto = (btnClone.textContent || '').trim();
                            const isExpandirOutros = /^\+?\s*(e\s+)?outros\b/i.test(texto);
                            e.stopPropagation();
                            if (isExpandirOutros) return;

                            if (btnOrig.tagName.toLowerCase() === 'button' || (btnOrig.href && btnOrig.href.includes('javascript:'))) {
                                e.preventDefault();
                                btnOrig.click();
                            }
                        });
                    }
                });

                content.appendChild(tableClone);
            } else {
                content.innerHTML = '<div style="padding: 4px 6px; color: #64748b; font-size: 12px; font-style: italic;">Nenhum processo relacionado encontrado.</div>';
            }

            balao.appendChild(content);
        }

        function aplicarProcessosRelacionados() {
            injetarEstilos();
            document.body.classList.add('superproc-relacionados-ativo');

            const divRel = document.getElementById('divRelacionados');
            const tableRel = divRel ? divRel.querySelector('#tableRelacionado') : null;

            // Contabiliza processos relacionados existentes
            let rows = [];
            if (tableRel) {
                rows = Array.from(tableRel.querySelectorAll('tbody tr')).filter(tr => {
                    const text = (tr.textContent || '').trim();
                    return text.length > 5;
                });
            }

            const qtd = rows.length;

            // Oculta o divRelacionados nativo
            if (divRel) {
                divRel.classList.add('superproc-rel-oculto');
                divRel.style.setProperty('display', 'none', 'important');
            }

            // Se não há divRel e nem processos, limpa elementos se houver
            if (!divRel && qtd === 0) {
                const btnExistente = document.getElementById(BTN_ID);
                if (btnExistente) btnExistente.remove();
                const balaoExistente = document.getElementById(BALAO_ID);
                if (balaoExistente) balaoExistente.remove();
                return;
            }

            // Onde inserir o botão:
            const linhaUnificada = document.getElementById('superproc-capa-linha-unificada');
            const divCapa = document.getElementById('divCapaProcesso');
            const row1 = divCapa ? divCapa.querySelector('.row:first-child') : null;

            let containerAlvo = null;
            if (linhaUnificada) {
                containerAlvo = linhaUnificada;
            } else if (row1) {
                containerAlvo = row1;
            }

            if (!containerAlvo) return;

            let btn = document.getElementById(BTN_ID);
            if (!btn) {
                btn = document.createElement('div');
                btn.id = BTN_ID;
                btn.setAttribute('role', 'button');
                btn.tabIndex = 0;

                // Abre por hover ou por clique
                // Hover com intenção: só abre se o mouse permanecer sobre o botão por HOVER_DELAY_MS (era imediato).
                btn.addEventListener('mouseenter', () => {
                    clearTimeout(hoverTimer);
                    hoverTimer = setTimeout(() => { if (btn.matches(':hover')) abrirBalao(); }, HOVER_DELAY_MS);
                });
                btn.addEventListener('mouseleave', () => clearTimeout(hoverTimer));

                btn.addEventListener('keydown', (e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && compacto.ativo() && abrirHistoricoNativo()) { e.preventDefault(); e.stopPropagation(); }
                });

                btn.addEventListener('click', (e) => {
                    // Se clicou no ícone de histórico, não abre/fecha o popup, deixa a ação do histórico
                    if (e.target.closest('.superproc-rel-hist-icon')) {
                        return;
                    }
                    e.stopPropagation();
                    clearTimeout(hoverTimer);
                    // Compacto: clique = histórico (abrir/fechar o balão já é feito pelo hover)
                    if (compacto.ativo() && abrirHistoricoNativo()) return;
                    const balao = document.getElementById(BALAO_ID);
                    if (balao && balao.classList.contains('aberto')) {
                        fecharBalao();
                    } else {
                        abrirBalao();
                    }
                });
            }

            // Obtém link de histórico para montar o ícone ao lado do botão
            const linkHistOriginal = obterLinkHistoricoRelacionados();
            let htmlHistIcon = '';
            if (linkHistOriginal) {
                const hrefHist = linkHistOriginal.getAttribute('href') || '#';
                const onclickHist = linkHistOriginal.getAttribute('onclick') || '';
                htmlHistIcon = `
                    <span class="superproc-rel-hist-icon" title="Histórico de Processos Relacionados" data-href="${hrefHist}" data-onclick="${onclickHist}">
                        <img src="infra_css/imagens/valores.gif" alt="Histórico" aria-hidden="true">
                    </span>
                `;
            }

            if (qtd > 0) {
                btn.className = 'com-relacionados';
                btn.title = compacto.ativo()
                    ? `${qtd} Processo(s) Relacionado(s) - Passe o mouse para ver; clique para abrir o histórico`
                    : `${qtd} Processo(s) Relacionado(s) - Clique ou passe o mouse para ver`;
                btn.innerHTML = `
                    ${htmlHistIcon}
                    <svg class="superproc-rel-main-icon" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px">
                        <path d="M0 0h24v24H0z" fill="none"/>
                        <path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z"/>
                    </svg>
                    <span class="superproc-rel-texto">Relacionados</span>
                    <span class="superproc-rel-badge-count">${qtd}</span>
                `;
            } else {
                btn.className = 'sem-relacionados';
                btn.title = 'Nenhum processo relacionado';
                btn.innerHTML = `
                    ${htmlHistIcon}
                    <svg class="superproc-rel-main-icon" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px">
                        <path d="M0 0h24v24H0z" fill="none"/>
                        <path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z"/>
                    </svg>
                    <span class="superproc-rel-texto">Sem Relacionados</span>
                `;
            }

            // Conecta clique no ícone de histórico caso o usuário clique diretamente nele
            const histSpan = btn.querySelector('.superproc-rel-hist-icon');
            if (histSpan && linkHistOriginal) {
                histSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    linkHistOriginal.click();
                });
            }

            if (btn.parentNode !== containerAlvo) {
                containerAlvo.appendChild(btn);
            }

            montarOuAtualizarBalao();
        }

        // Evento global para fechar ao clicar fora (ou quando o usuário clica no 'x')
        document.addEventListener('click', (e) => {
            const balao = document.getElementById(BALAO_ID);
            const btn = document.getElementById(BTN_ID);
            if (!balao || !balao.classList.contains('aberto')) return;

            const clickInsideBalao = balao.contains(e.target);
            const clickInsideBtn = btn && btn.contains(e.target);

            // Fecha ao clicar fora de ambos
            if (!clickInsideBalao && !clickInsideBtn) {
                fecharBalao();
            }
        });

        window.addEventListener('resize', () => {
            const balao = document.getElementById(BALAO_ID);
            const btn = document.getElementById(BTN_ID);
            if (balao && btn && balao.classList.contains('aberto')) {
                reposicionarBalao(balao, btn);
            }
        });

        window.addEventListener('scroll', () => {
            const balao = document.getElementById(BALAO_ID);
            const btn = document.getElementById(BTN_ID);
            if (balao && btn && balao.classList.contains('aberto')) {
                reposicionarBalao(balao, btn);
            }
        }, { passive: true });

        // Execução inicial
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', aplicarProcessosRelacionados);
        } else {
            aplicarProcessosRelacionados();
        }

        // Observador para atualizações dinâmicas na capa
        let debounceTimer;
        const observer = new MutationObserver((mutations) => {
            const relevantes = mutations.some(m => {
                if (m.target && m.target.id && (m.target.id === BALAO_ID || m.target.id === BTN_ID)) return false;
                return true;
            });
            if (!relevantes) return;

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                aplicarProcessosRelacionados();
            }, 200);
        });

        const divCapa = document.getElementById('divCapaProcesso') || document.body;
        observer.observe(divCapa, { childList: true, subtree: true });
    }
};
