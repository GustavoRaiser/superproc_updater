/**
 * SuperPROC - Módulo: Capa - Filtros de Eventos
 *
 * Reposiciona Filtros e Pesquisa de Eventos na legenda de Eventos e fornece a filtragem
 * instantânea unificada. Autônomo; sem modo compacto.
 */
import { iniciarCompacto } from './_compacto.js';

const categorias = [
    ['autor', 'Autor'],
    ['reu', 'Réu'],
    ['mp', 'MP'],
    ['externo', 'Externo'],
    ['despacho', 'Despachos/Decisões', /^(?:desp|despadec|despacho|dec|decisao|acordao)$/],
    ['sentenca', 'Sentenças', /^(?:sent|sentenca)$/],
    ['certidao', 'Certidões', /^(?:cert|certidao)$/],
    ['mandado', 'Mandados', /^(?:mand|mandado)$/],
    ['ato', 'Atos ordinatórios', /^(?:atoord|ato ordinatorio)$/],
    ['outros', 'Outros']
];
const seletorDocumento = 'a.infraLinkDocumento, a.infraLinkDocumentoSigiloso, a[href*="download_anexo"], a[href*="acao=documento_visualizar"]';
const classeOculta = 'superproc-evento-oculto';

export default {
    id: 'capa_filtros_eventos',
    name: 'Capa - Filtros de Eventos',
    category: 'Capa do Processo',
    description: 'Filtros e pesquisa de eventos na legenda, com filtragem instantânea. Adaptação de usabilidade do AZFLOW para evitar conflitos com o sistema do SuperPROC - créditos a Ricardo do Valle.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init({ meta, storage } = {}) {
        if (window.__superprocCapaFiltrosEventosInjetado) return;
        window.__superprocCapaFiltrosEventosInjetado = true;
        let reaplicarCompacto = null;
        const compacto = await iniciarCompacto({
            meta: meta || { id: 'capa_filtros_eventos' }, storage, classe: null,
            aoMudar: () => { if (typeof reaplicarCompacto === 'function') reaplicarCompacto(); }
        });

        const selecionadas = new Set();
        const caixasDesabilitadas = new WeakSet();
        let reaplicar = () => {};
        const barraMenu = document.createElement('div');
        barraMenu.className = 'superproc-categorias-eventos superproc-categorias-menu';
        barraMenu.setAttribute('role', 'group');
        barraMenu.setAttribute('aria-label', 'Filtrar eventos por parte ou tipo de documento');
        const botoes = new Map();
        for (const [chave, rotulo] of [['todos', 'Todos os eventos'], ...categorias]) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.textContent = rotulo;
            botao.addEventListener('click', () => {
                if (chave === 'todos') selecionadas.clear();
                else if (selecionadas.has(chave)) selecionadas.delete(chave);
                else selecionadas.add(chave);
                reaplicar();
            });
            botoes.set(chave, { botao, rotulo });
            barraMenu.appendChild(botao);
        }

        let menuAtual;
        let eventosMenu;
        function configurarMenu(wrapper, botao) {
            const menu = wrapper?.querySelector('.dropdown-menu:has(#tblOpcoesEventos)');
            if (menu && menu === menuAtual && menu.contains(barraMenu)) return;
            eventosMenu?.abort();
            menuAtual = menu;
            if (!menu) return;
            eventosMenu = new AbortController();
            const { signal } = eventosMenu;
            const nativos = menu.querySelector('#fldExibirEventos') || menu.firstElementChild;
            nativos?.before(barraMenu);
            wrapper.classList.add('superproc-menu-filtros');
            botao.removeAttribute('data-toggle');
            botao.removeAttribute('data-bs-toggle');
            menu.removeAttribute('style');
            menu.removeAttribute('x-placement');
            menu.removeAttribute('role');
            menu.id ||= 'superproc-menu-filtros-eventos';
            botao.setAttribute('aria-controls', menu.id);

            let fixado = false;
            let fecharTimer;
            const campoEventos = wrapper.closest('fieldset');
            const posicionarMenu = () => {
                if (!menu.classList.contains('show')) return;
                const area = botao.getBoundingClientRect();
                const abaixo = document.documentElement.clientHeight - area.bottom;
                const acima = area.top;
                const abrirAcima = abaixo < 250 && acima > abaixo;
                menu.classList.toggle('superproc-menu-acima', abrirAcima);
                menu.style.maxHeight = Math.max(0, (abrirAcima ? acima : abaixo) - 8) + 'px';

                const tabela = campoEventos?.querySelector('#tblEventos');
                const limites = tabela?.getBoundingClientRect();
                const campo = campoEventos?.getBoundingClientRect();
                const bordaEsquerda = campo ? campo.left + campoEventos.clientLeft : 0;
                const bordaDireita = campo ? bordaEsquerda + campoEventos.clientWidth : document.documentElement.clientWidth;
                const esquerda = Math.max(0, bordaEsquerda, limites?.left ?? bordaEsquerda);
                const direita = Math.min(document.documentElement.clientWidth, bordaDireita, limites?.right ?? bordaDireita);
                menu.style.width = Math.max(0, direita - esquerda) + 'px';
                menu.style.left = esquerda - wrapper.getBoundingClientRect().left - wrapper.clientLeft + 'px';
            };
            const exibir = (aberto) => {
                clearTimeout(fecharTimer);
                if (!aberto) fixado = false;
                wrapper.classList.toggle('show', aberto);
                menu.classList.toggle('show', aberto);
                botao.setAttribute('aria-expanded', String(aberto));
                posicionarMenu();
            };
            const observarLargura = new ResizeObserver(posicionarMenu);
            if (campoEventos) observarLargura.observe(campoEventos);
            const tabela = campoEventos?.querySelector('#tblEventos');
            if (tabela) observarLargura.observe(tabela);
            signal.addEventListener('abort', () => observarLargura.disconnect(), { once: true });
            window.addEventListener('resize', posicionarMenu, { signal });
            campoEventos?.addEventListener('scroll', posicionarMenu, { passive: true, signal });
            exibir(false);
            wrapper.addEventListener('pointerenter', e => {
                if (e.pointerType === 'mouse') exibir(true);
            }, { signal });
            wrapper.addEventListener('pointerleave', e => {
                if (e.pointerType !== 'mouse' || fixado || menu.contains(document.activeElement) &&
                    document.activeElement.matches(':focus-visible')) return;
                fecharTimer = setTimeout(() => exibir(false), 140);
            }, { signal });
            botao.addEventListener('click', e => {
                e.preventDefault();
                e.stopImmediatePropagation();
                const abrir = !fixado;
                fixado = abrir;
                exibir(abrir);
            }, { capture: true, signal });
            wrapper.addEventListener('keydown', e => {
                if (e.key === 'ArrowDown' && e.target === botao) {
                    e.preventDefault();
                    e.stopPropagation();
                    fixado = true;
                    exibir(true);
                    menu.querySelector('button:not(:disabled), input:not(:disabled), a[href]')?.focus();
                }
            }, { signal });
            document.addEventListener('keydown', e => {
                if (e.key !== 'Escape' || !menu.classList.contains('show')) return;
                exibir(false);
                if (wrapper.contains(e.target) || e.target === document.body) {
                    e.stopPropagation();
                    botao.focus();
                }
            }, { capture: true, signal });
            wrapper.addEventListener('focusout', e => {
                if (e.relatedTarget && !wrapper.contains(e.relatedTarget) && !wrapper.matches(':hover')) exibir(false);
            }, { signal });
            document.addEventListener('pointerdown', e => {
                if (!wrapper.contains(e.target)) exibir(false);
            }, { capture: true, signal });
        }
        window.addEventListener('superproc-requisitar-filtros-eventos', () => reaplicar());

        function executar() {
            if (!document.getElementById('superproc-capa-filtros-eventos-style')) {
                const style = document.createElement('style');
                style.id = 'superproc-capa-filtros-eventos-style';
                style.innerHTML = `
                #tblEventos tr.superproc-evento-oculto { display: none !important; }
                .superproc-categorias-eventos {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    min-width: 0;
                    max-width: 100%;
                }
                .superproc-menu-filtros { position: relative; }
                .superproc-menu-filtros > .dropdown-menu {
                    position: absolute;
                    inset: 100% auto auto 0;
                    z-index: 1050;
                    width: 100%;
                    min-width: 0;
                    margin: 0;
                    padding: 8px;
                    box-sizing: border-box;
                    overflow: auto;
                    text-align: left;
                }
                .superproc-menu-filtros > .dropdown-menu.superproc-menu-acima { top: auto; bottom: 100%; }
                .superproc-menu-filtros > .dropdown-menu.show { display: block; }
                .superproc-menu-filtros > .dropdown-menu:not(.show) { display: none; }
                .superproc-menu-filtros .superproc-categorias-menu {
                    align-items: center;
                    gap: 6px;
                    padding: 4px 8px 10px;
                    margin-bottom: 8px;
                    border-bottom: 1px solid #ced4da;
                }
                .superproc-categorias-eventos button {
                    display: inline-flex;
                    align-items: center;
                    box-sizing: border-box;
                    min-height: var(--superproc-lupa-altura, 31px);
                    padding: 0 8px;
                    font: var(--superproc-lupa-fonte, inherit);
                    color: var(--superproc-lupa-texto, #495057);
                    background-color: var(--superproc-lupa-fundo, #e9ecef);
                    border: var(--superproc-lupa-borda, 1px solid #ced4da);
                    border-radius: var(--superproc-lupa-raio, 4px);
                    cursor: pointer;
                }
                .superproc-categorias-eventos button[aria-pressed="true"] {
                    background-color: #dceef6;
                    color: #084e70;
                    border-color: #4791b1;
                }
                .superproc-categorias-eventos button:focus-visible {
                    outline: 2px solid #007bff;
                    outline-offset: 1px;
                }
                .superproc-categorias-eventos button:disabled {
                    opacity: .55;
                    cursor: default;
                }
                .superproc-categorias-menu > button {
                    min-height: 28px;
                    max-width: 100%;
                    padding: 4px 9px;
                    border: 1px solid #ccd5dd !important;
                    border-radius: 6px !important;
                    background: #f5f7f9;
                    color: #354451;
                    font-size: 13px;
                    line-height: 1.25;
                    text-align: left;
                    white-space: normal;
                }
                .superproc-categorias-menu > button:not(:disabled):not([aria-pressed="true"]):hover {
                    background: #e9f2fa;
                    border-color: #93b2cc !important;
                }
                .superproc-categorias-menu > button[aria-pressed="true"] {
                    background: #dceef6;
                    border-color: #4791b1 !important;
                    color: #084e70;
                }
                .superproc-categorias-menu > button:disabled {
                    background: #fafbfc;
                    border-color: #e0e6eb !important;
                    color: #63707d;
                    opacity: 1;
                }
                fieldset:has(> legend .superproc-menu-filtros .superproc-categorias-menu) > .azflow-eventos-filtros {
                    display: none !important;
                }
                #tblEventos > caption.infraCaption {
                    display: none !important;
                }
                /* --- BOTÃO LIMPAR PESQUISA DE EVENTOS --- */
                .btn-limpar-pesquisa-eventos {
                    cursor: pointer !important;
                    background-color: #ffffff !important;
                    color: #6c757d !important;
                    padding: 0 7px !important;
                    border-top: 1px solid #ced4da !important;
                    border-bottom: 1px solid #ced4da !important;
                    border-left: 1px solid #ced4da !important;
                    border-right: none !important;
                    display: none;
                    align-items: center !important;
                    justify-content: center !important;
                    user-select: none !important;
                    transition: color 0.15s ease, background-color 0.15s ease !important;
                }
                .btn-limpar-pesquisa-eventos:hover {
                    color: #dc3545 !important;
                    background-color: #f8f9fa !important;
                }
                .btn-limpar-pesquisa-eventos svg {
                    display: block !important;
                    pointer-events: none !important;
                }
                `;
                document.head.appendChild(style);
            }

            function posicionarFiltrosEventos() {
                const tabela = document.getElementById('tblEventos');
                const legendEventos = tabela?.closest('fieldset')?.querySelector(':scope > legend') ||
                    Array.from(document.querySelectorAll('legend')).find(el => el.textContent.trim().startsWith('Eventos'));
                if (!legendEventos) return;

                let wrapperFiltros = null;
                let botaoFiltros = null;
                const spansIcons = document.querySelectorAll('span.material-icons');
                for (let span of spansIcons) {
                    if (span.textContent.trim() === 'filter_alt') {
                        const btn = span.closest('button');
                        if (btn) {
                            botaoFiltros = btn;
                            wrapperFiltros = btn.closest('.dropdown, .btn-group') || btn.parentElement || btn;
                            btn.id = 'btn-dropdown-filtros-eventos';
                            btn.style.cssText = 'background-color:#ffffff;border:1px solid #ced4da;border-radius:4px;color:#007ebc;padding:4px 10px;box-shadow:none;display:inline-flex;align-items:center;';
                            break;
                        }
                    }
                }
                const divPesquisa = document.getElementById('divPesquisaEventos');
                legendEventos.style.display = 'flex';
                legendEventos.style.alignItems = 'center';
                legendEventos.style.flexWrap = 'wrap';
                legendEventos.style.gap = '4px 8px';
                legendEventos.style.margin = '0';
                legendEventos.style.padding = '6px 12px';
                legendEventos.style.width = '100%';
                legendEventos.style.boxSizing = 'border-box';

                if (wrapperFiltros && wrapperFiltros.parentElement !== legendEventos) {
                    wrapperFiltros.style.margin = '0';
                    legendEventos.appendChild(wrapperFiltros);
                }
                if (divPesquisa && divPesquisa.parentElement !== legendEventos) {
                    divPesquisa.classList.remove('float-right', 'mb-2');
                    divPesquisa.style.margin = '0';
                    divPesquisa.style.width = '240px';
                    legendEventos.appendChild(divPesquisa);
                }

                configurarMenu(wrapperFiltros, botaoFiltros);
                if (divPesquisa) divPesquisa.style.maxWidth = '100%';

                const lupa = divPesquisa?.querySelector(
                    '.input-group-append :is(button, a, input[type="button"], [role="button"], .input-group-text):not(.btn-limpar-pesquisa-eventos)'
                ) || divPesquisa?.querySelector('button, input[type="button"]');
                if (lupa) {
                    const estilo = getComputedStyle(lupa);
                    const altura = lupa.getBoundingClientRect().height;
                    if (altura) legendEventos.style.setProperty('--superproc-lupa-altura', altura + 'px');
                    legendEventos.style.setProperty('--superproc-lupa-fonte', estilo.font);
                    legendEventos.style.setProperty('--superproc-lupa-texto', estilo.color);
                    legendEventos.style.setProperty('--superproc-lupa-fundo', estilo.backgroundColor);
                    legendEventos.style.setProperty('--superproc-lupa-borda', estilo.borderTop);
                    // A lupa é acoplada à busca à esquerda, por isso o raio externo fica no lado direito.
                    legendEventos.style.setProperty('--superproc-lupa-raio', estilo.borderTopRightRadius);
                }

                // Elimina estritamente contêineres de paginação do eProc que causam o gap de 6em
                ['divInfraAreaDados1', 'divInfraAreaDados2', 'divInfraAreaDadosDinamica1', 'divInfraAreaDadosDinamica2'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('height', '0px', 'important');
                    }
                });

                // Neutraliza altura fixa calculada pelo eProc em div.infraAreaTela
                ['divInfraAreaTela', 'divInfraAreaTelaD'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.setProperty('height', 'auto', 'important');
                        el.style.setProperty('min-height', '0px', 'important');
                        el.style.setProperty('max-height', 'none', 'important');
                        el.style.setProperty('padding-bottom', '0px', 'important');
                        el.style.setProperty('margin-bottom', '0px', 'important');
                    }
                });

                // Paginação: integra na mesma linha da legenda de forma compacta e alinhada
                const divPaginacao = document.getElementById('divPaginacaoT');
                if (divPaginacao && divPaginacao.parentElement !== legendEventos) {
                    divPaginacao.style.display = 'inline-flex';
                    divPaginacao.style.alignItems = 'center';
                    divPaginacao.style.gap = '4px';
                    divPaginacao.style.margin = '0 0 0 10px';
                    legendEventos.appendChild(divPaginacao);
                }

                const divAguarde = document.getElementById('divAguardeT');
                if (divAguarde && divAguarde.parentElement !== legendEventos) {
                    divAguarde.style.margin = '0 0 0 10px';
                    divAguarde.style.fontSize = '12px';
                    legendEventos.appendChild(divAguarde);
                }

                document.querySelectorAll('caption a.infraLink').forEach(link => {
                    if (link.textContent.trim() === 'Configurar monitores') {
                        const captionBox = link.closest('caption');
                        if (captionBox) captionBox.style.display = 'none';
                    }
                });
                configurarFiltrosEventosUnificados();
            }

            // ======================================================================
            // SISTEMA PRÓPRIO DE FILTRAGEM INSTANTÂNEA E PESQUISA DE EVENTOS
            // ======================================================================
            function configurarFiltrosEventosUnificados() {
                const divPesquisa = document.getElementById('divPesquisaEventos');
                const inputPesquisa = document.getElementById('txtPesquisaEventos');
                if (!divPesquisa || !inputPesquisa) return;

                // 1. Garante que o injetor no Main World esteja carregado sem violar CSP
                if (!document.getElementById('superproc-main-world-script') && !document.documentElement.dataset.superprocMainWorld) {
                    try {
                        const s = document.createElement('script');
                        s.id = 'superproc-main-world-script';
                        s.src = chrome.runtime.getURL('modules/capa/injetor_main_world.js');
                        (document.head || document.documentElement).appendChild(s);
                    } catch (e) {}
                }

                function normalizarTexto(str) {
                    return (str || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .trim();
                }

                // 2. Mecanismo central unificado de filtragem
                let filtrandoEmAndamento = false;
                function aplicarFiltrosUnificados(autoScroll = false) {
                    if (filtrandoEmAndamento) return;
                    filtrandoEmAndamento = true;

                    let totalVisiveis = 0;
                    let primeiraLinhaCorrespondente = null;
                    let palavras = [];
                    let totalFiltrosAtivos = 0;

                    try {
                        const tabela = document.getElementById('tblEventos');
                        const btnLimpar = document.getElementById('btnLimparPesquisaEventos');

                        const chkComDocs = document.getElementById('chkMostrarComDocumentos');
                        const chkDecisao = document.getElementById('chkMostrarDeDecisao');
                        const chkExternos = document.getElementById('chkMostrarExternos');
                        const chkRelevantes = document.getElementById('chkMostrarSohRelevantes');

                        const fComDocs = chkComDocs ? chkComDocs.checked : false;
                        const fDecisao = chkDecisao ? chkDecisao.checked : false;
                        const fExternos = chkExternos ? chkExternos.checked : false;
                        const fRelevantes = chkRelevantes ? chkRelevantes.checked : false;

                        totalFiltrosAtivos = (fComDocs ? 1 : 0) + (fDecisao ? 1 : 0) + (fExternos ? 1 : 0) + (fRelevantes ? 1 : 0);

                        // Termos da pesquisa textual
                        const termoDigitado = inputPesquisa ? inputPesquisa.value.trim() : '';
                        const termoNormalizado = normalizarTexto(termoDigitado);
                        palavras = termoNormalizado ? termoNormalizado.split(/\s+/).filter(Boolean) : [];

                        // Controle de visibilidade do botão limpar
                        if (btnLimpar) {
                            btnLimpar.style.setProperty('display', termoDigitado ? 'flex' : 'none', 'important');
                        }

                        if (!tabela) return;

                        // A coluna Documentos também contém tabelas com tbody e tr.
                        const linhas = Array.from(tabela.querySelectorAll(':scope > tbody > tr'))
                            .filter(tr => tr.cells.length > 1 && tr.id !== 'trSemEventos' &&
                                !tr.classList.contains('infraTrAviso') && !tr.querySelector('#emptyTable'));
                        const totais = new Map();
                        const visibilidadeCorpos = new Map();
                        const eventos = linhas.map(tr => {
                            const documentos = Array.from(tr.querySelectorAll(seletorDocumento));
                            const temDoc = documentos.length > 0 || !!tr.querySelector('.infraArvoreNo, .infraArvoreFolha') ||
                                /Exibir Documentos/i.test(tr.cells[tr.cells.length - 1].textContent);
                            const chaves = new Set();
                            const parte = normalizarTexto(tr.dataset.parte);
                            if (temDoc && ['autor', 'reu', 'mp', 'externo'].includes(parte)) chaves.add(parte);
                            for (const link of documentos) {
                                const nome = normalizarTexto(link.dataset.nome?.trim() ||
                                    link.getAttribute('aria-label')?.match(/^Visualizar documento (.+?) do tipo\b/i)?.[1] ||
                                    link.textContent).replace(/\s*\d+$/, '');
                                const tipo = categorias.find(([, , padrao]) => padrao?.test(nome));
                                if (tipo) chaves.add(tipo[0]);
                            }
                            if (temDoc && !chaves.size) chaves.add('outros');
                            const corpo = tr.parentElement;
                            if (!visibilidadeCorpos.has(corpo)) {
                                visibilidadeCorpos.set(corpo, !corpo.hidden && getComputedStyle(corpo).display !== 'none');
                            }
                            const disponivel = !tr.hidden && tr.style.display !== 'none' && visibilidadeCorpos.get(corpo);
                            if (disponivel) {
                                for (const chave of chaves) totais.set(chave, (totais.get(chave) || 0) + 1);
                            }
                            return { tr, chaves, temDoc, disponivel };
                        });
                        const ativas = [...selecionadas].filter(chave => totais.has(chave));
                        for (const [chave, { botao, rotulo }] of botoes) {
                            const total = totais.get(chave);
                            const titulo = total ? rotulo + ' (' + total + ')' : rotulo;
                            if (botao.textContent !== titulo) botao.textContent = titulo;
                            botao.disabled = chave !== 'todos' && !total;
                            botao.setAttribute('aria-pressed', String(chave === 'todos' ? !ativas.length : ativas.includes(chave)));
                        }

                        // Mantém a ordem original dentro de cada conjunto.
                        const botoesMenu = [...botoes.values()].map(({ botao }) => botao);
                        const ordemMenu = [
                            ...botoesMenu.filter(botao => !botao.disabled),
                            ...botoesMenu.filter(botao => botao.disabled)
                        ];
                        const focoMenu = barraMenu.contains(document.activeElement) ? document.activeElement : null;
                        ordemMenu.forEach((botao, indice) => {
                            const atual = barraMenu.children[indice];
                            if (atual !== botao) barraMenu.insertBefore(botao, atual || null);
                        });
                        if (focoMenu && !focoMenu.disabled && document.activeElement !== focoMenu) {
                            focoMenu.focus({ preventScroll: true });
                        }

                        const totalIndicador = totalFiltrosAtivos + ativas.length;
                        // Atualiza visual do botão "Filtros" na legenda com indicador de filtros ativos
                        const btnFiltros = document.getElementById('btn-dropdown-filtros-eventos');
                        if (btnFiltros) {
                            let badgeFiltro = btnFiltros.querySelector('.superproc-badge-filtros');
                            if (totalIndicador > 0) {
                                btnFiltros.style.backgroundColor = '#f0f9ff';
                                btnFiltros.style.borderColor = '#0284c7';
                                btnFiltros.style.color = '#0284c7';
                                btnFiltros.style.fontWeight = 'bold';
                                if (!badgeFiltro) {
                                    badgeFiltro = document.createElement('span');
                                    badgeFiltro.className = 'badge badge-primary ml-1 superproc-badge-filtros';
                                    btnFiltros.appendChild(badgeFiltro);
                                }
                                if (badgeFiltro.textContent !== String(totalIndicador)) badgeFiltro.textContent = totalIndicador;
                                badgeFiltro.style.display = 'inline-block';
                            } else {
                                btnFiltros.style.backgroundColor = '';
                                btnFiltros.style.borderColor = '';
                                btnFiltros.style.color = '';
                                btnFiltros.style.fontWeight = '';
                                if (badgeFiltro) {
                                    badgeFiltro.style.display = 'none';
                                }
                            }
                        }

                        eventos.forEach(({ tr, chaves, temDoc, disponivel }) => {
                            let visivelPorFiltro = true;

                            if (totalFiltrosAtivos > 0) {
                                const textoTr = tr.textContent;
                                const trHtml = tr.innerHTML;

                                if (fComDocs && !temDoc) visivelPorFiltro = false;

                                if (visivelPorFiltro && fDecisao) {
                                    const textoLower = textoTr.toLowerCase();
                                    const ehDecisao = textoLower.includes('decisão') ||
                                                      textoLower.includes('decisao') ||
                                                      textoLower.includes('sentença') ||
                                                      textoLower.includes('sentenca') ||
                                                      textoLower.includes('acórdão') ||
                                                      textoLower.includes('acordao') ||
                                                      textoLower.includes('despacho');
                                    if (!ehDecisao) visivelPorFiltro = false;
                                }

                                if (visivelPorFiltro && fExternos) {
                                    const ehExterno = textoTr.toLowerCase().includes('evento externo') ||
                                                      trHtml.includes('externo') ||
                                                      tr.querySelector('img[src*="externo"], span[title*="externo"]');
                                    if (!ehExterno) visivelPorFiltro = false;
                                }

                                if (visivelPorFiltro && fRelevantes) {
                                    const ehRelevante = tr.classList.contains('infraTrRelevante') ||
                                                        tr.classList.contains('trRelevante') ||
                                                        tr.querySelector('.infraIconeRelevante') ||
                                                        trHtml.includes('relevante');
                                    if (!ehRelevante) visivelPorFiltro = false;
                                }
                            }

                            const textoPesquisa = palavras.length ? normalizarTexto(tr.textContent) : '';
                            const ocultar = !visivelPorFiltro ||
                                (ativas.length > 0 && !ativas.some(chave => chaves.has(chave))) ||
                                !palavras.every(p => textoPesquisa.includes(p));
                            tr.classList.toggle(classeOculta, ocultar);
                            const caixa = tr.querySelector('input[type="checkbox"]');
                            if (ocultar && caixa && !caixa.disabled) {
                                caixa.disabled = true;
                                caixasDesabilitadas.add(caixa);
                            } else if (!ocultar && caixa && caixasDesabilitadas.delete(caixa)) {
                                caixa.disabled = false;
                            }
                            if (ocultar || !disponivel) return;
                            totalVisiveis++;
                            if (!primeiraLinhaCorrespondente) primeiraLinhaCorrespondente = tr;
                        });

                        // Mensagem de tabela vazia nativa do eProc
                        const emptyTable = document.getElementById('emptyTable');
                        if (emptyTable) {
                            emptyTable.style.display = (totalVisiveis === 0) ? 'block' : 'none';
                        }

                        if (autoScroll && primeiraLinhaCorrespondente && (palavras.length > 0 || totalFiltrosAtivos > 0)) {
                            primeiraLinhaCorrespondente.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    } finally {
                        filtrandoEmAndamento = false;
                    }

                    // Notifica outros módulos que a filtragem foi concluída com sucesso
                    window.dispatchEvent(new CustomEvent('superproc-filtros-aplicados'));
                }

                // Expõe globalmente para integração com cliques em OAB e novos eventos
                window.__superprocFiltrarEventos = function(termo, autoScroll = false) {
                    if (inputPesquisa) inputPesquisa.value = termo || '';
                    aplicarFiltrosUnificados(autoScroll);
                    // Solicita ao Main World a busca real do eproc. A busca
                    // nativa preenche/atualiza a coluna de documentos; o
                    // filtro local sozinho só consegue ocultar linhas já DOM.
                    window.dispatchEvent(new CustomEvent('superproc-executar-filtro-nativo', {
                        detail: { ancorarTela: !!autoScroll }
                    }));
                };
                reaplicar = () => aplicarFiltrosUnificados(false);
                reaplicarCompacto = reaplicar;
                window.__superprocReaplicarFiltros = reaplicar;

                // 3. Configura interceptação dos checkboxes no menu de Filtros
                const checkboxesFiltro = document.querySelectorAll('#tblOpcoesEventos input[type="checkbox"]');
                checkboxesFiltro.forEach(chk => {
                    if (!chk.dataset.superprocFiltroConfigurado) {
                        // Clona o nó para aniquilar qualquer listener inline ou nativo compilado pelo navegador
                        const clone = chk.cloneNode(true);
                        clone.dataset.superprocFiltroConfigurado = "1";
                        clone.removeAttribute('onclick');
                        clone.onclick = null;
                        chk.parentNode.replaceChild(clone, chk);

                        const onChangeCheckbox = (e) => {
                            if (e) {
                                e.stopPropagation();
                            }
                            aplicarFiltrosUnificados(false);
                        };

                        clone.addEventListener('change', onChangeCheckbox);
                        clone.addEventListener('click', onChangeCheckbox);
                    }
                });

                // Mantém contêineres de paginação ocultos (sem remover do DOM para manter compatibilidade)
                ['divInfraAreaDados1', 'divInfraAreaDados2', 'divInfraAreaDadosDinamica1', 'divInfraAreaDadosDinamica2'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('height', '0px', 'important');
                    }
                });

                // 4. Botão "Limpar" (✕) na caixa de pesquisa
                let btnLimpar = document.getElementById('btnLimparPesquisaEventos');
                if (!btnLimpar) {
                    btnLimpar = document.createElement('span');
                    btnLimpar.id = 'btnLimparPesquisaEventos';
                    btnLimpar.className = 'input-group-text btn-limpar-pesquisa-eventos';
                    btnLimpar.title = 'Limpar pesquisa (Esc)';
                    btnLimpar.setAttribute('role', 'button');
                    btnLimpar.setAttribute('tabindex', '0');
                    btnLimpar.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    `;

                    btnLimpar.addEventListener('mouseenter', () => {
                        btnLimpar.style.setProperty('color', '#dc3545', 'important');
                        btnLimpar.style.setProperty('background-color', '#f8f9fa', 'important');
                    });
                    btnLimpar.addEventListener('mouseleave', () => {
                        btnLimpar.style.setProperty('color', '#6c757d', 'important');
                        btnLimpar.style.setProperty('background-color', '#ffffff', 'important');
                    });

                    const executarLimpeza = (e) => {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        inputPesquisa.value = '';
                        aplicarFiltrosUnificados(false);
                        inputPesquisa.focus();
                    };

                    btnLimpar.addEventListener('click', executarLimpeza);
                    btnLimpar.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            executarLimpeza(e);
                        }
                    });

                    const appendBox = divPesquisa.querySelector('.input-group-append');
                    if (appendBox) {
                        appendBox.insertBefore(btnLimpar, appendBox.firstChild);
                    } else {
                        divPesquisa.appendChild(btnLimpar);
                    }
                }

                // 5. Configuração de eventos do campo de input de pesquisa
                if (!inputPesquisa.dataset.limparEventosConfigurado) {
                    inputPesquisa.dataset.limparEventosConfigurado = "1";
                    
                    const onSearchInput = () => {
                        aplicarFiltrosUnificados(false);
                    };

                    inputPesquisa.addEventListener('input', onSearchInput);
                    inputPesquisa.addEventListener('keyup', (e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            inputPesquisa.value = '';
                            aplicarFiltrosUnificados(false);
                            return;
                        }
                        onSearchInput();
                    });
                    inputPesquisa.addEventListener('change', onSearchInput);
                }

                // Se houver pesquisa prévia ou filtros marcados, aplica imediatamente
                aplicarFiltrosUnificados(false);
            }

            posicionarFiltrosEventos();
            let debounceTimer;
            new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(posicionarFiltrosEventos, 300);
            }).observe(document.body, { childList: true, subtree: true });
        }

        if (document.readyState === 'complete') {
            executar();
        } else {
            window.addEventListener('load', executar, { once: true });
        }
    }
};
