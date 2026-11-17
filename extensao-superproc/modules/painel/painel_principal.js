/**
 * SuperPROC - Módulo: Painel Principal (Secretaria)
 * 
 * Funcionalidades:
 * 1. Organização do painel em 2 colunas equilibradas com auto-balanceamento vertical.
 * 2. Botões "Atualizar Tudo" e "Reordenar" na barra superior.
 * 3. Botões individuais para alternar blocos entre as colunas esquerda e direita.
 * 4. Bloco dobrável de "Ocultos" com contador dinâmico e opção de ocultar/restaurar.
 * 5. Normalização de links para navegação na mesma aba.
 */

export default {
    id: 'painel_principal',
    name: 'Painel Principal - Ocultação & Colunas',
    category: 'Painel & Menus',
    description: 'Layout em 2 colunas no painel da secretaria, botão Atualizar Tudo, ocultação e restauração de blocos.',
    defaultEnabled: false,

    matches: (url, params) => {
        const acao = params.get('acao') || '';
        if (acao === 'processo_selecionar' || params.has('num_processo')) return false;
        return acao === 'painel_secretaria_listar' || 
               url.pathname.includes('painel_secretaria') ||
               Boolean(document.getElementById('divPainel'));
    },

    async init() {
        if (window.__superprocPainelPrincipalInjetado) return;
        window.__superprocPainelPrincipalInjetado = true;
        document.body.classList.add('superproc-painel-ativo');

        const STORAGE_OCULTOS = 'eproc_blocos_ocultos_v20';
        const STORAGE_COLUNAS = 'eproc_blocos_colunas_v20';

        function getSalvos(key) {
            try { 
                const val = localStorage.getItem(key);
                return val ? JSON.parse(val) : (key === STORAGE_COLUNAS ? {} : []); 
            } catch(e) { 
                return key === STORAGE_COLUNAS ? {} : []; 
            }
        }

        function setSalvos(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.warn('[SuperPROC: PainelPrincipal] Erro ao salvar storage:', e);
            }
        }

        // --- INTERCEPTAÇÃO GLOBAL PARA ABRIR NA MESMA ABA ---
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link) return;

            if (
                link.classList.contains('btn-ocultar-item') ||
                link.classList.contains('btn-trocar-coluna-custom') ||
                link.classList.contains('azflow-botao-reordenar') ||
                link.id === 'btnAtualizarGeralCustom' ||
                link.closest('#blocoOcultosHeader')
            ) {
                return;
            }

            const href = link.getAttribute('href') || '';
            const onclick = link.getAttribute('onclick') || '';

            if (onclick.includes('window.open')) {
                const match = onclick.match(/window\.open\(['"]([^'"]+)['"]/);
                if (match && match[1]) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.location.href = match[1].replace(/&amp;/g, '&');
                    return;
                }
            }

            if (href.startsWith('javascript:') && href.includes('window.open')) {
                const match = href.match(/window\.open\(['"]([^'"]+)['"]/);
                if (match && match[1]) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.location.href = match[1].replace(/&amp;/g, '&');
                    return;
                }
            }

            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                link.removeAttribute('target');
                link.setAttribute('target', '_self');
                
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.location.href = link.href;
                }
            }
        }, true);

        // Estilos CSS
        if (!document.getElementById('superproc-painel-style')) {
            const style = document.createElement('style');
            style.id = 'superproc-painel-style';
            style.textContent = `
                body.superproc-painel-ativo p[style*="text-align:justify"] { display: none !important; }
                body.superproc-painel-ativo .eproc-barra-superior-flutuante.mb-2,
                body.superproc-painel-ativo #divInfraBarraComandosSuperior,
                body.superproc-painel-ativo #divInfraBarraLocalizacao { display: none !important; }

                #eprocCustomToolbarTop {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    padding: 5px 0;
                    width: 100%;
                }

                #divPainel {
                    display: flex !important;
                    flex-direction: row !important;
                    gap: 15px !important;
                    align-items: flex-start !important;
                }

                .eproc-coluna-independente {
                    flex: 1 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 15px !important;
                    min-width: 0 !important;
                    transition: margin-top 0.2s ease;
                }

                #divPainel fieldset {
                    width: 100% !important;
                    margin: 0 !important;
                }

                #divPainel > br { display: none !important; }

                #blocoOcultosWrapper {
                    width: 100% !important;
                    clear: both !important;
                    margin-top: 25px !important;
                    margin-bottom: 30px !important;
                    border: 1px dashed #b0b0b0;
                    background: #f8f9fa;
                    border-radius: 4px;
                    font-family: Arial, sans-serif;
                }

                #blocoOcultosHeader {
                    padding: 10px 15px;
                    cursor: pointer;
                    font-weight: bold;
                    background: #e2e6ea;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    user-select: none;
                    border-radius: 4px;
                }

                #blocoOcultosWrapper.aberto #blocoOcultosHeader {
                    border-radius: 4px 4px 0 0;
                }

                #blocoOcultosBody {
                    display: none !important;
                    padding: 15px;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 15px;
                }

                #blocoOcultosWrapper.aberto #blocoOcultosBody {
                    display: grid !important;
                }

                #blocoOcultosBody fieldset {
                    width: 100% !important;
                    margin: 0 !important;
                }

                .btn-ocultar-item {
                    float: right;
                    font-size: 9px !important;
                    cursor: pointer;
                    color: #333;
                    background: #e0e0e0;
                    padding: 1px 6px !important;
                    border-radius: 3px;
                    border: 1px solid #ccc;
                    opacity: 0.6;
                    transition: opacity 0.2s ease;
                    margin-left: 4px;
                    display: inline-flex;
                    align-items: center;
                    height: 18px;
                    box-sizing: border-box;
                    text-decoration: none !important;
                }
                .btn-ocultar-item:hover {
                    opacity: 1;
                    background: #d0d0d0;
                    color: #000;
                }

                .btn-trocar-coluna-custom {
                    float: right !important;
                    margin-left: 4px !important;
                    cursor: pointer !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: auto !important;
                    height: 18px !important;
                    border-radius: 3px !important;
                    border: 1px solid rgb(217, 220, 225) !important;
                    background: rgb(248, 250, 252) !important;
                    padding: 0 5px !important;
                    box-sizing: border-box !important;
                    opacity: 0.7;
                    transition: opacity 0.2s ease;
                    text-decoration: none !important;
                }
                .btn-trocar-coluna-custom:hover {
                    opacity: 1;
                    background: #e2e6ea;
                }
                .btn-trocar-coluna-custom svg {
                    transform: rotate(90deg) !important;
                    width: 10px !important;
                    height: 10px !important;
                }
                .azflow-botao-reordenar-original {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        function acionarAtualizarTudo() {
            // Não clique indiscriminadamente em todos os elementos cujo onclick
            // contenha "conta". O eProc possui controles mestre e filho com
            // essa palavra; dispará-los juntos multiplicava as mesmas chamadas
            // AJAX e podia concorrer com telas de minuta abertas.
            const agora = Date.now();
            if (window.__superprocPainelAtualizacaoEmCurso || (agora - (window.__superprocPainelUltimaAtualizacao || 0)) < 5000) {
                return;
            }
            window.__superprocPainelAtualizacaoEmCurso = true;
            window.__superprocPainelUltimaAtualizacao = agora;

            const seletoresMestres = [
                '#atualizaRelatoriosTodas',
                '#atualizaMinutasTodas',
                '#atualizaMeusLocalizadoresTodas',
                '#atualizarListaDeProcessosPorLocalizadorTodas'
            ];
            const vistos = new Set();
            const botoesAtualizacao = seletoresMestres
                .flatMap(seletor => Array.from(document.querySelectorAll(seletor)))
                .filter(el => el && !vistos.has(el) && (vistos.add(el), true));

            botoesAtualizacao.forEach((el, indice) => {
                // Cada controle mestre pode gerar suas próprias chamadas AJAX.
                // Espaçá-los evita uma rajada concorrente sobre a sessão PHP.
                window.setTimeout(() => {
                    try { el.click(); } catch (_) {}
                    if (indice === botoesAtualizacao.length - 1) {
                        window.setTimeout(() => { window.__superprocPainelAtualizacaoEmCurso = false; }, 900);
                    }
                }, indice * 900);
            });

            if (botoesAtualizacao.length === 0) {
                window.__superprocPainelAtualizacaoEmCurso = false;
            }
        }

        function normalizarLinksParaMesmaAba() {
            const links = document.querySelectorAll('#divPainel a[target="_blank"], #blocoOcultosBody a[target="_blank"]');
            links.forEach(a => {
                a.removeAttribute('target');
                a.setAttribute('target', '_self');
            });
        }

        function iniciarPainel() {
            const divPainel = document.getElementById('divPainel');
            if (!divPainel) return;

            let toolbarTop = document.getElementById('eprocCustomToolbarTop');
            if (!toolbarTop) {
                toolbarTop = document.createElement('div');
                toolbarTop.id = 'eprocCustomToolbarTop';
                toolbarTop.innerHTML = `
                    <a id="btnReordenarToolbarCustom" class="azflow-botao-reordenar infraLegendObrigatorio" title="Reordenar" role="button" tabindex="0" aria-label="Reordenar blocos" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 22px; border-radius: 3px; border: 1px solid rgb(217, 220, 225); background: rgb(248, 250, 252); padding: 0 8px; font-size: 12px; font-weight: 500; text-decoration: none; color: #333;">
                        <div style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; opacity: 0.7;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;"><path d="m3 16 4 4 4-4"></path><path d="M7 20V4"></path><path d="m21 8-4-4-4 4"></path><path d="M17 4v16"></path></svg>
                        </div>
                        Reordenar
                    </a>

                    <a id="btnAtualizarGeralCustom" title="Atualizar Todos os Relatórios e Localizadores" role="button" tabindex="0" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 22px; border-radius: 3px; border: 1px solid rgb(217, 220, 225); background: rgb(248, 250, 252); padding: 0 8px; font-size: 12px; font-weight: 500; text-decoration: none; color: #333;">
                        <div style="width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; opacity: 0.7;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.63-5.38"/></svg>
                        </div>
                        Atualizar Tudo
                    </a>
                `;
                divPainel.parentNode.insertBefore(toolbarTop, divPainel);

                const btnReordenar = document.getElementById('btnReordenarToolbarCustom');
                if (btnReordenar) {
                    btnReordenar.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // 1. Tenta clicar no botão original da barra oculta do AZFlow
                        const btnBarra = document.querySelector('.eproc-barra-superior-flutuante .azflow-botao-reordenar, #divInfraBarraComandosSuperior .azflow-botao-reordenar');
                        if (btnBarra && btnBarra !== btnReordenar) {
                            btnBarra.click();
                            return;
                        }

                        // 2. Tenta clicar no botão original do AZFlow preservado nos fieldsets
                        const btnOrig = document.querySelector('.azflow-botao-reordenar-original, fieldset a.azflow-botao-reordenar:not(#btnReordenarToolbarCustom):not(.btn-trocar-coluna-custom)');
                        if (btnOrig && btnOrig !== btnReordenar) {
                            btnOrig.click();
                            return;
                        }

                        // 3. Fallback para função global AZFlow
                        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                        if (win.azflow && typeof win.azflow.reordenar === 'function') {
                            win.azflow.reordenar();
                        } else if (typeof win.reordenarBlocos === 'function') {
                            win.reordenarBlocos();
                        }
                    });
                }

                document.getElementById('btnAtualizarGeralCustom').addEventListener('click', (e) => {
                    e.preventDefault();
                    acionarAtualizarTudo();
                });
            }

            let ocultosWrapper = document.getElementById('blocoOcultosWrapper');
            if (!ocultosWrapper) {
                ocultosWrapper = document.createElement('div');
                ocultosWrapper.id = 'blocoOcultosWrapper';
                ocultosWrapper.innerHTML = `
                    <div id="blocoOcultosHeader">
                        <span>[+] OCULTOS (<span id="contadorOcultos">0</span>)</span>
                        <span id="setaOcultos">▼</span>
                    </div>
                    <div id="blocoOcultosBody"></div>
                `;
                divPainel.parentNode.insertBefore(ocultosWrapper, divPainel.nextSibling);

                document.getElementById('blocoOcultosHeader').addEventListener('click', () => {
                    const isOpen = ocultosWrapper.classList.toggle('aberto');
                    document.getElementById('setaOcultos').textContent = isOpen ? '▲' : '▼';
                });
            }

            const bodyOcultos = document.getElementById('blocoOcultosBody');
            const contador = document.getElementById('contadorOcultos');

            function getTituloBloco(bloco) {
                const legend = bloco.querySelector('legend');
                if (!legend) return '';
                const clone = legend.cloneNode(true);
                clone.querySelectorAll('button, a').forEach(el => el.remove());
                return clone.textContent.trim();
            }

            function atualizarContador() {
                const qtd = bodyOcultos.querySelectorAll('fieldset').length;
                contador.textContent = qtd;
            }

            let colunaEsq = divPainel.querySelector('.eproc-coluna-esq');
            let colunaDir = divPainel.querySelector('.eproc-coluna-dir');

            if (!colunaEsq || !colunaDir) {
                const blocosIniciais = Array.from(divPainel.querySelectorAll('fieldset'));
                divPainel.innerHTML = '';

                colunaEsq = document.createElement('div');
                colunaEsq.className = 'eproc-coluna-independente eproc-coluna-esq';

                colunaDir = document.createElement('div');
                colunaDir.className = 'eproc-coluna-independente eproc-coluna-dir';

                divPainel.appendChild(colunaEsq);
                divPainel.appendChild(colunaDir);

                const mapaColunas = getSalvos(STORAGE_COLUNAS);

                blocosIniciais.forEach((bloco, idx) => {
                    const titulo = getTituloBloco(bloco);
                    const destinoSalvo = mapaColunas[titulo];

                    if (destinoSalvo === 'dir') {
                        colunaDir.appendChild(bloco);
                    } else if (destinoSalvo === 'esq') {
                        colunaEsq.appendChild(bloco);
                    } else {
                        if (idx % 2 === 0) colunaEsq.appendChild(bloco);
                        else colunaDir.appendChild(bloco);
                    }
                });
            }

            function ajustarCentralizacaoVertical() {
                colunaEsq.style.marginTop = '0px';
                colunaDir.style.marginTop = '0px';

                const alturaEsq = colunaEsq.offsetHeight;
                const alturaDir = colunaDir.offsetHeight;
                const diff = Math.abs(alturaEsq - alturaDir);

                if (diff > 100) {
                    if (alturaEsq < alturaDir) {
                        colunaEsq.style.marginTop = (diff / 2) + 'px';
                    } else {
                        colunaDir.style.marginTop = (diff / 2) + 'px';
                    }
                }
            }

            function gerenciarBlocos() {
                const ocultosSalvos = getSalvos(STORAGE_OCULTOS);
                const mapaColunas = getSalvos(STORAGE_COLUNAS);
                const blocos = document.querySelectorAll('#divPainel fieldset, #blocoOcultosBody fieldset');

                blocos.forEach((bloco) => {
                    const titulo = getTituloBloco(bloco);
                    if (!titulo) return;

                    const legend = bloco.querySelector('legend');
                    if (!legend) return;

                    if (mapaColunas[titulo] === 'dir' && bloco.parentElement === colunaEsq) {
                        colunaDir.appendChild(bloco);
                    } else if (mapaColunas[titulo] === 'esq' && bloco.parentElement === colunaDir) {
                        colunaEsq.appendChild(bloco);
                    }

                    // Preserva o botao Reordenar original do AZFlow (oculto) para que a toolbar possa aciona-lo se necessario
                    const btnAzflowOriginal = bloco.querySelector('.azflow-botao-reordenar:not(#btnReordenarToolbarCustom):not(.btn-trocar-coluna-custom)');
                    if (btnAzflowOriginal) {
                        btnAzflowOriginal.classList.add('azflow-botao-reordenar-original');
                        btnAzflowOriginal.style.display = 'none';
                    }

                    // Botao dedicado apenas a trocar a coluna (sem acionar a reordenacao do AZFlow)
                    let btnTrocar = bloco.querySelector('.btn-trocar-coluna-custom');
                    if (!btnTrocar) {
                        btnTrocar = document.createElement('a');
                        btnTrocar.className = 'btn-trocar-coluna-custom';
                        btnTrocar.title = 'Trocar de Coluna (Esquerda / Direita)';
                        btnTrocar.role = 'button';
                        btnTrocar.tabIndex = 0;
                        btnTrocar.innerHTML = `
                            <div style="width: 10px; height: 10px; display: flex; align-items: center; justify-content: center;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;"><path d="m3 16 4 4 4-4"></path><path d="M7 20V4"></path><path d="m21 8-4-4-4 4"></path><path d="M17 4v16"></path></svg>
                            </div>
                        `;
                        legend.appendChild(btnTrocar);

                        btnTrocar.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            if (bloco.parentElement === bodyOcultos) return;

                            let colunasMap = getSalvos(STORAGE_COLUNAS);
                            if (bloco.parentElement === colunaEsq) {
                                colunaDir.appendChild(bloco);
                                colunasMap[titulo] = 'dir';
                            } else {
                                colunaEsq.appendChild(bloco);
                                colunasMap[titulo] = 'esq';
                            }
                            setSalvos(STORAGE_COLUNAS, colunasMap);
                            setTimeout(ajustarCentralizacaoVertical, 50);
                        });
                    } else {
                        // Garante que nao tenha classe do AZFlow associada
                        btnTrocar.classList.remove('azflow-botao-reordenar');
                    }

                    let btnOcultar = bloco.querySelector('.btn-ocultar-item');
                    if (!btnOcultar) {
                        btnOcultar = document.createElement('button');
                        btnOcultar.type = 'button';
                        btnOcultar.className = 'btn-ocultar-item';

                        if (ocultosSalvos.includes(titulo)) {
                            btnOcultar.textContent = 'Restaurar';
                            btnOcultar.title = 'Restaurar para o painel principal';
                        } else {
                            btnOcultar.textContent = 'Ocultar';
                            btnOcultar.title = 'Mover para o painel de ocultos';
                        }

                        legend.appendChild(btnOcultar);

                        btnOcultar.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            let listaOcultos = getSalvos(STORAGE_OCULTOS);
                            if (bloco.parentElement !== bodyOcultos) {
                                bodyOcultos.appendChild(bloco);
                                btnOcultar.textContent = 'Restaurar';
                                btnOcultar.title = 'Restaurar para o painel principal';
                                if (!listaOcultos.includes(titulo)) listaOcultos.push(titulo);
                            } else {
                                const destino = mapaColunas[titulo] || 'esq';
                                if (destino === 'dir') colunaDir.appendChild(bloco);
                                else colunaEsq.appendChild(bloco);

                                btnOcultar.textContent = 'Ocultar';
                                btnOcultar.title = 'Mover para o painel de ocultos';
                                listaOcultos = listaOcultos.filter(t => t !== titulo);
                            }
                            setSalvos(STORAGE_OCULTOS, listaOcultos);
                            atualizarContador();
                            setTimeout(ajustarCentralizacaoVertical, 50);
                        });
                    }

                    if (ocultosSalvos.includes(titulo) && bloco.parentElement !== bodyOcultos) {
                        bodyOcultos.appendChild(bloco);
                        if (btnOcultar) {
                            btnOcultar.textContent = 'Restaurar';
                            btnOcultar.title = 'Restaurar para o painel principal';
                        }
                    }
                });

                atualizarContador();
                normalizarLinksParaMesmaAba();
                setTimeout(ajustarCentralizacaoVertical, 50);
            }

            gerenciarBlocos();

            if (!window.__eprocAtualizadoInicialmente) {
                window.__eprocAtualizadoInicialmente = true;
                setTimeout(() => {
                    acionarAtualizarTudo();
                }, 500);
            }

            let timeout;
            const observer = new MutationObserver(() => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    gerenciarBlocos();
                }, 200);
            });

            observer.observe(divPainel, { childList: true, subtree: true });
        }

        let tentativas = 0;
        function tentarIniciarPainel() {
            const divPainel = document.getElementById('divPainel');
            if (divPainel) {
                iniciarPainel();
            } else if (tentativas < 25) {
                tentativas++;
                setTimeout(tentarIniciarPainel, 250);
            }
        }

        tentarIniciarPainel();
    }
};
