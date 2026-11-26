// Árvore - AutoMarca (camada: host; mundo isolado 1110, só na tela da árvore de documentos: acao=arvore_documento_listar).
// Chave em CFG > Configurações ("Árvore - AutoMarca", arvoreAutomarca). Parte nativa do módulo arvore_automarca da extensão
// (extensao-superproc/modules/arvore/arvore_automarca.js): mesmo comportamento, mesmos termos (localStorage do eproc:
// eproc_automarca_keywords) e mesmos botões. Na barra do intervalo de eventos entram ☑ (marca com um clique os documentos-chave;
// passar o mouse abre 6 meses / 1 ano / 2 anos / 3 anos / 5 anos / Informar período e ⚙ Configurar; botão direito edita os termos)
// e ⌕ (marca por termo e período). Se a extensão também estiver instalada, o botão ☑ existente impede a duplicação.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spArvoreAutomarca) return;
window.__spArvoreAutomarca = true;
if (new URLSearchParams(location.search).get('acao') !== 'arvore_documento_listar') return;

    const STORAGE_KEY = 'eproc_automarca_keywords';
    const palavrasPadrao = ["Petição","Contestação","Réplica","Alegações","Rol De Testemunhas","Embargos de Declaração","Despacho","Sentença","nomeação de bens","exceção de pré","resposta","emenda","parecer","Impugnação","Embargos"];

    function getKeywords() {
        try {
            const val = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('keywords');
            return val ? JSON.parse(val) : palavrasPadrao;
        } catch (e) {
            return palavrasPadrao;
        }
    }

    function setKeywords(arr) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
            localStorage.setItem('keywords', JSON.stringify(arr));
        } catch (e) {}
    }

    function abrirConfiguracaoPalavras() {
        const modalExistente = document.getElementById("modal-automarca-gerenciador");
        if (modalExistente) modalExistente.remove();
        const backdropExistente = document.getElementById("modal-automarca-backdrop");
        if (backdropExistente) backdropExistente.remove();

        let termosAtivos = [...getKeywords()];
        let termoEmEdicao = null;

        const modal = document.createElement("div");
        modal.id = "modal-automarca-gerenciador";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ffffff;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 999999999;
            width: 420px;
            max-width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-sizing: border-box;
        `;

        modal.innerHTML = `
            <style>
                .btn-automarca-acao:hover:not(:disabled) {
                    background-color: #e9ecef !important;
                }
            </style>
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 16px; border-bottom: 1px solid #dee2e6;">
                <span style="font-weight: bold; font-size: 15px; color: #212529;">Configurar Termos de AutoMarca</span>
                <button id="modal-automarca-close" style="background:transparent; border:none; font-size: 18px; cursor:pointer; color:#888; padding: 0 4px; line-height: 1;">✕</button>
            </div>

            <div style="padding: 14px 16px; overflow-y: auto; flex: 1; position: relative;">
                <div style="background: #f1f3f5; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;">
                    <label id="lbl-termo-automarca" style="font-size: 12px; font-weight: 600; color: #495057; display: block; margin-bottom: 4px;">ADICIONAR TERMO / EXPRESSÃO:</label>
                    <input type="text" id="in-novo-termo-automarca" placeholder="Ex: petição, contestação, sentença..." style="width: 100%; box-sizing: border-box; padding: 7px 9px; font-size: 13px; border: 1px solid #ced4da; border-radius: 4px; outline: none;">

                    <button id="btn-add-termo-automarca" style="margin-top: 10px; width: 100%; padding: 8px; background: #28a745; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; transition: background 0.15s;">+ ADICIONAR TERMO</button>
                    <button id="btn-cancel-edit-automarca" type="button" style="display: none; margin-top: 6px; width: 100%; padding: 6px; background: #6c757d; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 11px; cursor: pointer;">✕ CANCELAR EDIÇÃO</button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 12px; font-weight: bold; color: #495057;">TERMOS ATIVOS:</span>
                    <span id="qtd-termos-automarca" style="font-size: 11px; color: #6c757d;"></span>
                </div>
                <div id="lista-termos-automarca" style="max-height: 250px; overflow-y: auto; padding-right: 4px;"></div>
            </div>

            <div style="padding: 10px 16px; border-top: 1px solid #dee2e6; text-align: right; background: #fafafa; border-radius: 0 0 10px 10px;">
                <button id="btn-fechar-modal-automarca" style="padding: 6px 14px; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 500;">Fechar</button>
            </div>
        `;

        document.body.appendChild(modal);

        const backdrop = document.createElement("div");
        backdrop.id = "modal-automarca-backdrop";
        Object.assign(backdrop.style, {
            position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
            background: "rgba(0,0,0,0.4)", zIndex: "999999998"
        });
        document.body.appendChild(backdrop);

        const inputTermo = modal.querySelector("#in-novo-termo-automarca");
        const lblTermo = modal.querySelector("#lbl-termo-automarca");
        const btnAdd = modal.querySelector("#btn-add-termo-automarca");
        const btnCancel = modal.querySelector("#btn-cancel-edit-automarca");
        const containerLista = modal.querySelector("#lista-termos-automarca");
        const spanQtd = modal.querySelector("#qtd-termos-automarca");

        const fecharModal = () => {
            document.removeEventListener("keydown", onKeyDownEsc);
            modal.remove();
            backdrop.remove();
        };

        const onKeyDownEsc = (e) => {
            if (e.key === "Escape") {
                if (termoEmEdicao) {
                    cancelarEdicao();
                } else {
                    fecharModal();
                }
            }
        };
        document.addEventListener("keydown", onKeyDownEsc);

        modal.querySelector("#modal-automarca-close").onclick = fecharModal;
        modal.querySelector("#btn-fechar-modal-automarca").onclick = fecharModal;
        backdrop.onclick = fecharModal;

        function renderLista() {
            containerLista.innerHTML = "";
            spanQtd.textContent = `${termosAtivos.length} termo(s)`;

            if (termosAtivos.length === 0) {
                containerLista.innerHTML = `<div style="text-align: center; color: #888; padding: 15px; font-size: 13px;">Nenhum termo cadastrado.</div>`;
                return;
            }

            termosAtivos.forEach((termo, idx) => {
                const isEditing = termoEmEdicao === termo;
                const item = document.createElement("div");
                Object.assign(item.style, {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    margin: "4px 0",
                    borderRadius: "6px",
                    backgroundColor: isEditing ? "#e0f2fe" : "#f8f9fa",
                    border: isEditing ? "1px solid #7dd3fc" : "1px solid #e9ecef",
                    gap: "8px",
                    transition: "all 0.15s ease"
                });

                item.innerHTML = `
                    <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span style="font-size: 13px; font-weight: 500; color: #333;" title="${termo}">${termo}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                        <button type="button" class="btn-edit-termo btn-automarca-acao" data-index="${idx}" style="background: #fff; border: 1px solid #ced4da; color: #0284c7; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1.2;" title="Editar termo">✎</button>
                        <button type="button" class="btn-del-termo btn-automarca-acao" data-index="${idx}" style="background: #fff; border: 1px solid #ced4da; color: #dc3545; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1.2;" title="Remover termo">✖</button>
                    </div>
                `;

                item.querySelector(".btn-edit-termo").onclick = (e) => {
                    e.stopPropagation();
                    iniciarEdicao(termo);
                };

                item.querySelector(".btn-del-termo").onclick = (e) => {
                    e.stopPropagation();
                    if (termoEmEdicao === termo) {
                        cancelarEdicao();
                    }
                    termosAtivos.splice(idx, 1);
                    setKeywords(termosAtivos);
                    renderLista();
                };

                containerLista.appendChild(item);
            });
        }

        function iniciarEdicao(termo) {
            termoEmEdicao = termo;
            inputTermo.value = termo;
            lblTermo.textContent = `EDITANDO TERMO: "${termo}"`;
            btnAdd.textContent = "✓ SALVAR ALTERAÇÃO";
            btnAdd.style.background = "#0066CC";
            btnCancel.style.display = "block";
            inputTermo.focus();
            inputTermo.select();
            renderLista();
        }

        function cancelarEdicao() {
            termoEmEdicao = null;
            inputTermo.value = "";
            lblTermo.textContent = "ADICIONAR TERMO / EXPRESSÃO:";
            btnAdd.textContent = "+ ADICIONAR TERMO";
            btnAdd.style.background = "#28a745";
            btnCancel.style.display = "none";
            renderLista();
        }

        btnCancel.onclick = cancelarEdicao;

        inputTermo.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnAdd.click();
            }
        };

        btnAdd.onclick = () => {
            const termo = inputTermo.value.trim();
            if (!termo) {
                inputTermo.focus();
                return;
            }

            if (termoEmEdicao) {
                const idx = termosAtivos.indexOf(termoEmEdicao);
                if (idx !== -1) {
                    termosAtivos[idx] = termo;
                } else {
                    termosAtivos.push(termo);
                }
                cancelarEdicao();
            } else {
                if (!termosAtivos.includes(termo)) {
                    termosAtivos.push(termo);
                }
                inputTermo.value = "";
            }

            setKeywords(termosAtivos);
            renderLista();
            inputTermo.focus();
        };

        renderLista();
        setTimeout(() => inputTermo.focus(), 50);
    }

    function normalizarTexto(txt) {
        return (txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function extrairDataDoEvento(liDocumento) {
        const eventoPai = liDocumento.closest('li[evento="true"]');
        if (!eventoPai) return null;

        const linkEvento = eventoPai.querySelector('a.jstree-anchor');
        if (!linkEvento) return null;

        const match = linkEvento.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
            return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
        }
        return null;
    }

    function extrairNumeroDoEvento(liDocumento) {
        const eventoPai = liDocumento.closest('li[evento="true"]');
        const linkEvento = eventoPai?.querySelector('a.jstree-anchor');
        const match = linkEvento?.textContent.match(/\((\d+)\)/);
        if (!match) return null;
        const numero = Number(match[1]);
        return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
    }

    function marcarPorPalavras(meses = null, dataInicial = null, dataFinal = null, eventoInicial = null, eventoFinal = null) {
        const palavras = getKeywords();
        const nodes = document.querySelectorAll("#divArvore li[role='none']");
        let marcados = 0;

        let dataLimite = dataInicial;
        if (meses !== null) {
            dataLimite = new Date();
            dataLimite.setMonth(dataLimite.getMonth() - meses);
        }

        nodes.forEach(li => {
            const span = li.querySelector("span") || li.querySelector("a.jstree-anchor");
            const checkbox = li.querySelector("i.jstree-checkbox");

            if (!span || !checkbox || li.getAttribute("evento") === "true") return;

            if (dataLimite || dataFinal) {
                const dataDocumento = extrairDataDoEvento(li);
                if (!dataDocumento || (dataLimite && dataDocumento < dataLimite) || (dataFinal && dataDocumento > dataFinal)) return;
            }

            if (eventoInicial !== null || eventoFinal !== null) {
                const numeroEvento = extrairNumeroDoEvento(li);
                if (numeroEvento === null || (eventoInicial !== null && numeroEvento < eventoInicial) || (eventoFinal !== null && numeroEvento > eventoFinal)) return;
            }

            const texto = normalizarTexto(span.textContent);
            if (palavras.some(p => texto.includes(normalizarTexto(p)))) {
                if (!li.classList.contains("jstree-checked")) {
                    checkbox.click();
                    marcados++;
                }
            }
        });
        return marcados;
    }

    function parseDataBrasileira(valor) {
        const match = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;
        const data = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        return data.getFullYear() === Number(match[3]) && data.getMonth() === Number(match[2]) - 1 && data.getDate() === Number(match[1]) ? data : null;
    }

    // Datas aceitas: dd/mm/aaaa, dd.mm.aaaa, dd-mm-aaaa, "dd mm aaaa" ou ddmmaaaa (mesmo separador nos dois pontos).
    // Data válida é exibida sempre como dd/mm/aaaa; o resto fica como digitado.
    function formatarLimitePeriodo(valor) {
        const texto = String(valor || '').trim();
        const match = texto.match(/^(\d{2})([./\- ]?)(\d{2})\2(\d{4})$/);
        if (!match) return texto;
        const data = `${match[1]}/${match[3]}/${match[4]}`;
        return parseDataBrasileira(data) ? data : texto;
    }

    // Evento: só dígitos e menos dígitos que uma data (até 7). Oito dígitos sem data válida é erro.
    function parseLimitePeriodo(valor) {
        const texto = formatarLimitePeriodo(valor);
        const data = parseDataBrasileira(texto);
        if (data) return { tipo: 'data', valor: data };
        if (!/^\d{1,7}$/.test(texto)) return null;
        const numero = Number(texto);
        return numero > 0 ? { tipo: 'evento', valor: numero } : null;
    }

    function validarIntervaloPeriodo(valorInicial, valorFinal) {
        const textoInicial = String(valorInicial || '').trim();
        const textoFinal = String(valorFinal || '').trim();
        const inicio = textoInicial ? parseLimitePeriodo(textoInicial) : null;
        const fim = textoFinal ? parseLimitePeriodo(textoFinal) : null;
        if ((textoInicial && !inicio) || (textoFinal && !fim)) return { erro: 'Informe uma data válida ou um número de evento em cada limite preenchido.' };
        if (inicio && fim && inicio.tipo !== fim.tipo) return { erro: 'Use datas nos dois campos ou eventos nos dois campos.' };
        if (inicio && fim && inicio.valor > fim.valor) return { erro: 'O limite inicial deve ser anterior ou igual ao final.' };
        return { tipo: (inicio || fim)?.tipo || null, inicio: inicio?.valor ?? null, fim: fim?.valor ?? null };
    }

    // Normaliza a data para dd/mm/aaaa assim que ela fica completa, preservando o cursor.
    function ligarFormatacaoLimite(input) {
        const aplicar = () => {
            const anterior = input.value;
            const formatado = formatarLimitePeriodo(anterior);
            if (formatado === anterior) return;
            const posicao = input.selectionStart;
            input.value = formatado;
            if (posicao === null || posicao === undefined) return;
            const novaPosicao = /^\d{8}$/.test(anterior.trim())
                ? posicao + (posicao >= 2 ? 1 : 0) + (posicao >= 4 ? 1 : 0)
                : Math.min(posicao, formatado.length);
            input.setSelectionRange(novaPosicao, novaPosicao);
        };
        input.addEventListener('input', aplicar);
        input.addEventListener('blur', aplicar);
    }

    // intervalo = retorno de validarIntervaloPeriodo (tipo 'data', 'evento' ou null).
    function marcarPorTermoEPeriodo(termo, intervalo = {}) {
        const termoNormalizado = normalizarTexto(termo).trim();
        if (!termoNormalizado) return 0;
        const { tipo = null, inicio = null, fim = null } = intervalo || {};
        const filtrar = tipo !== null && (inicio !== null || fim !== null);
        let marcados = 0;
        document.querySelectorAll("#divArvore li[role='none']").forEach((li) => {
            const span = li.querySelector("span") || li.querySelector("a.jstree-anchor");
            const checkbox = li.querySelector("i.jstree-checkbox");
            if (!span || !checkbox || li.getAttribute("evento") === "true") return;

            if (filtrar) {
                const referencia = tipo === 'data' ? extrairDataDoEvento(li) : extrairNumeroDoEvento(li);
                if (referencia === null) return;
                if (inicio !== null && referencia < inicio) return;
                if (fim !== null && referencia > fim) return;
            }
            if (normalizarTexto(span.textContent).includes(termoNormalizado) && !li.classList.contains("jstree-checked")) {
                checkbox.click();
                marcados++;
            }
        });
        return marcados;
    }

    // Painel compacto, associado ao botão e sem bloquear a árvore.
    // O formulário abre por hover, como o AutoMarca principal.
    function criarPainelMarcacaoPersonalizada(botao, feedbackVisual) {
        document.getElementById('automarca-personalizada-popover')?.remove();

        const painel = document.createElement('div');
        painel.id = 'automarca-personalizada-popover';
        painel.style.cssText = 'display:none;position:fixed;z-index:999999999;width:314px;max-width:calc(100vw - 16px);padding:7px 8px;background:#fff;border:1px solid #8da3b4;border-radius:5px;box-shadow:0 -5px 17px rgba(0,0,0,.28);font-family:Segoe UI,Arial,sans-serif;color:#24313f;box-sizing:border-box;';
        painel.innerHTML = `
            <form style="margin:0;display:flex;flex-direction:column;gap:5px;">
                <div style="display:flex;align-items:center;gap:5px;">
                    <label for="automarca-termo-personalizado" style="font-size:11px;font-weight:700;white-space:nowrap;">Termo:</label>
                    <input id="automarca-termo-personalizado" type="text" autocomplete="off" placeholder="Ex.: petição" style="min-width:0;flex:1;height:27px;padding:4px 7px;border:2px solid #f0a000;border-radius:5px;font-size:12px;box-sizing:border-box;outline:none;">
                </div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <label for="automarca-data-inicial" title="Data (dd/mm/aaaa, dd.mm.aaaa, dd-mm-aaaa ou ddmmaaaa) ou número do evento" style="font-size:11px;font-weight:700;white-space:nowrap;">Período:</label>
                    <input id="automarca-data-inicial" type="text" inputmode="numeric" maxlength="10" placeholder="data/evento" title="Data ou número do evento inicial" style="width:80px;min-width:0;height:27px;padding:4px 5px;border:1px solid #b9c5cf;border-radius:5px;font-size:11px;box-sizing:border-box;">
                    <span style="font-size:11px;color:#667788;">a</span>
                    <input id="automarca-data-final" type="text" inputmode="numeric" maxlength="10" placeholder="data/evento" title="Data ou número do evento final" style="width:80px;min-width:0;height:27px;padding:4px 5px;border:1px solid #b9c5cf;border-radius:5px;font-size:11px;box-sizing:border-box;">
                    <button type="submit" style="height:27px;padding:0 9px;border:0;background:#0874a5;color:#fff;border-radius:5px;cursor:pointer;font-weight:700;font-size:11px;">MARCAR</button>
                </div>
                <div id="automarca-personalizada-erro" style="display:none;color:#ba2020;font-size:10px;line-height:1.2;"></div>
            </form>`;
        document.body.appendChild(painel);

        const termo = painel.querySelector('#automarca-termo-personalizado');
        const inicio = painel.querySelector('#automarca-data-inicial');
        const fim = painel.querySelector('#automarca-data-final');
        const erro = painel.querySelector('#automarca-personalizada-erro');
        [inicio, fim].forEach(ligarFormatacaoLimite);
        let timerFechamento = null;
        let timerAbertura = null;
        // Mesmo atraso do menu de datas pré-definidas: passagens rápidas do mouse não abrem o painel.
        const ATRASO_HOVER_MS = 300;
        // Ao sair do botão o mouse tem 2 s para alcançar o painel; ao sair do painel ele fecha.
        const ATRASO_ALCANCAR_PAINEL_MS = 2000;
        const ATRASO_SAIR_PAINEL_MS = 150;

        const posicionar = () => {
            const rect = botao.getBoundingClientRect();
            const largura = painel.offsetWidth || 314;
            painel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - largura - 8))}px`;
            painel.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 5)}px`;
            painel.style.top = 'auto';
        };
        const mostrar = (focar) => {
            clearTimeout(timerAbertura);
            clearTimeout(timerFechamento);
            painel.style.display = 'block';
            posicionar();
            if (focar) setTimeout(() => {
                if (painel.isConnected && painel.style.display !== 'none') termo.focus({ preventScroll: true });
            }, 0);
        };
        const mostrarComAtraso = (focar) => {
            clearTimeout(timerFechamento);
            clearTimeout(timerAbertura);
            timerAbertura = setTimeout(() => mostrar(focar), ATRASO_HOVER_MS);
        };
        const esconder = () => {
            clearTimeout(timerAbertura);
            clearTimeout(timerFechamento);
            if (painel.contains(document.activeElement)) document.activeElement.blur();
            painel.style.display = 'none';
        };
        const agendarFechamento = (atraso) => {
            clearTimeout(timerAbertura);
            clearTimeout(timerFechamento);
            timerFechamento = setTimeout(esconder, atraso);
        };
        const aoSairDoBotao = () => agendarFechamento(ATRASO_ALCANCAR_PAINEL_MS);
        const aoSairDoPainel = () => agendarFechamento(ATRASO_SAIR_PAINEL_MS);

        painel.addEventListener('mouseenter', () => clearTimeout(timerFechamento));
        painel.addEventListener('mouseleave', aoSairDoPainel);
        // Clique/foco fora do painel (mouse não está sobre ele) também fecha.
        painel.addEventListener('focusout', () => setTimeout(() => {
            if (!painel.contains(document.activeElement) && !painel.matches(':hover')) aoSairDoPainel();
        }, 0));
        window.addEventListener('resize', () => { if (painel.style.display !== 'none') posicionar(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') esconder(); });

        const formulario = painel.querySelector('form');
        formulario.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            formulario.requestSubmit();
        });
        formulario.onsubmit = (event) => {
            event.preventDefault();
            event.stopPropagation();
            [inicio, fim].forEach(campo => { campo.value = formatarLimitePeriodo(campo.value); });
            const intervalo = validarIntervaloPeriodo(inicio.value, fim.value);
            const mensagem = !termo.value.trim() ? 'Informe um termo para marcar.' : (intervalo.erro || '');
            if (mensagem) { erro.textContent = mensagem; erro.style.display = 'block'; return; }
            erro.style.display = 'none';
            const total = marcarPorTermoEPeriodo(termo.value, intervalo);
            esconder();
            feedbackVisual(total);
        };
        return { mostrar, mostrarComAtraso, aoSairDoBotao, aoSairDoPainel, esconder };
    }

    function injetarBotao() {
        const container = document.getElementById("divIntervaloEvento");
        if (!container || container.querySelector(".btn-marcar-rapido-icon")) return false;

        // 1. COMPRESSÃO DOS ELEMENTOS NATIVOS
        if (!container.querySelector("#btn-toggle-nativos")) {
            const lblEventos = container.querySelector('label');
            const inputIni = document.getElementById("seqEventoInicio");
            const lblA = container.querySelectorAll('label')[1];
            const inputFim = document.getElementById("seqEventoFim");
            const btnMarcar = container.querySelector('a[onclick*="marcarIntervaloEvento"]');

            if (inputIni && inputFim && btnMarcar) {
                const wrapper = document.createElement("span");
                wrapper.id = "wrapper-nativos-eproc";
                wrapper.style.cssText = "display: none; align-items: center; gap: 4px; margin-right: 4px;";

                if (lblEventos) wrapper.appendChild(lblEventos);
                wrapper.appendChild(inputIni);
                if (lblA) wrapper.appendChild(lblA);
                wrapper.appendChild(inputFim);
                wrapper.appendChild(btnMarcar);

                const btnToggle = document.createElement("a");
                btnToggle.id = "btn-toggle-nativos";
                btnToggle.href = "javascript:void(0);";
                btnToggle.className = "infraButton azflow-tree-interval-btn";
                btnToggle.title = "Filtro nativo de eventos";
                btnToggle.innerHTML = `<span class="azflow-tree-interval-text">&gt;</span>`;
                btnToggle.style.cssText = `
                    margin-right: 4px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background-color: rgba(255, 255, 255, 0.1) !important;
                    color: rgba(229, 231, 235, 0.72) !important;
                    border: 1px solid rgba(255, 255, 255, 0.22) !important;
                    border-radius: 8px !important;
                    font-weight: bold !important;
                    padding: 0 8px !important;
                    height: 27px !important;
                    text-decoration: none !important;
                    cursor: pointer !important;
                `;

                btnToggle.addEventListener("click", (e) => {
                    e.preventDefault();
                    if (wrapper.style.display === "none") {
                        wrapper.style.display = "inline-flex";
                        btnToggle.innerHTML = `<span class="azflow-tree-interval-text">&lt;</span>`;
                    } else {
                        wrapper.style.display = "none";
                        btnToggle.innerHTML = `<span class="azflow-tree-interval-text">&gt;</span>`;
                    }
                });

                container.prepend(wrapper);
                container.prepend(btnToggle);
            }
        }

        // 2. BOTÃO COMPACTO SÓ O ÍCONE [☑]
        const btnIcone = document.createElement("a");
        btnIcone.href = "javascript:void(0);";
        btnIcone.className = "infraButton azflow-tree-interval-btn btn-marcar-rapido-icon";
        
        btnIcone.style.cssText = `
            margin-right: 4px !important;
            margin-left: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            background-color: rgba(255, 255, 255, 0.1) !important;
            color: rgba(229, 231, 235, 0.9) !important;
            border: 1px solid rgba(255, 255, 255, 0.22) !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            width: 27px !important;
            height: 27px !important;
            min-width: 27px !important;
            padding: 0 !important;
            box-shadow: rgba(0, 0, 0, 0.22) 0px 1px 1px 0px inset !important;
            text-decoration: none !important;
            cursor: pointer !important;
            box-sizing: border-box !important;
            transition: background-color 0.15s ease, color 0.15s ease !important;
        `;
        btnIcone.innerHTML = `<span class="btn-text" style="display:flex; align-items:center; justify-content:center;">☑</span>`;

        btnIcone.onmouseover = () => {
            btnIcone.style.backgroundColor = "rgba(255, 255, 255, 0.25) !important";
            btnIcone.style.color = "#ffffff !important";
        };
        btnIcone.onmouseout = () => {
            btnIcone.style.backgroundColor = "rgba(255, 255, 255, 0.1) !important";
            btnIcone.style.color = "rgba(229, 231, 235, 0.9) !important";
        };

        function feedbackVisual(qtd) {
            const span = btnIcone.querySelector('.btn-text');
            span.textContent = qtd;
            btnIcone.style.fontSize = "11px";
            setTimeout(() => {
                span.textContent = "☑";
                btnIcone.style.fontSize = "13px";
            }, 1400);
        }

        btnIcone.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const total = marcarPorPalavras(null);
            feedbackVisual(total);
        });

        btnIcone.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            abrirConfiguracaoPalavras();
        });

        // Marcação avulsa: usa o mesmo mecanismo do botão principal, mas
        // permite informar um termo e, opcionalmente, o intervalo de datas.
        const btnPersonalizado = document.createElement("a");
        btnPersonalizado.href = "javascript:void(0);";
        btnPersonalizado.className = "infraButton azflow-tree-interval-btn btn-marcar-personalizado-icon";
        btnPersonalizado.title = "Marcar por termo e período";
        btnPersonalizado.style.cssText = btnIcone.style.cssText;
        btnPersonalizado.style.marginRight = "4px";
        btnPersonalizado.innerHTML = `<span class="btn-text" style="display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;">⌕</span>`;
        const painelPersonalizado = criarPainelMarcacaoPersonalizada(btnPersonalizado, feedbackVisual);
        btnPersonalizado.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            painelPersonalizado.mostrar(true);
        });
        btnPersonalizado.addEventListener("mouseenter", () => painelPersonalizado.mostrarComAtraso(true));
        btnPersonalizado.addEventListener("mouseleave", painelPersonalizado.aoSairDoBotao);

        // 3. MENU FLUTUANTE (FIXO NO BODY PARA FUGIR DE QUALQUER OVERFLOW)
        const menuDropdown = document.createElement("div");
        menuDropdown.id = "superproc-automarca-dropdown";
        menuDropdown.style.cssText = `
            display: none;
            position: fixed;
            background-color: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 8px;
            padding: 4px;
            min-width: 125px;
            box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.5);
            flex-direction: column;
            gap: 2px;
            z-index: 999999999;
        `;

        // Configurar no topo
        const itemConfig = document.createElement("a");
        itemConfig.href = "javascript:void(0);";
        itemConfig.innerHTML = `⚙ Configurar`;
        itemConfig.title = "Personalizar palavras-chave";
        itemConfig.style.cssText = `
            color: #38bdf8;
            padding: 5px 10px;
            font-size: 11px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-family: arial, verdana, helvetica, sans-serif;
        `;
        itemConfig.onmouseover = () => { itemConfig.style.backgroundColor = "rgba(56, 189, 248, 0.15)"; };
        itemConfig.onmouseout = () => { itemConfig.style.backgroundColor = "transparent"; };

        itemConfig.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            fecharMenuImediato();
            abrirConfiguracaoPalavras();
        });

        menuDropdown.appendChild(itemConfig);

        const divisor = document.createElement("div");
        divisor.style.cssText = "height: 1px; background-color: rgba(255, 255, 255, 0.15); margin: 3px 0;";
        menuDropdown.appendChild(divisor);

        // Ordem visual de cima para baixo: 6 Meses -> 5 Anos
        // O que significa que perto do botão (na base) fica "5 Anos"
        const opcoes = [
            { label: "6 Meses", meses: 6 },
            { label: "1 Ano", meses: 12 },
            { label: "2 Anos", meses: 24 },
            { label: "3 Anos", meses: 36 },
            { label: "5 Anos", meses: 60 },
            { label: "Informar período", personalizado: true }
        ];

        opcoes.forEach(opt => {
            const item = document.createElement("a");
            item.href = "javascript:void(0);";
            item.textContent = opt.label;
            item.style.cssText = `
                color: #cbd5e1;
                padding: 5px 10px;
                font-size: 11px;
                font-weight: 500;
                text-decoration: none;
                border-radius: 4px;
                display: block;
                cursor: pointer;
                font-family: arial, verdana, helvetica, sans-serif;
            `;
            item.onmouseover = () => { item.style.backgroundColor = "rgba(255, 255, 255, 0.15)"; item.style.color = "#fff"; };
            item.onmouseout = () => { item.style.backgroundColor = "transparent"; item.style.color = "#cbd5e1"; };

            item.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                fecharMenuImediato();
                if (opt.personalizado) {
                    abrirPeriodoPersonalizado();
                    return;
                }
                const total = marcarPorPalavras(opt.meses);
                feedbackVisual(total);
            });

            menuDropdown.appendChild(item);
        });

        document.body.appendChild(menuDropdown);

        function abrirPeriodoPersonalizado() {
            document.getElementById('automarca-periodo-personalizado')?.remove();
            const painel = document.createElement('form');
            painel.id = 'automarca-periodo-personalizado';
            painel.style.cssText = 'position:fixed;z-index:999999999;background:#fff;color:#334155;padding:10px;border:1px solid #b9c5cf;border-radius:6px;box-shadow:0 4px 15px #0004;font:12px Arial;max-width:calc(100vw - 20px);box-sizing:border-box';
            painel.innerHTML = '<div style="font-weight:bold;margin-bottom:8px">Informar período</div><div style="display:flex;align-items:center;gap:5px"><input name="inicio" aria-label="Data ou evento inicial" placeholder="Data ou evento" inputmode="numeric" maxlength="10" style="width:100px"><span>a</span><input name="fim" aria-label="Data ou evento final" placeholder="Data ou evento" inputmode="numeric" maxlength="10" style="width:100px"></div><div style="margin-top:5px;font-size:11px">Datas: dd/mm/aaaa, dd.mm.aaaa, dd-mm-aaaa ou 8 dígitos. Eventos: só o número.<br>Limites opcionais: esquerda = a partir de; direita = até.</div><div style="margin-top:8px"><button type="submit">MARCAR</button> <button type="button">Cancelar</button></div><div role="status" style="margin-top:5px;color:#ba2020"></div>';
            [painel.elements.inicio, painel.elements.fim].forEach(ligarFormatacaoLimite);
            document.body.appendChild(painel);
            const rect = btnIcone.getBoundingClientRect();
            painel.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - painel.offsetWidth - 10))}px`;
            painel.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            painel.querySelector('button[type="button"]').onclick = () => painel.remove();
            painel.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.stopPropagation(); painel.remove(); btnIcone.focus(); }
            });
            painel.onsubmit = event => {
                event.preventDefault();
                event.stopPropagation();
                const intervalo = validarIntervaloPeriodo(painel.elements.inicio.value, painel.elements.fim.value);
                const erro = painel.querySelector('[role="status"]');
                if (intervalo.erro) { erro.textContent = intervalo.erro; return; }
                const total = intervalo.tipo === 'data'
                    ? marcarPorPalavras(null, intervalo.inicio, intervalo.fim)
                    : marcarPorPalavras(null, null, null, intervalo.inicio, intervalo.fim);
                painel.remove();
                feedbackVisual(total);
            };
            painel.elements.inicio.focus();
        }

        // 4. POSICIONAMENTO PARA CIMA (BOTTOM DINÂMICO)
        let timerAbertura = null;
        let timerFechamento = null;

        function posicionarMenu() {
            const rect = btnIcone.getBoundingClientRect();
            menuDropdown.style.left = `${rect.left}px`;
            // Alinha a base do menu 4px acima do topo do botão
            menuDropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            menuDropdown.style.top = 'auto';
        }

        function abrirMenu() {
            clearTimeout(timerFechamento);
            clearTimeout(timerAbertura);
            timerAbertura = setTimeout(() => {
                posicionarMenu();
                menuDropdown.style.display = "flex";
            }, 300);
        }

        // Sair do botão: 2 s para o mouse alcançar o menu; sair do menu: fecha.
        function agendarFechamento(atraso) {
            clearTimeout(timerAbertura);
            clearTimeout(timerFechamento);
            timerFechamento = setTimeout(() => {
                menuDropdown.style.display = "none";
            }, atraso);
        }

        function fecharMenuImediato() {
            clearTimeout(timerAbertura);
            clearTimeout(timerFechamento);
            menuDropdown.style.display = "none";
        }

        // Fechamento: sair do botão é ultra rápido (só dá tempo de subir ao menu, 4px acima);
        // a zona do botão se estende um pouco à direita para tolerar desvios do mouse.
        // Sair do menu fecha um pouco mais devagar.
        const FECHAR_BOTAO_MS = 40;
        const FECHAR_MENU_MS = 450;
        const MARGEM_DIREITA_PX = 24;

        function dentroZonaBotao(x, y) {
            const r = btnIcone.getBoundingClientRect();
            return x >= r.left && x <= r.right + MARGEM_DIREITA_PX && y >= r.top && y <= r.bottom;
        }

        function vigiarZonaBotao(e) {
            if (menuDropdown.matches(':hover') || dentroZonaBotao(e.clientX, e.clientY)) {
                clearTimeout(timerFechamento);
                return;
            }
            document.removeEventListener("mousemove", vigiarZonaBotao, true);
            agendarFechamento(FECHAR_BOTAO_MS);
        }

        btnIcone.addEventListener("mouseenter", () => {
            document.removeEventListener("mousemove", vigiarZonaBotao, true);
            abrirMenu();
        });
        btnIcone.addEventListener("mouseleave", (e) => {
            if (dentroZonaBotao(e.clientX, e.clientY)) {
                // Saiu pela margem direita: continua vigiando até sair da zona estendida.
                document.addEventListener("mousemove", vigiarZonaBotao, true);
                return;
            }
            agendarFechamento(FECHAR_BOTAO_MS);
        });

        menuDropdown.addEventListener("mouseenter", () => {
            document.removeEventListener("mousemove", vigiarZonaBotao, true);
            clearTimeout(timerFechamento);
        });
        menuDropdown.addEventListener("mouseleave", () => agendarFechamento(FECHAR_MENU_MS));

        // Inserção no extremo esquerdo
        container.prepend(btnPersonalizado);
        container.prepend(btnIcone);
        return true;
    }

    // API entre mundos isolados: usa a mesma função do botão e confirma execução.
    if (!window.__superprocAutoMarcaBridge) {
        window.__superprocAutoMarcaBridge = true;
        document.addEventListener('superproc:automarca:run', event => {
            let id;
            try {
                const payload = JSON.parse(event.detail);
                id = payload.id;
                if (typeof id !== 'string' || id.length > 100) return;
                const months = payload.months ?? null;
                if (![null,60,36,24,12,6].includes(months)) throw new Error('Período de AutoMarca inválido.');
                const marked = marcarPorPalavras(months);
                document.dispatchEvent(new CustomEvent('superproc:automarca:result', { detail: JSON.stringify({ id, marked }) }));
            } catch (error) {
                document.dispatchEvent(new CustomEvent('superproc:automarca:result', { detail: JSON.stringify({ id, error: error.message }) }));
            }
        });
    }
    if (!injetarBotao()) {
        let debounceTimer;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                injetarBotao();
            }, 400);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
