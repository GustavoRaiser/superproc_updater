/**
 * SuperPROC - Módulo: Capa - Localizadores: Navegação & Feito Rápido
 *
 * O que faz: na capa do processo, mostra a barra ◀ Lista (n/N) Feito ▶. As setas vão ao processo anterior/próximo da
 *   lista de onde você veio (o próximo sem "Feito"); o botão Feito insere o localizador escolhido via AJAX, sem recarregar.
 * Onde roda: lista de processos (captura a lista) e capa do processo.
 * Antes de usar: escolha o localizador do botão Feito no popup da extensão (card deste módulo). Não há padrão: sem
 *   escolha o botão fica desativado. A lista de localizadores vem do Smart Localizadores.
 * Dados: a lista de processos fica só na sessão da aba (eproc_lista_processos_capturados e
 *   eproc_nome_localizador_capturado); a escolha do Feito, no storage da extensão
 *   (superproc_custom_settings › <id do módulo> › feito = { id, name }), junto com o Modo Compacto.
 */

import { captureProcessList, publishNavigation } from '../../core/lista_processos.js';
import { iniciarCompacto } from '../capa/_compacto.js';

const REGEX_ID = /^\d+$/;

export default {
    async init(context = {}) {
        const { meta, storage } = context;
        const MODULE_ID = (meta && meta.id) || 'painel_localizadores_lista';
        // Localizador do botão "Feito" escolhido pelo usuário ({ id, name }). Não há padrão: null = nenhum escolhido (botão desativado).
        let feitoCfg = null;
        if (storage && typeof storage.getModuleSettings === 'function') {
            try {
                const cfg = await storage.getModuleSettings(MODULE_ID);
                if (cfg && cfg.feito && REGEX_ID.test(String(cfg.feito.id))) {
                    feitoCfg = { id: String(cfg.feito.id), name: String(cfg.feito.name || '').slice(0, 200) };
                }
            } catch (erro) {
                console.warn('[SuperPROC] Não foi possível ler o localizador do botão Feito:', erro);
            }
        }
        // Modo compacto (botão "Modo Compacto" do card do módulo no popup): as 4 funções viram UM botão segmentado
        // (◀ | n/N | ✅ | ▶), cada parte continua com a sua função. Ao mudar a opção, a barra é refeita na hora.
        let reinjetarNav = null;
        const compacto = await iniciarCompacto({
            meta: meta || { id: MODULE_ID }, storage, classe: 'eproc-compacto-lista',
            aoMudar: () => { if (reinjetarNav) reinjetarNav(); }
        });

        if (!document.getElementById('superproc-memo-hide-css')) {
            const styleMemo = document.createElement('style');
            styleMemo.id = 'superproc-memo-hide-css';
            styleMemo.textContent = `
                a[title*="Incluir Memo em localizador"],
                a[title*="Incluir Memo em documento"],
                a[aria-label*="Incluir Memo em localizador"],
                a[aria-label*="Incluir Memo em documento"],
                a[class*="memoLocalizadorOrgao"],
                a.infraDocumentoTooltip[aria-label="Memo"] {
                    display: none !important;
                }
            `;
            (document.head || document.documentElement).appendChild(styleMemo);
        }

        const STORAGE_KEY_LISTA = 'eproc_lista_processos_capturados';
        const STORAGE_KEY_NOME = 'eproc_nome_localizador_capturado';

        // ---- Botão Feito personalizável ----
        const idFeito = () => (feitoCfg ? feitoCfg.id : null);
        const nomeFeito = () => {
            if (!feitoCfg) return 'Feito';
            const curto = feitoCfg.name.split(' - ')[0].replace(/\s*[✅✔☑✓]\ufe0f?\s*/g, ' ').trim() || 'Localizador';
            return curto.length > 22 ? curto.slice(0, 21) + '…' : curto;
        };
        const rotuloFeito = () => (compacto.ativo() ? '✅' : `✅ ${nomeFeito()}`);
        const rotuloFeitoOk = () => (compacto.ativo() ? '✔' : `✔ ${nomeFeito()}!`);
        const dicaFeito = () => (feitoCfg
            ? `Inserir localizador "${feitoCfg.name || feitoCfg.id}" (alterável no popup da extensão SuperPROC).`
            : 'Botão Feito desativado: escolha o localizador no popup da extensão SuperPROC (Capa › Localizadores - Navegação & Feito Rápido).');

        // Sem localizador escolhido o botão existe, mas fica desativado (nada é inserido por engano).
        function aplicarEstadoFeito(botao) {
            const semEscolha = !feitoCfg;
            botao.disabled = semEscolha;
            botao.style.opacity = semEscolha ? '0.55' : '';
            botao.style.cursor = semEscolha ? 'not-allowed' : 'pointer';
        }

        // Reage em tempo real à escolha feita no popup da extensão (card deste módulo).
        function aplicarConfig(valor) {
            feitoCfg = valor && REGEX_ID.test(String(valor.id)) ? { id: String(valor.id), name: String(valor.name || '').slice(0, 200) } : null;
            const botao = document.getElementById('superproc-btn-feito');
            if (botao) { botao.textContent = rotuloFeito(); botao.title = dicaFeito(); aplicarEstadoFeito(botao); }
        }
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
                chrome.storage.onChanged.addListener((mudancas) => {
                    const novo = mudancas.superproc_custom_settings && mudancas.superproc_custom_settings.newValue;
                    if (novo && novo[MODULE_ID]) aplicarConfig(novo[MODULE_ID].feito);
                });
            }
        } catch (_) {}

        const isCapaProcesso = window.location.href.includes('acao=processo_selecionar');

        // Navegação rápida da lista (anterior/próximo/modal): o navegador NÃO deve empilhar o processo como "relacionado".
        // Marcador no DOM (visível a qualquer mundo de script): carimbo de hora; o host (pilha-relacionados) lê e apaga.
        function marcarSemPilha() {
            try { document.documentElement.setAttribute('data-superproc-sem-pilha', String(Date.now())); } catch (_) {}
        }

        function fecharArvoreAutomaticamente() {
            console.log('[SUPERPROC_CMD_FECHAR_ARVORE]');

            // 1. BroadcastChannel: Árvore - Abre&Fecha (comunicação cross-tab padrão eproc)
            try {
                const canal = new BroadcastChannel('eproc_channel_sync');
                canal.postMessage({ tipo: 'FECHAR_TODAS_AS_FILHAS' });
                canal.postMessage({ tipo: 'FECHAR_IMEDIATO' });
                setTimeout(() => {
                    try { canal.close(); } catch (_) {}
                }, 800);
            } catch (_) {}

            // 2. Extensão AZflow: comando nativo para fechar todas as árvores
            try {
                if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'f4FecharTodasArvores' }, () => {
                        if (chrome.runtime.lastError) {}
                    });
                }
            } catch (_) {}

            // 3. Evento nativo DOM para extensões/scripts injetados
            try {
                window.dispatchEvent(new CustomEvent('superproc-fechar-arvore'));
                window.postMessage({ type: 'SUPERPROC_FECHAR_ARVORE' }, '*');
            } catch (_) {}
        }

        // 1. CAPTURA NA LISTA DE PROCESSOS E FORÇAGEM DE MESMA ABA
        if (!isCapaProcesso) {
            let ultimaListaStr = "";

            document.addEventListener('click', function(e) {
                const link = e.target.closest('a[href*="acao=processo_selecionar"]');
                if (link && link.href && link.closest('table')) {
                    const match = link.textContent.trim().match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
                    if (match) {
                        fecharArvoreAutomaticamente();
                        // O clique pertence à navegação rápida: impede scripts
                        // de gestos de abrir outra aba, mesmo com target=_self.
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        link.setAttribute('target', '_self');
                        processarPaginaLista();
                        window.location.assign(link.href);
                    }
                }
            }, true);

            function capturarNomeLocalizador() {
                const relatorioPesquisa = document.querySelector('#container_criterios_pesquisa li p');
                if (relatorioPesquisa && relatorioPesquisa.textContent.trim()) {
                    return relatorioPesquisa.textContent.trim();
                }

                const btnBootstrap = document.querySelector('button[data-id="selLocalizador"]');
                if (btnBootstrap) {
                    const titleAttr = btnBootstrap.getAttribute('title');
                    if (titleAttr && titleAttr.trim() && titleAttr.trim() !== 'Nada selecionado') {
                        return titleAttr.trim();
                    }
                    const inner = btnBootstrap.querySelector('.filter-option-inner-inner');
                    if (inner && inner.textContent.trim()) {
                        return inner.textContent.trim();
                    }
                }

                const select = document.getElementById('selLocalizador') || document.querySelector('select[name="selLocalizador"]');
                if (select && select.selectedIndex >= 0) {
                    const optText = select.options[select.selectedIndex].text;
                    if (optText && optText.trim()) return optText.trim();
                }

                return 'Lista de Processos';
            }

            function processarPaginaLista() {
                const links = Array.from(document.querySelectorAll('table a[href*="acao=processo_selecionar"]'));
                const listaProcessos = captureProcessList(document, location.href, feitoCfg ? feitoCfg.name : undefined);

                links.forEach(a => {
                    const match = a.textContent.trim().match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
                    if (match) {
                        
                        if (a.getAttribute('target') !== '_self') {
                            a.setAttribute('target', '_self');
                        }
                    }
                });

                if (listaProcessos.length > 0) {
                    const novaListaStr = JSON.stringify(listaProcessos);
                    if (novaListaStr !== ultimaListaStr) {
                        publishNavigation(listaProcessos, capturarNomeLocalizador());
                        ultimaListaStr = novaListaStr;
                        
                        const nome = capturarNomeLocalizador();
                        if (nome) {
                            sessionStorage.setItem(STORAGE_KEY_NOME, nome);
                        }
                    }
                }
            }

            processarPaginaLista();

            let debounceTimer;
            const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(processarPaginaLista, 300);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // 2. PAINEL DE NAVEGAÇÃO E BOTÃO FEITO NA CAPA DO PROCESSO
        if (isCapaProcesso) {
            function injetarEstilosNavegacao() {
                if (document.getElementById('superproc-nav-style')) return;
                const st = document.createElement('style');
                st.id = 'superproc-nav-style';
                st.textContent = `
                    #eproc-nav-container {
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 1px !important;
                        margin-left: 0 !important;
                        margin-right: 8px !important;
                        vertical-align: middle !important;
                        align-self: center !important;
                        margin-top: 0 !important;
                    }
                    #eproc-nav-container .btn-nav-eproc {
                        height: 31px !important;
                        min-height: 31px !important;
                        box-sizing: border-box !important;
                        margin: 0 !important;
                        line-height: 1 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        border-radius: 4px !important;
                        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important;
                        font-weight: 400 !important;
                        color: #343a40 !important;
                        transition: all 0.15s ease !important;
                    }
                    #eproc-nav-container .btn-nav-eproc:hover:not(:disabled) {
                        filter: brightness(0.96) !important;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.08) !important;
                    }
                    /* Modo compacto: um único botão segmentado; cada parte mantém a sua função. */
                    body.eproc-compacto-lista #eproc-nav-container { gap: 0 !important; }
                    body.eproc-compacto-lista #eproc-nav-container .btn-nav-eproc {
                        width: auto !important; min-width: 0 !important; padding: 0 8px !important;
                        border-radius: 0 !important; margin-left: -1px !important;
                    }
                    body.eproc-compacto-lista #eproc-nav-container .btn-nav-eproc:first-child {
                        border-radius: 4px 0 0 4px !important; margin-left: 0 !important;
                    }
                    body.eproc-compacto-lista #eproc-nav-container .btn-nav-eproc:last-child {
                        border-radius: 0 4px 4px 0 !important;
                    }
                    body.eproc-compacto-lista #eproc-nav-container .btn-nav-eproc:hover:not(:disabled) { position: relative; z-index: 1; }
                    body.eproc-compacto-lista #eproc-nav-container .sp-lbl { display: none !important; }
                `;
                document.head.appendChild(st);
            }

            function injetarBotoesNavegacao() {
                const listaData = sessionStorage.getItem(STORAGE_KEY_LISTA);
                if (!listaData) return;

                injetarEstilosNavegacao();

                const selUnidades = document.getElementById('selInfraUnidades');
                const targetNavbar = selUnidades ? (selUnidades.closest('.d-none.d-lg-block') || selUnidades.closest('form')) : null;

                const existingNav = document.getElementById('eproc-nav-container');
                if (existingNav) {
                    if (targetNavbar && targetNavbar.parentNode && existingNav.parentNode !== targetNavbar.parentNode) {
                        existingNav.style.marginTop = '0';
                        targetNavbar.parentNode.insertBefore(existingNav, targetNavbar.nextSibling);
                    } else if (targetNavbar && targetNavbar.parentNode) {
                        existingNav.style.marginTop = '0';
                    }
                    return;
                }

                const lista = JSON.parse(listaData);
                const nomeLocalizador = sessionStorage.getItem(STORAGE_KEY_NOME) || 'Localizador';
                
                const params = new URLSearchParams(window.location.search);
                const numAtualParam = params.get('num_processo');

                const indexAtual = lista.findIndex(p => p.numero.replace(/\D/g, '') === (numAtualParam ? numAtualParam.replace(/\D/g, '') : ''));

                const targetBtn = document.getElementById('btnDownloadCompletoRS') || document.querySelector('button[aria-label="Download Completo"]');
                const barraComandos = document.getElementById('divInfraBarraComandosSuperior') || document.querySelector('.eproc-barra-superior-flutuante') || document.getElementById('fldCapa');
                if (!targetNavbar && !targetBtn && !barraComandos) return;

                const navContainer = document.createElement('div');
                navContainer.id = 'eproc-nav-container';
                navContainer.style.display = 'inline-flex';
                navContainer.style.alignItems = 'center';
                navContainer.style.gap = '1px';
                navContainer.style.marginLeft = '0';
                navContainer.style.marginRight = '8px';
                navContainer.style.verticalAlign = 'middle';
                navContainer.style.alignSelf = 'center';
                navContainer.style.marginTop = '0';

                // Botão ANTERIOR (◀)
                const btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.className = 'infraButton btn-nav-eproc';
                btnPrev.textContent = '◀';
                btnPrev.title = 'Processo Anterior';
                btnPrev.style.width = '31px';
                btnPrev.style.height = '31px';
                btnPrev.style.minWidth = '31px';
                btnPrev.style.minHeight = '31px';
                btnPrev.style.padding = '0';
                btnPrev.style.display = 'inline-flex';
                btnPrev.style.alignItems = 'center';
                btnPrev.style.justifyContent = 'center';
                btnPrev.style.fontSize = '11px';
                btnPrev.style.boxSizing = 'border-box';
                btnPrev.style.borderRadius = '4px';

                if (indexAtual > 0) {
                    btnPrev.onclick = () => {
                        fecharArvoreAutomaticamente();
                        marcarSemPilha();
                        window.location.href = lista[indexAtual - 1].url;
                    };
                    btnPrev.style.background = '#ffffff';
                    btnPrev.style.color = '#343a40';
                    btnPrev.style.border = '1px solid #cbd5e1';
                    btnPrev.style.cursor = 'pointer';
                } else {
                    btnPrev.disabled = true;
                    btnPrev.style.background = '#ffffff';
                    btnPrev.style.color = '#cbd5e1';
                    btnPrev.style.border = '1px solid #e2e8f0';
                    btnPrev.style.cursor = 'not-allowed';
                    btnPrev.style.opacity = '1';
                }

                // Botão LISTA (LISTA (X/Y))
                const btnLista = document.createElement('button');
                btnLista.type = 'button';
                btnLista.className = 'infraButton btn-nav-eproc';
                // "LISTA (" e ")" ficam em spans que o modo compacto esconde, sobrando só "n/N".
                const spRotulo = (t) => { const e = document.createElement('span'); e.className = 'sp-lbl'; e.textContent = t; return e; };
                const spNum = document.createElement('span');
                spNum.textContent = `${indexAtual >= 0 ? indexAtual + 1 : '?'}/${lista.length}`;
                btnLista.append(spRotulo('LISTA ('), spNum, spRotulo(')'));
                btnLista.title = 'Abrir Lista de Processos';
                btnLista.style.height = '31px';
                btnLista.style.minHeight = '31px';
                btnLista.style.padding = '0 10px';
                btnLista.style.fontSize = '11px';
                btnLista.style.fontWeight = '400';
                btnLista.style.background = '#ffffff';
                btnLista.style.color = '#343a40';
                btnLista.style.border = '1px solid #cbd5e1';
                btnLista.style.borderRadius = '4px';
                btnLista.style.cursor = 'pointer';
                btnLista.style.display = 'inline-flex';
                btnLista.style.alignItems = 'center';
                btnLista.style.justifyContent = 'center';
                btnLista.style.boxSizing = 'border-box';
                btnLista.onclick = () => alternarModalLista(JSON.parse(sessionStorage.getItem(STORAGE_KEY_LISTA) || '[]'), indexAtual, nomeLocalizador);

                // Botão FEITO ✅
                const btnFeito = document.createElement('button');
                btnFeito.type = 'button';
                btnFeito.id = 'superproc-btn-feito';
                btnFeito.className = 'infraButton btn-nav-eproc';
                btnFeito.textContent = rotuloFeito();
                btnFeito.title = dicaFeito();
                btnFeito.style.height = '31px';
                btnFeito.style.minHeight = '31px';
                btnFeito.style.padding = '0 10px';
                btnFeito.style.fontSize = '11px';
                btnFeito.style.fontWeight = '400';
                btnFeito.style.backgroundColor = '#dcfce7';
                btnFeito.style.color = '#15803d';
                btnFeito.style.border = '1px solid #86efac';
                btnFeito.style.borderRadius = '4px';
                btnFeito.style.cursor = 'pointer';
                btnFeito.style.display = 'inline-flex';
                btnFeito.style.alignItems = 'center';
                btnFeito.style.justifyContent = 'center';
                btnFeito.style.boxSizing = 'border-box';
                aplicarEstadoFeito(btnFeito);

                // Botão PRÓXIMO (▶)
                const btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.className = 'infraButton btn-nav-eproc';
                btnNext.textContent = '▶';
                btnNext.title = 'Próximo processo sem Feito';
                btnNext.style.width = '31px';
                btnNext.style.height = '31px';
                btnNext.style.minWidth = '31px';
                btnNext.style.minHeight = '31px';
                btnNext.style.padding = '0';
                btnNext.style.display = 'inline-flex';
                btnNext.style.alignItems = 'center';
                btnNext.style.justifyContent = 'center';
                btnNext.style.fontSize = '11px';
                btnNext.style.boxSizing = 'border-box';
                btnNext.style.borderRadius = '4px';

                const nextIndex = indexAtual >= 0 ? lista.findIndex((item, index) => index > indexAtual && !item.feito) : -1;
                if (nextIndex >= 0) {
                    btnNext.onclick = () => {
                        fecharArvoreAutomaticamente();
                        marcarSemPilha();
                        window.location.href = lista[nextIndex].url;
                    };
                    btnNext.style.background = '#ffffff';
                    btnNext.style.color = '#343a40';
                    btnNext.style.border = '1px solid #cbd5e1';
                    btnNext.style.cursor = 'pointer';
                } else {
                    btnNext.disabled = true;
                    btnNext.style.background = '#ffffff';
                    btnNext.style.color = '#cbd5e1';
                    btnNext.style.border = '1px solid #e2e8f0';
                    btnNext.style.cursor = 'not-allowed';
                    btnNext.style.opacity = '1';
                }

                btnFeito.onclick = () => {
                    const id = idFeito();
                    if (id) executarInsercaoDiretaAjax(id, btnFeito);
                };

                navContainer.appendChild(btnPrev);
                navContainer.appendChild(btnLista);
                navContainer.appendChild(btnFeito);
                navContainer.appendChild(btnNext);

                if (targetNavbar && targetNavbar.parentNode) {
                    targetNavbar.parentNode.insertBefore(navContainer, targetNavbar.nextSibling);
                } else if (targetBtn && targetBtn.parentNode) {
                    targetBtn.parentNode.insertBefore(navContainer, targetBtn.nextSibling);
                } else if (barraComandos) {
                    if (barraComandos.id === 'fldCapa') {
                        barraComandos.parentNode.insertBefore(navContainer, barraComandos);
                    } else {
                        barraComandos.appendChild(navContainer);
                        const parentFlutuante = barraComandos.closest('.eproc-barra-superior-flutuante');
                        if (parentFlutuante) parentFlutuante.style.display = '';
                    }
                }
            }

            async function executarInsercaoDiretaAjax(idLocalizador, btnEl) {
                btnEl.disabled = true;
                btnEl.textContent = '⏳ Salvando...';

                try {
                    const html = document.documentElement.innerHTML;
                    const matchAlterar = Array.from(html.matchAll(/controlador_ajax\.php\?acao_ajax=alterar_localizadores&idProcesso=([^&"'<>]+)&hash=([^&"'<>]+)/gi));
                    
                    if (!matchAlterar || matchAlterar.length === 0) {
                        throw new Error('Tokens AJAX não localizados nesta capa.');
                    }

                    const ultimoMatch = matchAlterar[matchAlterar.length - 1];
                    const idProcesso = ultimoMatch[1];
                    const hashAlterar = ultimoMatch[2];

                    let idsAtuais = [];
                    const hdn = document.getElementById('hdnSelLocalizadoresProcesso');
                    if (hdn && hdn.value) {
                        try {
                            const json = hdn.value
                                .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
                                .replace(/:\s*'([^']*)'/g, (_, v) => ': "' + String(v).replace(/"/g, '\\"') + '"');
                            const parsed = JSON.parse(json);
                            if (Array.isArray(parsed)) {
                                idsAtuais = parsed.map(it => String(it.id)).filter(Boolean);
                            }
                        } catch (_) {}
                    }

                    if (!idsAtuais.includes(String(idLocalizador))) {
                        idsAtuais.push(String(idLocalizador));
                    }

                    const body = new URLSearchParams();
                    body.set('strNovosLocalizadores', idsAtuais.join(','));
                    body.set('strLocalizadoresDesativados', '');

                    const urlAlterar = `controlador_ajax.php?acao_ajax=alterar_localizadores&idProcesso=${encodeURIComponent(idProcesso)}&hash=${encodeURIComponent(hashAlterar)}`;

                    const resp = await fetch(urlAlterar, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': 'application/json, text/javascript, */*; q=0.01'
                        },
                        body: body.toString(),
                        credentials: 'same-origin'
                    });

                    if (!resp.ok) throw new Error('Falha ao comunicar com o servidor.');

                    const resJson = await resp.json();

                    if (resJson && resJson.error === true) {
                        throw new Error(resJson.msg || 'Erro retornado pelo servidor.');
                    }

                    if (resJson && resJson.html !== undefined) {
                        const divLoc = document.getElementById('dvLocalizadoresOrgao');
                        const divContainer = document.getElementById('dvLocalizadores');

                        divLoc?.removeAttribute('data-superproc-resposta-aplicada');
                        document.dispatchEvent(new CustomEvent('superproc:aplicar-resposta-localizadores', {
                            detail: JSON.stringify({ html: resJson.html, ids: idsAtuais.join(',') })
                        }));
                        const respostaAplicada = divLoc?.getAttribute('data-superproc-resposta-aplicada') === '1';
                        divLoc?.removeAttribute('data-superproc-resposta-aplicada');

                        if (!respostaAplicada && resJson.html === '') {
                            if (divContainer) divContainer.style.display = 'none';
                            if (divLoc) divLoc.style.display = 'none';
                        } else if (!respostaAplicada) {
                            if (divLoc) {
                                divLoc.innerHTML = resJson.html;
                                divLoc.style.display = '';
                            }
                            if (divContainer) {
                                divContainer.style.display = 'none';
                            }
                        }

                        // Aciona rotinas nativas do Eproc para sincronizar estado interno e select2
                        if (!respostaAplicada) try {
                            const scr = document.createElement('script');
                            scr.textContent = `
                                try {
                                    if (typeof window.recarregarLocalizadoresProcesso === 'function') {
                                        window.recarregarLocalizadoresProcesso();
                                    }
                                } catch(e) {}
                            `;
                            (document.head || document.documentElement).appendChild(scr);
                            scr.remove();
                        } catch(e) {}

                        // Notifica módulos do SuperPROC para reprocessar cores e ordenação
                        window.dispatchEvent(new CustomEvent('superproc:localizadores-atualizados', { detail: { idLocalizador } }));
                    }

                    const savedList = JSON.parse(sessionStorage.getItem(STORAGE_KEY_LISTA) || '[]');
                    const current = new URLSearchParams(location.search).get('num_processo') || new URLSearchParams(location.search).get('txtNumProcesso') || '';
                    const savedItem = savedList.find(item => item.numero.replace(/\D/g, '') === current.replace(/\D/g, ''));
                    if (savedItem) { savedItem.feito = true; sessionStorage.setItem(STORAGE_KEY_LISTA, JSON.stringify(savedList)); }
                    document.getElementById('eproc-modal-lista')?.remove();
                    btnEl.textContent = rotuloFeitoOk();
                    setTimeout(() => {
                        btnEl.disabled = false;
                        btnEl.textContent = rotuloFeito();
                    }, 2000);

                } catch (e) {
                    console.error('[SuperPROC] Erro ao salvar localizador via AJAX:', e);
                    btnEl.disabled = false;
                    btnEl.textContent = '❌ Erro';
                    alert('Não foi possível gravar o localizador: ' + (e.message || e));
                }
            }

            function alternarModalLista(lista, indexAtual, nomeLocalizador) {
                let modal = document.getElementById('eproc-modal-lista');
                if (modal) {
                    modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
                    return;
                }

                modal = document.createElement('div');
                modal.id = 'eproc-modal-lista';
                Object.assign(modal.style, {
                    position: 'fixed',
                    top: '55px',
                    right: '25px',
                    width: '450px',
                    maxHeight: '75vh',
                    backgroundColor: '#ffffff',
                    border: '2px solid #0056b3',
                    borderRadius: '6px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    zIndex: '999999',
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '13px'
                });

                const header = document.createElement('div');
                Object.assign(header.style, {
                    backgroundColor: '#0056b3',
                    color: '#fff',
                    padding: '8px 12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px'
                });

                const titleText = `${nomeLocalizador} - ${lista.length}`;
                header.innerHTML = `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${titleText}">${titleText}</span><span style="cursor:pointer;font-size:16px;line-height:1;" onclick="document.getElementById('eproc-modal-lista').style.display='none'">&times;</span>`;

                const listContent = document.createElement('div');
                Object.assign(listContent.style, {
                    overflowY: 'auto',
                    flex: '1',
                    padding: '4px 0'
                });

                lista.forEach((item, idx) => {
                    const row = document.createElement('div');
                    const isSelected = idx === indexAtual;

                    Object.assign(row.style, {
                        padding: '7px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #e0e0e0',
                        backgroundColor: isSelected ? '#bbf7d0' : (idx % 2 === 0 ? '#f4f4f4' : '#e5e7eb'),
                        color: isSelected ? '#065f46' : '#222',
                        fontWeight: isSelected ? 'bold' : 'normal'
                    });

                    row.innerHTML = `<span><strong>${idx + 1}.</strong> ${item.numero}${item.feito ? ' · ✅ Feito' : ''}</span> ${isSelected ? '<span>✔ Atual</span>' : ''}`;
                    row.onclick = () => {
                        fecharArvoreAutomaticamente();
                        marcarSemPilha();
                        window.location.href = item.url;
                    };
                    listContent.appendChild(row);
                });

                modal.appendChild(header);
                modal.appendChild(listContent);
                document.body.appendChild(modal);
            }

            reinjetarNav = () => { const antigo = document.getElementById('eproc-nav-container'); if (antigo) antigo.remove(); injetarBotoesNavegacao(); };
            injetarBotoesNavegacao();
            let attempts = 0;
            const checkTimer = setInterval(() => {
                attempts++;
                injetarBotoesNavegacao();
                if (document.getElementById('eproc-nav-container') || attempts > 20) {
                    clearInterval(checkTimer);
                }
            }, 300);
        }
    }
};
