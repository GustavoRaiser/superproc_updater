/**
 * SuperPROC - Módulo: Capa - Barra de Botões (balões flutuantes)
 *
 * Converte os fieldsets nativos (Assuntos, Informações, Ações, Preferências) em balões
 * flutuantes numa barra única ao lado do Juiz(a). Autônomo: não depende dos módulos
 * Ações Preferenciais, Filtros de Eventos nem Lembretes e Minutas.
 *
 * Modo Compacto próprio (esconde texto e seta dos botões): ligado no popup da extensão
 * (configuração "compacto" deste módulo); aplica a classe body.eproc-compacto-barra.
 */
import { iniciarCompacto } from './_compacto.js';
import { ehCapaDoProcesso } from '../../core/registry.js';

export default {
    id: 'capa_botoes_preferencias',
    name: 'Capa - Barra de Botões',
    category: 'Capa do Processo',
    description: 'Barra flutuante unificada com balões para Assuntos, Informações, Ações e Preferências. Modo compacto próprio.',
    defaultEnabled: false,

    matches: ehCapaDoProcesso,

    async init({ meta, storage } = {}) {
        if (window.__superprocCapaBotoesInjetado) return;
        window.__superprocCapaBotoesInjetado = true;
        let reaplicarCompacto = null;
        const compacto = await iniciarCompacto({
            meta: meta || { id: 'capa_botoes_preferencias' }, storage, classe: 'eproc-compacto-barra',
            aoMudar: () => { if (typeof reaplicarCompacto === 'function') reaplicarCompacto(); }
        });

        function executar() {
            if (document.querySelector('.botoes-flutuantes-container')) return;
            const juizContainer = document.querySelector('div[aria-label="Juiz(a)"]');
            const assuntosFieldset = document.getElementById('fldAssuntos');
            const infoFieldset = document.getElementById('fldInformacoesAdicionais');
            const acoesFieldset = document.getElementById('fldAcoes');
            const prefNav = document.getElementById('nav-acoes-processo');

            if (!document.getElementById('superproc-capa-botoes-style')) {
                const style = document.createElement('style');
                style.id = 'superproc-capa-botoes-style';
                style.innerHTML = `
                /* ================================================= */
                /* = BARRA PRINCIPAL (SEMPRE COMPACTA/UNIFICADA)   = */
                /* ================================================= */
                .botoes-flutuantes-container { display: inline-flex !important; align-items: stretch !important; gap: 0 !important; margin-left: 0 !important; vertical-align: middle !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; background: #ffffff !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; height: 31px !important; min-height: 31px !important; max-height: 31px !important; padding: 0 !important; flex-wrap: nowrap !important; position: relative !important; box-sizing: border-box !important; }
                .botoes-flutuantes-container > div:first-child .btn-balao-trigger { border-top-left-radius: 5px !important; border-bottom-left-radius: 5px !important; padding-left: 8px !important; }
                .botoes-flutuantes-container > div:last-child .btn-balao-trigger { border-right: none !important; border-top-right-radius: 5px !important; border-bottom-right-radius: 5px !important; padding-right: 8px !important; }
                .btn-balao-trigger { position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; padding: 0 5px !important; background-color: #ffffff !important; border: none !important; border-right: 1px solid #e2e8f0 !important; border-radius: 0 !important; font-size: 13px !important; font-weight: bold !important; color: #495057 !important; cursor: pointer !important; transition: background 0.2s !important; box-sizing: border-box !important; height: 100% !important; margin: 0 !important; line-height: 1 !important; }
                .btn-balao-trigger:hover { background-color: #f1f5f9 !important; }
                .btn-balao-trigger .balao-text { display: inline-block !important; transform: translateY(2px) !important; line-height: 1 !important; }
                .btn-balao-trigger .balao-arrow { display: inline-block !important; transform: translateY(1px) !important; }
                .switch-compacto-box { display: inline-flex !important; align-items: center !important; gap: 6px !important; padding: 4px 10px !important; background: #f1f5f9 !important; border: 1px solid #cbd5e1 !important; border-radius: 6px !important; margin-left: auto !important; }
                .switch-compacto-box label { margin: 0 !important; font-size: 12px !important; font-weight: 700 !important; color: #0f172a !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 6px !important; }
                .switch-compacto-box input[type="checkbox"] { margin: 0 !important; cursor: pointer !important; width: 14px !important; height: 14px !important; }


                /* --- MODO COMPACTO: OCULTA TEXTOS E SETAS DA BARRA PRINCIPAL --- */
                body.eproc-compacto-barra .btn-balao-trigger .balao-text,
                body.eproc-compacto-barra .btn-balao-trigger .balao-arrow { display: none !important; }
                body.eproc-compacto-barra .btn-balao-trigger { padding: 0 10px !important; }

                /* TRAVA RÍGIDA DO BALÃO PRINCIPAL */
                .fieldset-balao-customizado { position: absolute !important; top: calc(100% + 1px) !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 9999 !important; background: #ffffff !important; border: 1px solid #ccc !important; border-radius: 6px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; padding: 15px !important; width: 1000px !important; max-width: 95vw !important; margin: 0 !important; display: none !important; font-weight: normal !important; text-align: left !important; }
                .fieldset-balao-customizado.aberto { display: block !important; }
                .balao-header { display: flex !important; align-items: center !important; gap: 15px !important; margin-bottom: 10px !important; padding-bottom: 10px !important; border-bottom: 1px solid #eaeaea !important; }
                .balao-header button, .balao-header a, .balao-header span { margin: 0 !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; }

                #fldInformacoesAdicionais_content > .row { padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important; margin-right: 0 !important; width: 100% !important; }
                .fieldset-balao-customizado .col-md-4 .row { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; margin-bottom: 4px !important; }
                .fieldset-balao-customizado span.text-right { font-weight: 400 !important; text-align: right !important; flex: 0 0 52% !important; max-width: 52% !important; color: #444 !important; font-size: 13px !important; padding-right: 8px !important; line-height: 1.2 !important; }
                .fieldset-balao-customizado span.text-left { font-weight: 700 !important; text-align: left !important; flex: 0 0 48% !important; max-width: 48% !important; color: #000 !important; font-size: 13px !important; line-height: 1.2 !important; }
                .fieldset-balao-customizado table { margin-bottom: 0 !important; border: 1px solid #eee !important; }
                #fldAssuntos table.infraTable { display: table !important; }
                
                #fldAcoes.fieldset-balao-customizado center { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; text-align: left !important; }
                #fldAcoes.fieldset-balao-customizado .infraButton { display: inline-flex !important; align-items: center !important; justify-content: flex-start !important; flex: 0 0 calc(25% - 6px) !important; min-height: 42px !important; margin: 0 !important; padding: 6px 10px !important; box-sizing: border-box !important; border: 1px solid #e0e0e0 !important; border-radius: 6px !important; background: #fdfdfd !important; color: #333 !important; font-size: 12px !important; font-weight: 500 !important; white-space: normal !important; line-height: 1.2 !important; }
                #fldAcoes.fieldset-balao-customizado .infraButton:hover { background: #f1f8ff !important; border-color: #007ebc !important; color: #007ebc !important; }
                #fldAcoes.fieldset-balao-customizado .infraButton img { margin-right: 8px !important; max-width: 14px !important; max-height: 14px !important; }
                .btn-divisoria { display: block !important; width: 100% !important; text-align: center !important; margin: 10px 0 5px 0 !important; font-weight: bold !important; color: #007ebc !important; background: #f4f6f8 !important; padding: 8px !important; border-radius: 4px !important; border: 1px dashed #ccc !important; cursor: pointer !important; text-decoration: none !important; }
                .btn-divisoria:hover { background: #e9ecef !important; }
                .escondido { display: none !important; }
                #divAcoesOcultas.mostrar-acoes { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important; }

                #nav-acoes-processo.fieldset-balao-customizado { width: auto !important; min-width: 500px !important; left: auto !important; right: 0 !important; transform: none !important; }
                #nav-acoes-processo ul { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 15px 20px !important; width: 100% !important; padding-top: 10px !important; }
                #nav-acoes-processo ul li { margin: 0 !important; width: 100% !important; display: flex !important; flex-direction: column !important; }
                #nav-acoes-processo ul li .btn-group { width: 100% !important; display: flex !important; }
                #nav-acoes-processo ul li .btn-group a { flex: 1 !important; justify-content: center !important; display: inline-flex !important; align-items: center !important; }
                #nav-acoes-processo ul li .btn-group a#btn-preferencias-minutas, #nav-acoes-processo ul li .btn-group a#btn-preferencias-minutas:visited { color: #007bff !important; }
                #nav-acoes-processo ul li .btn-group a#btn-preferencias-movimentacao, #nav-acoes-processo ul li .btn-group a#btn-preferencias-movimentacao:visited { color: #28a745 !important; }
                #nav-acoes-processo ul li .btn-group a#btn-preferencias-intimacao, #nav-acoes-processo ul li .btn-group a#btn-preferencias-intimacao:visited { color: #dc3545 !important; }
                #nav-acoes-processo ul li .btn-group a#btn-preferencias-automatizar, #nav-acoes-processo ul li .btn-group a#btn-preferencias-automatizar:visited { color: #673ab7 !important; }

                #divInfraAreaDados1, #divInfraAreaDados2, #divInfraAreaDadosDinamica1, #divInfraAreaDadosDinamica2, #azflow-btn-pec, #divInfraBarraLocalizacao, body:not(.superproc-integracao-azflow) div[id^="azflow-filtro-"], #chkMinutasAbertas, small[for="chkMinutasAbertas"], label[for="chkMinutasAbertas"], #backTop, #backBottom { display: none !important; height: 0 !important; max-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }

                `;
                document.head.appendChild(style);
            }

            const containerBotoes = document.createElement('div');
            containerBotoes.className = 'botoes-flutuantes-container col-auto mr-2';

            // Posiciona a barra antes dos botões rápidos de Ações Preferenciais (módulo próprio), se já existirem.
            const quickExistente = document.getElementById('quick-hover-container');
            const wrapBotoesMin = document.getElementById('superproc-min-botoes-wrap');
            if (wrapBotoesMin) {
                if (quickExistente && quickExistente.parentNode === wrapBotoesMin) wrapBotoesMin.insertBefore(containerBotoes, quickExistente);
                else wrapBotoesMin.appendChild(containerBotoes);
            } else if (juizContainer) {
                // Força a linha onde ficam o "Juiz" e os "Botões" a alinhar tudo ao centro verticalmente
                juizContainer.parentNode.style.display = 'flex';
                juizContainer.parentNode.style.alignItems = 'center';
                juizContainer.parentNode.style.flexWrap = 'wrap';
                juizContainer.parentNode.insertBefore(containerBotoes, juizContainer.nextSibling);
            } else {
                const capa = document.getElementById('divCapaProcesso');
                const secao = [assuntosFieldset, infoFieldset, acoesFieldset, prefNav].find(el => el?.isConnected);
                if (capa && !secao?.contains(capa)) capa.appendChild(containerBotoes);
                else if (secao) secao.before(containerBotoes);
                else return;
            }

            const checkboxAbertas = document.getElementById('SinIAAberta');
            if (checkboxAbertas) {
                const rowCheckbox = checkboxAbertas.closest('.row');
                if (rowCheckbox) rowCheckbox.style.setProperty('display', 'none', 'important');
            }

            const lblDemais = document.getElementById('lblDemaisAcoes');
            const lblOcultar = document.getElementById('lblOcultarAcoes');
            const divOcultas = document.getElementById('divAcoesOcultas');

            if (lblDemais && lblOcultar && divOcultas) {
                lblDemais.removeAttribute('onclick'); lblOcultar.removeAttribute('onclick');
                lblDemais.classList.add('btn-divisoria'); lblOcultar.classList.add('btn-divisoria', 'escondido'); divOcultas.classList.add('escondido');

                lblDemais.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    divOcultas.classList.remove('escondido'); divOcultas.classList.add('mostrar-acoes');
                    lblDemais.classList.add('escondido'); lblOcultar.classList.remove('escondido');
                });

                lblOcultar.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    divOcultas.classList.add('escondido'); divOcultas.classList.remove('mostrar-acoes');
                    lblDemais.classList.remove('escondido'); lblOcultar.classList.add('escondido');
                });
            }

            function transformarEmBalao(elementoOrigem, textoLogic, textoDisplay, iconeSvg) {
                if (!elementoOrigem) return;

                const legend = elementoOrigem.tagName.toLowerCase() === 'fieldset' ? elementoOrigem.querySelector('legend') : null;
                const novoHeader = document.createElement('div');
                novoHeader.className = 'balao-header';

                if (legend) {
                    const elementosParaMover = legend.querySelectorAll('a, button, span');
                    elementosParaMover.forEach(el => novoHeader.appendChild(el));
                    legend.style.display = 'none';
                } else {
                    const titulo = document.createElement('span');
                    titulo.style.fontWeight = 'bold'; titulo.style.fontSize = '14px'; titulo.style.color = '#333'; titulo.textContent = textoDisplay;
                    novoHeader.appendChild(titulo);
                    elementoOrigem.classList.remove('mt-3', 'row', 'justify-content-between');
                    elementoOrigem.style.display = 'block';
                }


                elementoOrigem.insertBefore(novoHeader, elementoOrigem.firstChild);

                const triggerWrapper = document.createElement('div');
                triggerWrapper.style.position = 'relative';
                triggerWrapper.style.display = 'inline-flex';
                triggerWrapper.style.alignItems = 'stretch';
                const triggerBtn = document.createElement('div');
                triggerBtn.className = 'btn-balao-trigger';
                triggerBtn.innerHTML = `${iconeSvg} <span class="balao-text">${textoDisplay}</span> <span class="balao-arrow" style="font-size: 11px; margin-left: 2px;">▼</span>`;

                triggerWrapper.appendChild(triggerBtn); containerBotoes.appendChild(triggerWrapper);
                elementoOrigem.parentNode.removeChild(elementoOrigem); triggerWrapper.appendChild(elementoOrigem);
                elementoOrigem.classList.add('fieldset-balao-customizado');

                if (elementoOrigem.id === 'nav-acoes-processo') {
                    // ATENÇÃO: este módulo roda no mundo isolado da extensão, onde o window.jQuery da página
                    // NÃO existe. O toggle dos botões "Preferências" (data-toggle="collapse") é, portanto,
                    // deixado ao bootstrap nativo (listener delegado no document) e, só se ele não reagir,
                    // é feito direto pelo DOM. Antes, preventDefault + stopPropagation seguidos de
                    // jQuery(...).collapse() inexistente faziam o clique não ter efeito algum.
                    elementoOrigem.addEventListener('click', function (e) {
                        const link = e.target.closest('a[href^="#"]');
                        if (!link) return;
                        const alvoId = link.getAttribute('href');
                        const painel = alvoId && alvoId.length > 1 ? document.getElementById(alvoId.slice(1)) : null;
                        if (!painel) return;
                        e.preventDefault(); // evita salto/alteração de hash
                        // Automatizar: o toggle é feito pelo onclick inline (mundo da página, com jQuery). Barra a
                        // propagação para o bootstrap não alternar uma segunda vez caso o link também tenha data-toggle.
                        if (link.id.includes('automatizar')) { e.stopPropagation(); return; }
                        if (link.getAttribute('data-toggle') !== 'collapse') return;
                        const estavaAberto = painel.classList.contains('show');
                        setTimeout(() => {
                            // bootstrap reagiu: classe collapsing ou estado show já mudou
                            if (painel.classList.contains('collapsing') || painel.classList.contains('show') !== estavaAberto) return;
                            const abrir = !estavaAberto;
                            painel.classList.add('collapse');
                            painel.classList.toggle('show', abrir);
                            link.setAttribute('aria-expanded', String(abrir));
                            link.classList.toggle('collapsed', !abrir);
                        }, 60);
                    });
                }

                // --- CLIQUE COM POSICIONAMENTO INTELIGENTE (CENTRALIZADO) ---
                triggerBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const estaAberto = elementoOrigem.classList.contains('aberto');
                    
                    document.querySelectorAll('.fieldset-balao-customizado').forEach(balao => {
                        balao.classList.remove('aberto');
                        balao.style.removeProperty('left');
                        balao.style.removeProperty('right');
                        balao.style.removeProperty('transform');
                    });

                    if (!estaAberto) {
                        elementoOrigem.classList.add('aberto');
                        
                        const rect = elementoOrigem.getBoundingClientRect();
                        if (rect.right > (window.innerWidth - 15)) {
                            elementoOrigem.style.setProperty('left', 'auto', 'important');
                            elementoOrigem.style.setProperty('right', '0', 'important');
                            elementoOrigem.style.setProperty('transform', 'none', 'important');
                        } else if (rect.left < 15) {
                            elementoOrigem.style.setProperty('left', '0', 'important');
                            elementoOrigem.style.setProperty('right', 'auto', 'important');
                            elementoOrigem.style.setProperty('transform', 'none', 'important');
                        }

                        if (elementoOrigem.id === 'fldInformacoesAdicionais') {
                            const contentDiv = document.getElementById('fldInformacoesAdicionais_content');
                            if (contentDiv && contentDiv.innerHTML.trim().length < 100) { if (legend) legend.click(); } else if (contentDiv) { contentDiv.style.display = 'block'; }
                        } else if (elementoOrigem.id === 'fldAcoes') {
                            const centerTag = elementoOrigem.querySelector('center');
                            if (centerTag) centerTag.style.display = 'flex';
                        }
                    }
                });

                // --- ABRIR NO HOVER (0.5s) ---
                let hoverTimerBalao;
                triggerBtn.addEventListener('mouseenter', function () {
                    hoverTimerBalao = setTimeout(() => {
                        if (!elementoOrigem.classList.contains('aberto')) {
                            triggerBtn.click();
                        }
                    }, 500); 
                });

                triggerBtn.addEventListener('mouseleave', function () {
                    clearTimeout(hoverTimerBalao);
                });

                // No balão de Preferências o clique precisa chegar ao document (bootstrap nativo dos collapses);
                // o fechamento ao clicar fora ignora cliques dentro dele (ver listener global abaixo).
                elementoOrigem.addEventListener('click', function (e) { if (elementoOrigem.id !== 'nav-acoes-processo') e.stopPropagation(); });
                
                novoHeader.addEventListener('click', function (e) {
                    if (elementoOrigem.id === 'fldInformacoesAdicionais') {
                        const clicado = e.target.closest('a, button');
                        if (clicado && clicado.textContent.toLowerCase().includes('editar')) {
                            elementoOrigem.classList.remove('aberto');
                        }
                    }
                });
            }

            const iconeLivro = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>`;
            const iconeInfo = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            const iconeAcoes = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
            const iconeEstrela = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

            transformarEmBalao(assuntosFieldset, 'Assuntos', 'Assuntos', iconeLivro);
            transformarEmBalao(infoFieldset, 'Informações Adicionais', 'Informações', iconeInfo);
            transformarEmBalao(acoesFieldset, 'Ações', 'Ações', iconeAcoes);
            transformarEmBalao(prefNav, 'Preferências', 'Preferências', iconeEstrela);

            // Limpa estado e posições quando clica fora
            document.addEventListener('click', function (e) {
                if (e && e.target && e.target.closest && e.target.closest('#nav-acoes-processo')) return;
                document.querySelectorAll('.fieldset-balao-customizado').forEach(balao => {
                    balao.classList.remove('aberto');
                    balao.style.removeProperty('left');
                    balao.style.removeProperty('right');
                    balao.style.removeProperty('transform');
                });
            });

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
