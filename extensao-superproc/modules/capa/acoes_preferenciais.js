/**
 * SuperPROC - Módulo: Capa - Ações Preferenciais
 *
 * Reorganiza o sistema de ações preferenciais (Minutas, Movimentações, Intimações,
 * Automatizações): sanfonas (auto/click/fixo), tags de categoria e opções de minutas.
 * Autônomo: funciona com ou sem o módulo da Barra de Botões.
 *
 * Modo Compacto próprio (ligado no popup da extensão): oculta o menu principal de
 * preferências e coloca botões rápidos (Min./Mov./Int./Aut.) na capa, ao lado da barra.
 */
import { iniciarCompacto } from './_compacto.js';

export default {
    id: 'capa_acoes_preferenciais',
    name: 'Capa - Ações Preferenciais',
    category: 'Capa do Processo',
    description: 'Sanfonas e tags das ações preferenciais (Minutas, Movimentações, Intimações, Automatizações). Modo compacto: botões rápidos na capa.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init({ meta, storage } = {}) {
        if (window.__superprocCapaAcoesInjetado) return;
        window.__superprocCapaAcoesInjetado = true;
        let reaplicarCompacto = null;
        const compacto = await iniciarCompacto({
            meta: meta || { id: 'capa_acoes_preferenciais' }, storage, classe: 'eproc-compacto-acoes',
            aoMudar: () => { if (typeof reaplicarCompacto === 'function') reaplicarCompacto(); }
        });

        function executar() {
            const juizContainer = document.querySelector('div[aria-label="Juiz(a)"]');
            const prefNav = document.getElementById('nav-acoes-processo');

            if (!document.getElementById('superproc-capa-acoes-preferenciais-style')) {
                const style = document.createElement('style');
                style.id = 'superproc-capa-acoes-preferenciais-style';
                style.innerHTML = `
                /* --- HOVER RÁPIDO --- */
                #quick-hover-container { display: none; align-items: stretch !important; gap: 0 !important; margin-left: 0px !important; vertical-align: middle !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; background: #ffffff !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; height: 31px !important; box-sizing: border-box !important; }
                .quick-hover-btn { position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0 5px !important; background: #ffffff !important; border: none !important; border-right: 1px solid #e2e8f0 !important; border-radius: 0 !important; font-size: 13px !important; font-weight: bold !important; cursor: pointer !important; transition: background 0.2s !important; box-sizing: border-box !important; height: 100% !important; }
                #quick-hover-container .quick-hover-btn:first-child { border-top-left-radius: 6px !important; border-bottom-left-radius: 6px !important; padding-left: 10px !important; }
                #quick-hover-container .quick-hover-btn:last-child { border-right: none !important; border-top-right-radius: 6px !important; border-bottom-right-radius: 6px !important; padding-right: 10px !important; }
                .quick-hover-btn:hover { background-color: #f1f5f9 !important; }
                .quick-btn-minuta { color: #007bff !important; } .quick-btn-movimentacao { color: #28a745 !important; } .quick-btn-intimacao { color: #dc3545 !important; } .quick-btn-automatizacao { color: #673ab7 !important; }
                
                .quick-sub-dropdown { position: absolute !important; top: calc(100% + 1px) !important; left: 50% !important; transform: translateX(-50%) !important; background: #ffffff !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; display: none; flex-direction: row !important; gap: 6px !important; padding: 8px !important; z-index: 10001 !important; }
                .quick-sub-item { min-width: 110px !important; display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 6px 10px !important; border: 1px dashed #ced4da !important; border-radius: 4px !important; font-size: 11px !important; font-weight: bold !important; cursor: pointer !important; transition: all 0.2s ease !important; color: #555 !important; }
                .quick-sub-item.color-minuta { border-color: #cce5ff !important; background-color: #f7faff !important; color: #007bff !important; } .quick-sub-item.color-minuta:hover { background-color: #e6f2ff !important; border-color: #99caff !important; color: #0056b3 !important; }
                .quick-sub-item.color-movimentacao { border-color: #d4edda !important; background-color: #f8fdf9 !important; color: #28a745 !important; } .quick-sub-item.color-movimentacao:hover { background-color: #d4edda !important; border-color: #a3d7b4 !important; color: #1e7e34 !important; }
                .quick-sub-item.color-intimacao { border-color: #f8d7da !important; background-color: #fff9f9 !important; color: #dc3545 !important; } .quick-sub-item.color-intimacao:hover { background-color: #f8d7da !important; border-color: #f1b0b7 !important; color: #bd2130 !important; }
                .quick-sub-item.color-automatizacao { border-color: #e2d9f3 !important; background-color: #fdfbff !important; color: #673ab7 !important; } .quick-sub-item.color-automatizacao:hover { background-color: #e2d9f3 !important; border-color: #cbbbed !important; color: #512da8 !important; }

                /* --- PAINEL FLUTUANTE --- */
                .eproc-painel-horizontal { position: fixed !important; top: 15vh !important; left: 2.5vw !important; width: 95vw !important; height: auto !important; max-height: 70vh !important; background-color: rgba(242, 248, 255, 0.95) !important; border: 2px solid #0284c7 !important; border-radius: 8px !important; box-shadow: 0 4px 14px rgba(0,0,0,0.2) !important; z-index: 999999 !important; overflow-y: auto !important; padding: 4px 8px 4px 4px !important; box-sizing: border-box !important; display: none; text-align: left !important; backdrop-filter: blur(2px) !important; }
                /* Conteúdo em colunas contínuas (preenche de cima para baixo) e sem recuo/margens: mais itens por linha. Listas aninhadas viram blocos simples (antes eram grades dentro de grades). */
                #eproc-painel-conteudo-clonado { width: 100% !important; box-sizing: border-box !important; column-count: 2 !important; column-width: auto !important; column-gap: 32px !important; column-fill: balance !important; text-align: left !important; }
                #eproc-painel-conteudo-clonado * { margin: 0 !important; padding-left: 0 !important; padding-right: 0 !important; text-indent: 0 !important; box-sizing: border-box !important; float: none !important; max-width: none !important; min-width: 0 !important; flex: none !important; white-space: normal !important; }
                #eproc-painel-conteudo-clonado ul, #eproc-painel-conteudo-clonado ol, #eproc-painel-conteudo-clonado div, #eproc-painel-conteudo-clonado fieldset { display: block !important; width: auto !important; padding-top: 0 !important; padding-bottom: 0 !important; border: none !important; }
                #eproc-painel-conteudo-clonado hr, #eproc-painel-conteudo-clonado li:empty, #eproc-painel-conteudo-clonado div:empty { display: none !important; }
                #eproc-painel-conteudo-clonado li { list-style: none !important; padding-top: 1px !important; padding-bottom: 1px !important; font-size: 13px !important; line-height: 1.25 !important; width: auto !important; display: block !important; }
                #eproc-painel-conteudo-clonado li:not(:has(ul, ol)) { break-inside: avoid !important; }
                #eproc-painel-conteudo-clonado li:has(> ul, > ol) > a { break-after: avoid !important; }
                #eproc-painel-conteudo-clonado button, #eproc-painel-conteudo-clonado svg, #eproc-painel-conteudo-clonado .lucide { display: none !important; }
                #eproc-painel-conteudo-clonado a.content-link { display: block !important; width: auto !important; padding: 0 !important; }
                #eproc-painel-horizontal .custom-accordion-content, #eproc-painel-horizontal [class*="content"] { position: static !important; top: auto !important; bottom: auto !important; opacity: 1 !important; visibility: visible !important; max-height: none !important; box-shadow: none !important; border: none !important; background: transparent !important; }

                .custom-collapse-wrapper { margin-top: 4px !important; text-align: center !important; font-size: 11px !important; color: #6c757d !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 5px !important; }
                .custom-collapse-wrapper input[type="checkbox"] { cursor: pointer !important; margin: 0 !important; }
                .custom-collapse-wrapper label { cursor: pointer !important; margin: 0 !important; font-style: italic !important; }

                #div-acoes-preferenciais { background: #ffffff !important; border: 1px solid #d5d5d5 !important; border-radius: 6px !important; padding: 10px 14px !important; margin-top: 10px !important; margin-bottom: 8px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }
                /* A legenda nativa das preferências (título + engrenagem/dropdown "Configurações") é substituída pelas
                   tags da barra unificada e pelo checkbox "Sempre aberto ao iniciar" dos balões. Regra migrada de
                   lembretes_minutas.js: só vale com este módulo ativo. */
                #div-acoes-preferenciais legend, #div-acoes-preferenciais legend .dropdown.btn-group { display: none !important; }
                .unified-pref-header-bar { display: flex !important; align-items: center !important; gap: 12px !important; margin-bottom: 0 !important; padding-bottom: 6px !important; border-bottom: 1px solid #edf2f7 !important; font-weight: bold !important; font-size: 13px !important; }
                .unified-pref-header-bar:empty { display: none !important; }
                .pref-tag-minuta { color: #007bff !important; } .pref-tag-movimentacao { color: #28a745 !important; } .pref-tag-intimacao { color: #dc3545 !important; } .pref-tag-automatizacao { color: #673ab7 !important; }
                #div-acoes-preferenciais div[id^="div-preferencia-"] { display: flex !important; flex-direction: column !important; gap: 6px !important; margin: 0 !important; padding: 0 !important; }
                #div-acoes-preferenciais fieldset.infraFieldset { margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; }
                
                .custom-accordion { position: relative !important; display: block !important; border: 1px dashed #ced4da !important; border-radius: 4px !important; margin: 0 !important; transition: border-color 0.2s !important; background-color: #fafbfc !important; box-sizing: border-box !important; }
                .custom-accordion.escondido, div[data-sanfona-aplicada="vazia"] { display: none !important; margin: 0 !important; padding: 0 !important; }
                .custom-accordion[data-category="minuta"] { border-color: #cce5ff !important; background-color: #f7faff !important; }
                .custom-accordion[data-category="movimentacao"] { border-color: #d4edda !important; background-color: #f8fdf9 !important; }
                .custom-accordion[data-category="intimacao"] { border-color: #f8d7da !important; background-color: #fff9f9 !important; }
                .custom-accordion[data-category="automatizacao"] { border-color: #e2d9f3 !important; background-color: #fdfbff !important; }

                .custom-accordion-header { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 5px 10px !important; color: #555 !important; font-size: 11px !important; font-weight: bold !important; text-transform: uppercase !important; user-select: none !important; }
                .custom-accordion[data-mode="click"] .custom-accordion-header { cursor: pointer !important; }
                .custom-accordion:hover .custom-accordion-header { color: #222 !important; }
                .accordion-title { display: flex !important; align-items: center !important; }
                .accordion-arrow { display: inline-block !important; transition: transform 0.2s ease !important; margin-left: 6px !important; font-size: 10px !important; }

                .btn-accordion-mode { background: rgba(255, 255, 255, 0.75) !important; border: 1px solid rgba(206, 212, 218, 0.8) !important; border-radius: 12px !important; padding: 2px 8px !important; font-size: 9px !important; font-weight: bold !important; color: rgba(73, 80, 87, 0.85) !important; cursor: pointer !important; outline: none !important; transition: all 0.2s !important; }
                .btn-accordion-mode:hover { background: rgba(226, 230, 234, 0.9) !important; color: rgba(33, 37, 41, 1) !important; }

                .custom-accordion-content { display: block !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
                .custom-accordion[data-mode="auto"] .custom-accordion-content { display: block !important; position: absolute !important; left: -9999px !important; top: auto !important; width: 1px !important; height: 1px !important; overflow: hidden !important; opacity: 0 !important; pointer-events: none !important; }
                .custom-accordion[data-mode="auto"].is-active-auto .custom-accordion-content { position: absolute !important; top: 100% !important; left: 0 !important; right: auto !important; width: auto !important; height: auto !important; opacity: 1 !important; z-index: 2147483647 !important; background: #ffffff !important; border: 1px solid #ced4da !important; border-top: none !important; border-radius: 0 0 6px 6px !important; box-shadow: 0 8px 16px rgba(0,0,0,0.12) !important; overflow-y: auto !important; pointer-events: auto !important; }
                .custom-accordion[data-mode="click"] .custom-accordion-content { max-height: 0 !important; transition: max-height 0.25s ease-out, padding 0.25s ease-out !important; }
                .custom-accordion[data-mode="click"].is-open .custom-accordion-content { max-height: 500px !important; padding: 6px 10px !important; }
                .custom-accordion[data-mode="click"].is-open .accordion-arrow { transform: rotate(180deg) !important; }
                .custom-accordion[data-mode="fixo"] .custom-accordion-content { max-height: 500px !important; padding: 4px 8px !important; }
                .custom-accordion[data-mode="fixo"] .accordion-arrow { transform: rotate(180deg) !important; }
                `;
                document.head.appendChild(style);
            }

            function addCheckboxesToPreferences() {
                if (!prefNav) return;
                const lis = prefNav.querySelectorAll('ul li');

                lis.forEach(li => {
                    const btnToggle = li.querySelector('[id^="btn-preferencias-"]');
                    if (!btnToggle) return;

                    let key = ''; let targetId = ''; let switchId = '';

                    if (btnToggle.id.includes('minutas')) { key = 'minuta'; targetId = 'div-preferencia-minuta'; switchId = 'switch-preferencia-minuta-collapse'; }
                    else if (btnToggle.id.includes('movimentacao')) { key = 'movimentacao'; targetId = 'div-preferencia-movimentacao'; switchId = 'switch-preferencia-movimentacao-collapse'; }
                    else if (btnToggle.id.includes('intimacao')) { key = 'intimacao'; targetId = 'div-preferencia-intimacao'; switchId = 'switch-preferencia-intimacao-collapse'; }
                    else if (btnToggle.id.includes('automatizar')) {
                        key = 'automatizacao'; targetId = 'div-preferencia-automatizacao'; switchId = 'switch-preferencia-automatizacao-collapse';
                        btnToggle.setAttribute('href', `#${targetId}`);
                        if (btnToggle.hasAttribute('onclick')) {
                            const oldOnClick = btnToggle.getAttribute('onclick');
                            btnToggle.setAttribute('onclick', `${oldOnClick} if(typeof jQuery !== 'undefined') jQuery('#${targetId}').collapse('toggle');`);
                        }
                    }

                    if (!key || li.querySelector('.custom-collapse-wrapper')) return;

                    const wrapper = document.createElement('div');
                    wrapper.className = 'custom-collapse-wrapper';

                    const chk = document.createElement('input');
                    chk.type = 'checkbox';
                    chk.id = `chk-custom-collapse-${key}`;
                    chk.dataset.target = targetId;
                    chk.dataset.switch = switchId;

                    const lbl = document.createElement('label');
                    lbl.htmlFor = chk.id;
                    lbl.textContent = 'Sempre aberto ao iniciar';

                    wrapper.appendChild(chk); wrapper.appendChild(lbl); li.appendChild(wrapper);

                    chk.addEventListener('change', (e) => {
                        const sId = e.target.dataset.switch;
                        const realSwitch = document.getElementById(sId) || document.querySelector(`input[data-target="${e.target.dataset.target}"]`);
                        if (realSwitch && realSwitch.checked !== e.target.checked) realSwitch.click();
                    });
                });
            }
            addCheckboxesToPreferences();

            const containerHover = document.createElement('div');
            containerHover.id = 'quick-hover-container';

            // Ancoragem: depois da barra de botões (se existir), senão logo após o Juiz(a).
            const barraExistente = document.querySelector('.botoes-flutuantes-container');
            const wrapBotoesMin = document.getElementById('superproc-min-botoes-wrap');
            if (wrapBotoesMin) {
                if (barraExistente && barraExistente.parentNode === wrapBotoesMin) wrapBotoesMin.insertBefore(containerHover, barraExistente.nextSibling);
                else wrapBotoesMin.appendChild(containerHover);
            } else if (barraExistente && barraExistente.parentNode) {
                barraExistente.parentNode.insertBefore(containerHover, barraExistente.nextSibling);
            } else if (juizContainer) {
                juizContainer.parentNode.style.display = 'flex';
                juizContainer.parentNode.style.alignItems = 'center';
                juizContainer.parentNode.style.flexWrap = 'wrap';
                juizContainer.parentNode.insertBefore(containerHover, juizContainer.nextSibling);
            }

            // Modo compacto das ações: esconde o menu principal de preferências e mostra os botões rápidos na capa.
            function atualizarDesignCompacto() {
                const prefMain = document.getElementById('div-acoes-preferenciais');
                if (compacto.ativo()) {
                    if (prefMain) prefMain.style.setProperty('display', 'none', 'important');
                } else {
                    containerHover.style.display = 'none';
                    if (prefMain && prefMain.dataset.hasVisibleContent === 'true') {
                        prefMain.style.removeProperty('display');
                    }
                }
            }
            atualizarDesignCompacto();

            function criarPainelHorizontal() {
                const painel = document.createElement('div');
                painel.id = 'eproc-painel-horizontal'; painel.className = 'eproc-painel-horizontal';
                document.body.appendChild(painel);
                document.addEventListener('click', (e) => { if (!painel.contains(e.target) && !e.target.closest('.quick-sub-item')) painel.style.display = 'none'; });
                window.addEventListener('resize', () => { if (painel.style.display === 'block') ajustarColunasPainel(painel); });
                return painel;
            }

            // Quantidade de colunas do painel, calculada pelo espaço real e pela largura real dos itens:
            //  - largura de uma coluna = largura do item "típico" (percentil 85 das larguras naturais, entre 180 e 460 px);
            //    itens mais longos que isso quebram de linha dentro da coluna em vez de forçar colunas mais largas;
            //  - só cria outra coluna quando ainda sobra essa largura (mais o espaço entre colunas, 32 px);
            //  - no máximo 4 colunas e no mínimo ~8 linhas por coluna (listas curtas ficam em 2; menos de 6 itens, em 1).
            const PAINEL_COL_MIN = 180, PAINEL_COL_MAX = 460, PAINEL_COL_GAP = 32, PAINEL_MAX_COLUNAS = 4, PAINEL_MIN_LINHAS = 8;
            function ajustarColunasPainel(painel) {
                const area = painel && painel.querySelector('#eproc-painel-conteudo-clonado');
                if (!area) return;
                let itens = Array.from(area.querySelectorAll('a.content-link')).filter(el => !el.querySelector('a.content-link'));
                if (!itens.length) itens = Array.from(area.querySelectorAll('li')).filter(el => !el.querySelector('ul, ol'));
                const n = itens.length;
                if (n < 6) { area.style.setProperty('column-count', '1', 'important'); return; }
                area.style.setProperty('column-count', '1', 'important');
                const larguras = itens.map(el => {
                    el.style.setProperty('display', 'inline-block', 'important');
                    el.style.setProperty('white-space', 'nowrap', 'important');
                    const w = el.getBoundingClientRect().width;
                    el.style.removeProperty('display'); el.style.removeProperty('white-space');
                    return w;
                }).sort((a, b) => a - b);
                const tipico = larguras[Math.min(n - 1, Math.floor(0.85 * (n - 1)))] + 8;
                const larguraColuna = Math.max(PAINEL_COL_MIN, Math.min(PAINEL_COL_MAX, tipico));
                const disponivel = area.clientWidth;
                const porLargura = Math.floor((disponivel + PAINEL_COL_GAP) / (larguraColuna + PAINEL_COL_GAP));
                const porLinhas = Math.max(2, Math.floor(n / PAINEL_MIN_LINHAS));
                const colunas = Math.max(1, Math.min(PAINEL_MAX_COLUNAS, porLargura, porLinhas));
                area.style.setProperty('column-count', String(colunas), 'important');
                painel.dataset.colunas = String(colunas);
            }

            function abrirPainelDoAcordeao(pref, subNome, accordionElement) {
                const painel = document.getElementById('eproc-painel-horizontal') || criarPainelHorizontal();
                const conteudoReal = accordionElement.querySelector('.custom-accordion-content');
                const nomesCheios = { 'minuta': 'Minutas', 'movimentacao': 'Movimentações', 'intimacao': 'Intimações', 'automatizacao': 'Automatizações' };
                const fullTitle = nomesCheios[pref.id] || pref.label;
                const bordasTematicas = { 'minuta': '#007bff', 'movimentacao': '#28a745', 'intimacao': '#dc3545', 'automatizacao': '#673ab7' };
                const corBorda = bordasTematicas[pref.id] || '#0284c7';
                painel.style.borderColor = corBorda;

                // Painel compacto: sem cabeçalho de título (o nome fica como dica/aria-label); o X fica sobreposto ao conteúdo (não ocupa espaço).
                painel.title = `${fullTitle} - ${subNome}`;
                painel.setAttribute('aria-label', painel.title);
                painel.innerHTML = `
                    <div id="eproc-painel-conteudo-clonado"></div>
                    <button id="btn-fechar-painel-eproc" title="Fechar" aria-label="Fechar" style="position:absolute; top:4px; right:6px; z-index:2; cursor:pointer; background:#ef4444; color:white; border:none; border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.4; font-weight:bold;">✕</button>
                `;

                if (conteudoReal) {
                    const clone = conteudoReal.cloneNode(true);
                    clone.querySelectorAll('button, svg, .lucide').forEach(el => el.remove());
                    clone.style.cssText = 'display: block !important; position: static !important; opacity: 1 !important; visibility: visible !important; width: 100% !important; height: auto !important; max-height: none !important;';
                    painel.querySelector('#eproc-painel-conteudo-clonado').innerHTML = clone.innerHTML;
                } else {
                    painel.querySelector('#eproc-painel-conteudo-clonado').innerHTML = '<div style="color:#666;">Nenhum conteúdo disponível.</div>';
                }

                painel.querySelector('#btn-fechar-painel-eproc').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); painel.style.display = 'none'; });
                painel.querySelectorAll('a').forEach(link => { link.addEventListener('click', () => { painel.style.display = 'none'; }); });
                document.querySelectorAll('.quick-sub-dropdown').forEach(d => d.style.display = 'none');
                if (!document.body.contains(painel)) document.body.appendChild(painel);
                painel.style.display = 'block'; painel.style.visibility = 'visible';
                // Ancora logo abaixo dos botões rápidos (em vez de flutuar a 15% da altura da tela).
                const ancora = document.getElementById('quick-hover-container');
                if (ancora && ancora.offsetParent !== null) painel.style.setProperty('top', Math.round(ancora.getBoundingClientRect().bottom + 6) + 'px', 'important');
                else painel.style.removeProperty('top');
                ajustarColunasPainel(painel);
            }

            function renderHoverRápido() {
                if (!compacto.ativo()) { containerHover.style.display = 'none'; return; }
                let temBotaoAtivo = false;
                const basePrefs = [
                    { id: 'minuta', divId: 'div-preferencia-minuta', label: 'Min.', cls: 'quick-btn-minuta', corCls: 'color-minuta' },
                    { id: 'movimentacao', divId: 'div-preferencia-movimentacao', label: 'Mov.', cls: 'quick-btn-movimentacao', corCls: 'color-movimentacao' },
                    { id: 'intimacao', divId: 'div-preferencia-intimacao', label: 'Int.', cls: 'quick-btn-intimacao', corCls: 'color-intimacao' },
                    { id: 'automatizacao', divId: 'div-preferencia-automatizacao', label: 'Aut.', cls: 'quick-btn-automatizacao', corCls: 'color-automatizacao' }
                ];

                basePrefs.forEach(pref => {
                    const divNativa = document.getElementById(pref.divId);
                    const isActiveNative = divNativa && divNativa.classList.contains('show');
                    const accordions = document.querySelectorAll(`.custom-accordion[data-category="${pref.id}"]:not(.escondido)`);
                    let btnExistente = document.getElementById(`quick-hover-${pref.id}`);

                    if (isActiveNative && accordions.length > 0) {
                        temBotaoAtivo = true;
                        if (!btnExistente) {
                            const btn = document.createElement('div');
                            btn.id = `quick-hover-${pref.id}`; btn.className = `quick-hover-btn ${pref.cls}`; btn.innerHTML = `${pref.label} ▾`;
                            const subMenu = document.createElement('div'); subMenu.className = 'quick-sub-dropdown';

                            accordions.forEach(acc => {
                                const titleEl = acc.querySelector('.accordion-title span');
                                let subNome = titleEl ? titleEl.textContent.trim() : 'OPÇÕES';
                                if (subNome.toUpperCase().includes('UNIDADE')) subNome = 'UNIDADE';
                                else if (subNome.toUpperCase().includes('OCULTAS')) subNome = 'OCULTAS';

                                const subBtn = document.createElement('div'); subBtn.className = `quick-sub-item ${pref.corCls}`; subBtn.textContent = `${subNome} ▾`;
                                let subHoverTimer;
                                subBtn.addEventListener('mouseenter', () => { subHoverTimer = setTimeout(() => { abrirPainelDoAcordeao(pref, subNome, acc, subBtn); }, 200); });
                                subBtn.addEventListener('mouseleave', () => clearTimeout(subHoverTimer));
                                subBtn.addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(subHoverTimer); abrirPainelDoAcordeao(pref, subNome, acc, subBtn); });
                                subMenu.appendChild(subBtn);
                            });

                            btn.appendChild(subMenu); containerHover.appendChild(btn);
                            let mainHoverTimer;
                            btn.addEventListener('mouseenter', () => { mainHoverTimer = setTimeout(() => { document.querySelectorAll('.quick-sub-dropdown').forEach(d => d.style.display = 'none'); subMenu.style.display = 'flex'; }, 400); });
                            btn.addEventListener('mouseleave', () => clearTimeout(mainHoverTimer));
                            subMenu.addEventListener('mouseleave', () => subMenu.style.display = 'none');
                        }
                    } else if (btnExistente) {
                        btnExistente.remove();
                    }
                });
                containerHover.style.display = temBotaoAtivo ? 'inline-flex' : 'none';
            }
            function moverOpcoesMinutas() {
                if (document.getElementById('gm-opcoes-minutas')) return;

                const chkManter = document.getElementById('chkMinutasAbertas');
                const conteudoInterno = document.querySelector('[id^="conteudoInternoMinutas_"]');
                if (!chkManter || !conteudoInterno) return;

                const container = document.createElement('div');
                container.id = 'gm-opcoes-minutas';

                let atual = chkManter;
                while (atual) {
                    const proximo = atual.nextSibling;
                    container.appendChild(atual);
                    if (atual.nodeType === 1 && atual.id === 'carregandoMinutasRodape') break;
                    atual = proximo;
                }
                conteudoInterno.appendChild(container);
            }

            function otimizarListasPreferencia() {
                const mainBox = document.getElementById('div-acoes-preferenciais');
                if (!mainBox) return;

                let headerBar = mainBox.querySelector('.unified-pref-header-bar');
                if (!headerBar) { headerBar = document.createElement('div'); headerBar.className = 'unified-pref-header-bar'; mainBox.insertBefore(headerBar, mainBox.firstChild); }

                const categories = [
                    { key: 'minuta', name: 'Minutas', selectors: ['div[id^="div-preferencia-minuta"]', 'div[id*="minuta"]'] },
                    { key: 'movimentacao', name: 'Movimentações', selectors: ['div[id^="div-preferencia-movimentacao"]', 'div[id*="movimentacao"]'] },
                    { key: 'intimacao', name: 'Intimações', selectors: ['div[id^="div-preferencia-intimacao"]', 'div[id*="intimacao"]'] },
                    { key: 'automatizacao', name: 'Automatizações', selectors: ['div[id^="div-preferencia-automatizacao"]', 'div[id*="automatizacao"]', 'div[id*="automatizar"]'] }
                ];

                const targets = mainBox.querySelectorAll(`
                    div[id^="preferencia-minuta-"]:not([data-sanfona-aplicada]), div[id^="preferencia-movimentacao-"]:not([data-sanfona-aplicada]),
                    div[id^="preferencia-intimacao-"]:not([data-sanfona-aplicada]), div[id^="preferencia-automatizacao-"]:not([data-sanfona-aplicada]),
                    #div-preferencia-automatizacao-dados:not([data-sanfona-aplicada]), div[id^="div-preferencia-automatizacao"]:not([data-sanfona-aplicada]), div[id*="automatizacao"]:not([data-sanfona-aplicada])
                `);

                targets.forEach(sec => {
                    if (sec.dataset.sanfonaAplicada) return;
                    if (sec.id === 'div-acoes-preferenciais' || sec.classList.contains('collapse')) return;

                    const textoSec = sec.innerText || sec.textContent || '';
                    const temElementosUteis = sec.querySelector('table, ul li, a.infraButton, a.content-link, input, button:not(.btn-accordion-mode)');
                    const semPreferencia = textoSec.includes('Sem preferência cadastrada') || textoSec.trim() === '' || !temElementosUteis;

                    if (semPreferencia) { sec.style.setProperty('display', 'none', 'important'); sec.classList.add('escondido'); sec.dataset.sanfonaAplicada = "vazia"; return; }

                    let catKey = 'minuta';
                    if (sec.id.includes('movimentacao')) { catKey = 'movimentacao'; } else if (sec.id.includes('intimacao')) { catKey = 'intimacao'; } else if (sec.id.includes('automatizacao') || sec.id.includes('automatizar')) { catKey = 'automatizacao'; }

                    sec.dataset.sanfonaAplicada = "ativa"; sec.classList.add('custom-accordion'); sec.setAttribute('data-category', catKey);
                    const storageKey = 'eproc_mode_' + (sec.id || 'sec_' + Math.random());
                    let currentMode = localStorage.getItem(storageKey) || 'auto'; sec.setAttribute('data-mode', currentMode);

                    const headerNativo = sec.querySelector('h4, h6');
                    let tituloTexto = "OPÇÕES";
                    if (headerNativo) { tituloTexto = headerNativo.textContent.trim(); headerNativo.style.setProperty('display', 'none', 'important'); }
                    const hrRow = sec.querySelector('hr'); if (hrRow) hrRow.style.setProperty('display', 'none', 'important');

                    const newHeader = document.createElement('div'); newHeader.className = 'custom-accordion-header';
                    const spanTitulo = document.createElement('span'); spanTitulo.className = 'accordion-title'; spanTitulo.innerHTML = `<span>${tituloTexto}</span> <span class="accordion-arrow">▼</span>`;
                    const btnModo = document.createElement('button'); btnModo.className = 'btn-accordion-mode'; btnModo.textContent = currentMode;
                    newHeader.appendChild(spanTitulo); newHeader.appendChild(btnModo);

                    const capsule = document.createElement('div'); capsule.className = 'custom-accordion-content';
                    const childrenParaMover = Array.from(sec.childNodes).filter(child => { return child !== headerNativo && child !== hrRow && child !== newHeader; });
                    childrenParaMover.forEach(child => capsule.appendChild(child));
                    sec.appendChild(newHeader); sec.appendChild(capsule);

                    let hoverTimeout = null;
                    function showAutoDropdown() {
                        if (sec.getAttribute('data-mode') !== 'auto') return;
                        const content = sec.querySelector('.custom-accordion-content'); if (!content) return;
                        content.style.cssText = 'display: block !important; position: absolute !important; visibility: hidden !important; height: auto !important; max-height: none !important;';
                        const contentHeight = content.scrollHeight; const rect = sec.getBoundingClientRect(); const windowHeight = window.innerHeight;
                        const spaceBelow = windowHeight - rect.bottom; const spaceAbove = rect.top;
                        content.style.visibility = '';
                        let finalHeight = contentHeight; let positionTop = ''; let positionBottom = ''; let borderRadius = '';

                        if (spaceBelow >= contentHeight) { positionTop = '100%'; positionBottom = 'auto'; borderRadius = '0 0 6px 6px'; }
                        else if (spaceAbove >= contentHeight) { positionTop = 'auto'; positionBottom = '100%'; borderRadius = '6px 6px 0 0'; }
                        else { if (spaceBelow >= spaceAbove) { positionTop = '100%'; positionBottom = 'auto'; finalHeight = Math.max(100, spaceBelow - 20); borderRadius = '0 0 6px 6px'; } else { positionTop = 'auto'; positionBottom = '100%'; finalHeight = Math.max(100, spaceAbove - 20); borderRadius = '6px 6px 0 0'; } }

                        content.style.cssText = `display: block !important; position: absolute !important; top: ${positionTop} !important; bottom: ${positionBottom} !important; left: 0 !important; right: 0 !important; z-index: 10000 !important; background: #ffffff !important; border: 1px solid #ced4da !important; border-radius: ${borderRadius} !important; box-shadow: 0 8px 16px rgba(0,0,0,0.12) !important; max-height: ${finalHeight}px !important; overflow-y: auto !important; padding: 8px 10px !important;`;
                        sec.classList.add('is-active-auto');
                    }

                    function hideAutoDropdown() { if (hoverTimeout) clearTimeout(hoverTimeout); if (sec.getAttribute('data-mode') !== 'auto') return; const content = sec.querySelector('.custom-accordion-content'); if (content) { content.style.cssText = ''; } sec.classList.remove('is-active-auto'); }

                    sec.addEventListener('mouseenter', () => { if (sec.getAttribute('data-mode') !== 'auto') return; hoverTimeout = setTimeout(showAutoDropdown, 400); });
                    sec.addEventListener('mouseleave', () => { hideAutoDropdown(); });

                    newHeader.addEventListener('click', (e) => { if (e.target.closest('.btn-accordion-mode')) return; if (sec.getAttribute('data-mode') === 'click') { sec.classList.toggle('is-open'); } });

                    btnModo.addEventListener('click', (e) => {
                        e.stopPropagation(); hideAutoDropdown();
                        let modeAtual = localStorage.getItem(storageKey) || 'auto'; let novoMode = (modeAtual === 'auto') ? 'click' : (modeAtual === 'click' ? 'fixo' : 'auto');
                        localStorage.setItem(storageKey, novoMode); sec.setAttribute('data-mode', novoMode); sec.classList.remove('is-open'); btnModo.textContent = novoMode;
                    });
                });

                let temAlgumaCategoriaAberta = false;

                categories.forEach(cat => {
                    let collapseEl = null;
                    for (let sel of cat.selectors) { collapseEl = mainBox.querySelector(sel); if (collapseEl) break; }
                    let tagExistente = headerBar.querySelector(`.pref-tag-${cat.key}`);
                    const estaAbertoNativo = collapseEl && (collapseEl.classList.contains('show') || collapseEl.classList.contains('in'));

                    if (estaAbertoNativo && collapseEl) {
                        temAlgumaCategoriaAberta = true; collapseEl.style.removeProperty('display'); collapseEl.classList.remove('escondido');
                        if (!tagExistente) { tagExistente = document.createElement('span'); tagExistente.className = `pref-tag-${cat.key}`; tagExistente.textContent = cat.name; headerBar.appendChild(tagExistente); }
                    } else {
                        if (collapseEl) { collapseEl.style.setProperty('display', 'none', 'important'); collapseEl.classList.add('escondido'); }
                        if (tagExistente) { tagExistente.remove(); }
                    }
                });

                categories.forEach(cat => { const tag = headerBar.querySelector(`.pref-tag-${cat.key}`); if (tag) { headerBar.appendChild(tag); } });

                mainBox.dataset.hasVisibleContent = temAlgumaCategoriaAberta ? 'true' : 'false';
                if (!temAlgumaCategoriaAberta || headerBar.children.length === 0 || compacto.ativo()) { mainBox.style.setProperty('display', 'none', 'important'); } else { mainBox.style.removeProperty('display'); }
            }

            // =================================================================================
            // ROTINAS SEGURAS COM MUTATION OBSERVER
            // =================================================================================
            function executarRotinasSeguras() {
                moverOpcoesMinutas();
                otimizarListasPreferencia();
                renderHoverRápido();

                const customCheckboxes = document.querySelectorAll('input[id^="chk-custom-collapse-"]');
                customCheckboxes.forEach(chk => {
                    const key = chk.id.replace('chk-custom-collapse-', '');
                    let realSwitch = document.getElementById(`switch-preferencia-${key}-collapse`) || document.querySelector(`input[id*="switch-preferencia-${key}"]`);
                    if (realSwitch && !chk.hasAttribute('data-synced')) {
                        chk.checked = realSwitch.checked;
                        chk.setAttribute('data-synced', 'true');
                    }
                });
            }

            // Executa rotinas imediatamente
            executarRotinasSeguras();

            // Observer com debounce: Garante que as rotinas rodem quando o DOM dinâmico do eproc atualizar
            let debounceTimer;
            const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(executarRotinasSeguras, 300);
            });

            observer.observe(document.body, { childList: true, subtree: true });


            // Os botões "Preferências" nativos apenas alternam as classes collapse/show dos
            // painéis (#div-preferencia-*), sem inserir/remover nós; o observer acima não
            // percebe isso. Observa a classe de cada painel e reavalia ao abrir/fechar.
            const estadoPainelPref = new WeakMap();
            let timerPainelPref;
            function painelPrefAberto(el) { return el.classList.contains('show') || el.classList.contains('in'); }
            function vincularPaineisPreferencia() {
                ['div-preferencia-minuta', 'div-preferencia-movimentacao', 'div-preferencia-intimacao', 'div-preferencia-automatizacao'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el || estadoPainelPref.has(el)) return;
                    estadoPainelPref.set(el, painelPrefAberto(el));
                    new MutationObserver(() => {
                        const aberto = painelPrefAberto(el);
                        if (aberto === estadoPainelPref.get(el)) return;
                        estadoPainelPref.set(el, aberto);
                        clearTimeout(timerPainelPref);
                        timerPainelPref = setTimeout(executarRotinasSeguras, 0);
                    }).observe(el, { attributes: true, attributeFilter: ['class'] });
                });
            }
            vincularPaineisPreferencia();
            // Painéis criados depois (carregamento dinâmico) também passam a ser observados
            new MutationObserver(vincularPaineisPreferencia).observe(document.body, { childList: true, subtree: true });
            reaplicarCompacto = () => { atualizarDesignCompacto(); executarRotinasSeguras(); };
        }

        if (document.readyState === 'complete') {
            executar();
        } else {
            window.addEventListener('load', executar);
            // Se já estiver interativo mas o evento load ainda não disparou
            if (document.readyState === 'interactive') {
                setTimeout(executar, 100);
            }
        }
    }
};
